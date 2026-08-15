#!/usr/bin/env bash
# ============================================================
# ADARE PLATFORM — end-to-end workflow tests (spec §48)
# Patient → book → track · Receptionist → confirm · Finance → verify
# Admin → users/audit · RBAC · lockout · CMS
# ============================================================
set -u
BASE="${1:-http://127.0.0.1:4000}"
PASS=0; FAIL=0
JP=$(mktemp) # patient cookies
JR=$(mktemp) # receptionist
JF=$(mktemp) # finance
JA=$(mktemp) # admin
JC=$(mktemp) # content manager

check() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "✗ FAIL  $1   ${3:-}"; fi; }
jv() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

# reset volatile data so the suite is repeatable
sudo -u postgres psql -d adare_platform -q <<'SQL'
DELETE FROM appointment_status_history; DELETE FROM payment_transactions;
DELETE FROM notifications; DELETE FROM appointments; DELETE FROM payments;
DELETE FROM contact_messages;
DELETE FROM news WHERE title LIKE 'CMS test article%';
DELETE FROM patients WHERE phone='0912345678';
DELETE FROM users WHERE username IN ('0912345678','labuser1');
UPDATE users SET failed_attempts=0, locked_until=NULL;
SQL

echo "=== 0. Health ==="
H=$(curl -s $BASE/api/health)
check "health endpoint" "$(echo "$H" | jv "['ok'] and 1 or 0")" "$H"

echo "=== 1. Public content APIs ==="
check "settings include hospital stats" "$(curl -s $BASE/api/settings | jv "['data']['settings']['stat_opd_attendances']" | grep -q 183759 && echo 1 || echo 0)"
check "departments list ≥10" "$(curl -s $BASE/api/departments | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin)['data']['departments'])>=10 else 0)")"
check "services search filter" "$(curl -s "$BASE/api/services?q=GeneXpert" | grep -q 'TB Screening' && echo 1 || echo 0)"
check "doctors directory ≥1" "$(curl -s $BASE/api/doctors | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin)['data']['doctors'])>=1 else 0)")"
check "leaders list has 6" "$(curl -s $BASE/api/leaders | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin)['data']['leaders'])==6 else 0)")"
check "news published article" "$(curl -s $BASE/api/news | grep -q 'digital platform' && echo 1 || echo 0)"
check "news article by slug" "$(curl -s $BASE/api/news/adare-platform-launch | jv "['ok'] and 1 or 0")"
check "health articles" "$(curl -s "$BASE/api/health-articles?category=maternal" | grep -q 'Antenatal' && echo 1 || echo 0)"
check "global search" "$(curl -s "$BASE/api/search?q=emergency" | grep -qi 'emergency' && echo 1 || echo 0)"
check "search validates min length" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/search?q=a" | grep -q 422 && echo 1 || echo 0)"

echo "=== 2. Patient registration & login ==="
R=$(curl -s -c $JP -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"full_name":"Sara Bekele","phone":"0912345678","password":"patientpass1","email":"sara@example.com"}')
PATNO=$(echo "$R" | jv "['data']['patient']['patient_number']")
PTOK=$(echo "$R" | jv "['data']['access_token']")
check "patient register → AGH-PAT number" "$(echo "$PATNO" | grep -q 'AGH-PAT-' && echo 1 || echo 0)" "$R"

R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"full_name":"Sara Again","phone":"0912345678","password":"patientpass1"}')
check "duplicate registration blocked (409)" "$(echo "$R" | jv "['code']" | grep -q DUPLICATE && echo 1 || echo 0)"

R=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"0912345678","password":"wrong"}')
check "wrong password rejected" "$(echo "$R" | jv "['code']" | grep -q INVALID_CREDENTIALS && echo 1 || echo 0)"

R=$(curl -s -c $JP -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"0912345678","password":"patientpass1"}')
PTOK=$(echo "$R" | jv "['data']['access_token']")
check "patient login" "$([ -n "$PTOK" ] && echo 1 || echo 0)"

R=$(curl -s -b $JP -X POST $BASE/api/auth/refresh)
check "refresh token rotation" "$(echo "$R" | jv "['ok'] and 1 or 0")"

echo "=== 3. Appointment lifecycle ==="
R=$(curl -s -X POST $BASE/api/appointments -H 'Content-Type: application/json' \
  -d '{"patient_name":"Sara Bekele","phone":"0912345678","department_id":2,"preferred_date":"2026-08-25","preferred_time":"Morning","reason":"Follow-up","insurance_type":"cbhi"}')
APT=$(echo "$R" | jv "['data']['appointment']['reference']")
check "appointment created → AGH-APT" "$(echo "$APT" | grep -q 'AGH-APT-' && echo 1 || echo 0)" "$R"

R=$(curl -s -X POST $BASE/api/appointments -H 'Content-Type: application/json' \
  -d '{"patient_name":"Sara Bekele","phone":"0912345678","department_id":2,"preferred_date":"2026-08-25","preferred_time":"Morning","reason":"Follow-up","insurance_type":"cbhi"}')
check "duplicate pending blocked (409)" "$(echo "$R" | jv "['code']" | grep -q DUPLICATE && echo 1 || echo 0)"

R=$(curl -s -X POST $BASE/api/appointments -H 'Content-Type: application/json' \
  -d '{"patient_name":"X","phone":"0911000000","preferred_date":"2020-01-01"}')
check "past date rejected (422)" "$(echo "$R" | jv "['code']" | grep -q VALIDATION && echo 1 || echo 0)"

R=$(curl -s "$BASE/api/appointments/status?reference=$APT&phone=0912345678")
check "public status = PENDING" "$(echo "$R" | jv "['data']['appointment']['status']" | grep -q PENDING && echo 1 || echo 0)"
check "wrong phone → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/appointments/status?reference=$APT&phone=0999999999" | grep -q 404 && echo 1 || echo 0)"

echo "=== 4. Staff auth & RBAC ==="
check "staff list without token → 401" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/appointments | grep -q 401 && echo 1 || echo 0)"
check "patient token cannot list appointments (403)" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PTOK" $BASE/api/appointments | grep -q 403 && echo 1 || echo 0)"

R=$(curl -s -c $JR -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"reception1","password":"AdareReception#2026"}')
RTOK=$(echo "$R" | jv "['data']['access_token']")
check "receptionist login" "$([ -n "$RTOK" ] && echo 1 || echo 0)"
check "receptionist sees new appointment" "$(curl -s -H "Authorization: Bearer $RTOK" "$BASE/api/appointments?status=PENDING" | grep -q "$APT" && echo 1 || echo 0)"
check "receptionist blocked from audit (403)" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $RTOK" $BASE/api/admin/audit | grep -q 403 && echo 1 || echo 0)"
check "receptionist blocked from user mgmt (403)" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $RTOK" $BASE/api/admin/users | grep -q 403 && echo 1 || echo 0)"

echo "=== 5. Receptionist workflow ==="
R=$(curl -s -X PATCH $BASE/api/appointments/$APT -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"action":"confirm","note":"Come at 8:30"}')
check "confirm appointment" "$(echo "$R" | jv "['data']['appointment']['status']" | grep -q CONFIRMED && echo 1 || echo 0)" "$R"
R=$(curl -s "$BASE/api/appointments/status?reference=$APT&phone=0912345678")
check "patient sees CONFIRMED" "$(echo "$R" | jv "['data']['appointment']['status']" | grep -q CONFIRMED && echo 1 || echo 0)"
R=$(curl -s -X PATCH $BASE/api/appointments/$APT -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"action":"confirm"}')
check "double-confirm blocked (409)" "$(echo "$R" | jv "['code']" | grep -q INVALID_TRANSITION && echo 1 || echo 0)"
R=$(curl -s -X PATCH $BASE/api/appointments/$APT -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"action":"reject"}')
check "reject without note blocked (422)" "$(echo "$R" | jv "['code']" | grep -q -E 'VALIDATION|INVALID_TRANSITION' && echo 1 || echo 0)"
curl -s -X PATCH $BASE/api/appointments/$APT -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"action":"checkin"}' > /dev/null
curl -s -X PATCH $BASE/api/appointments/$APT -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"action":"start"}' > /dev/null
R=$(curl -s -X PATCH $BASE/api/appointments/$APT -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"action":"complete"}')
check "checkin → start → complete" "$(echo "$R" | jv "['data']['appointment']['status']" | grep -q COMPLETED && echo 1 || echo 0)"
R=$(curl -s -H "Authorization: Bearer $RTOK" $BASE/api/appointments/$APT/history)
check "status history has 5 events" "$(echo "$R" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin)['data']['history'])==5 else 0)")" "$R"

echo "=== 6. Portal data ==="
R=$(curl -s -H "Authorization: Bearer $PTOK" $BASE/api/patients/me)
check "portal shows appointment" "$(echo "$R" | grep -q "$APT" && echo 1 || echo 0)"
check "portal has notifications" "$(echo "$R" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin)['data']['notifications'])>=1 else 0)")"
R=$(curl -s -X PATCH $BASE/api/patients/me -H "Authorization: Bearer $PTOK" -H 'Content-Type: application/json' -d '{"address":"Hawassa, Tabor"}')
check "patient updates profile" "$(echo "$R" | jv "['ok'] and 1 or 0")"

echo "=== 7. Payments ==="
R=$(curl -s -X POST $BASE/api/payments -H 'Content-Type: application/json' \
  -d "{\"payer_name\":\"Sara Bekele\",\"phone\":\"0912345678\",\"amount\":350.5,\"method\":\"telebirr\",\"provider_ref\":\"TB98765\",\"appointment_ref\":\"$APT\"}")
PAY=$(echo "$R" | jv "['data']['payment']['reference']")
check "payment created → AGH-PAY" "$(echo "$PAY" | grep -q 'AGH-PAY-' && echo 1 || echo 0)" "$R"
R=$(curl -s -X POST $BASE/api/payments -H 'Content-Type: application/json' \
  -d '{"payer_name":"X","phone":"0911","amount":10,"method":"telebirr","provider_ref":"TB98765"}')
check "duplicate provider_ref blocked (409)" "$(echo "$R" | jv "['code']" | grep -q -E 'DUPLICATE|VALIDATION' && echo 1 || echo 0)"
R=$(curl -s -X POST $BASE/api/payments -H 'Content-Type: application/json' \
  -d '{"payer_name":"X","phone":"0911000001","amount":10,"method":"bank_transfer"}')
check "bank transfer without ref rejected" "$(echo "$R" | jv "['code']" | grep -q VALIDATION && echo 1 || echo 0)"

R=$(curl -s -c $JF -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"finance1","password":"AdareFinance#2026"}')
FTOK=$(echo "$R" | jv "['data']['access_token']")
check "finance login" "$([ -n "$FTOK" ] && echo 1 || echo 0)"
check "finance sees pending payment" "$(curl -s -H "Authorization: Bearer $FTOK" "$BASE/api/payments?status=PENDING" | grep -q "$PAY" && echo 1 || echo 0)"
check "receptionist cannot verify payment (403)" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $BASE/api/payments/$PAY -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"status":"SUCCESSFUL"}' | grep -q 403 && echo 1 || echo 0)"
R=$(curl -s -X PATCH $BASE/api/payments/$PAY -H "Authorization: Bearer $FTOK" -H 'Content-Type: application/json' -d '{"status":"SUCCESSFUL","note":"Matched telebirr statement"}')
check "finance verifies payment" "$(echo "$R" | jv "['data']['payment']['status']" | grep -q SUCCESSFUL && echo 1 || echo 0)"
R=$(curl -s -X PATCH $BASE/api/payments/$PAY -H "Authorization: Bearer $FTOK" -H 'Content-Type: application/json' -d '{"status":"FAILED","note":"x"}')
check "re-verify blocked (409)" "$(echo "$R" | jv "['code']" | grep -q INVALID_TRANSITION && echo 1 || echo 0)"
check "summary shows revenue" "$(curl -s -H "Authorization: Bearer $FTOK" $BASE/api/payments/summary | jv "['data']['counts']['SUCCESSFUL']" | grep -qE '^[1-9]' && echo 1 || echo 0)"
check "CSV export" "$(curl -s -H "Authorization: Bearer $FTOK" $BASE/api/payments/export/csv | head -1 | grep -q 'Reference' && echo 1 || echo 0)"

echo "=== 8. Admin: dashboard, users, audit, CMS ==="
R=$(curl -s -c $JA -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"AdareAdmin#2026"}')
ATOK=$(echo "$R" | jv "['data']['access_token']")
check "admin login" "$([ -n "$ATOK" ] && echo 1 || echo 0)"
check "dashboard KPIs" "$(curl -s -H "Authorization: Bearer $ATOK" $BASE/api/admin/dashboard | jv "['data']['kpi']['total_patients']" | grep -qE '^[0-9]+$' && echo 1 || echo 0)"
R=$(curl -s -X POST $BASE/api/admin/users -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' \
  -d '{"username":"labuser1","full_name":"Lab User","role":"laboratory","password":"LabPass#2026x"}')
check "admin creates lab user" "$(echo "$R" | jv "['ok'] and 1 or 0")" "$R"
check "audit has APPOINTMENT_CONFIRMED" "$(curl -s -H "Authorization: Bearer $ATOK" "$BASE/api/admin/audit?action=APPOINTMENT_CONFIRMED" | grep -q "$APT" && echo 1 || echo 0)"
check "audit has PAYMENT_SUCCESSFUL" "$(curl -s -H "Authorization: Bearer $ATOK" "$BASE/api/admin/audit?action=PAYMENT_SUCCESSFUL" | grep -q "$PAY" && echo 1 || echo 0)"
R=$(curl -s -X PATCH $BASE/api/admin/settings -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"key":"stat_departments","value":"12"}')
check "admin updates setting" "$(echo "$R" | jv "['ok'] and 1 or 0")"

RUNTAG="cms$(date +%s)"
echo "=== 9. Content manager CMS ==="
R=$(curl -s -c $JC -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"content1","password":"AdareContent#2026"}')
CTOK=$(echo "$R" | jv "['data']['access_token']")
R=$(curl -s -X POST $BASE/api/admin/news -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
  -d "{\"title\":\"CMS test article $RUNTAG\",\"excerpt\":\"Free screening all week.\",\"body_html\":\"<p>Visit the TB clinic.</p><script>alert(1)</script>\",\"status\":\"DRAFT\"}")
NID=$(echo "$R" | jv "['data']['article']['id']")
check "content manager creates draft" "$([ -n "$NID" ] && echo 1 || echo 0)" "$R"
check "draft not visible publicly" "$(curl -s "$BASE/api/news?q=$RUNTAG" | jv "['data']['total']" | grep -q 0 && echo 1 || echo 0)"
curl -s -X PATCH $BASE/api/admin/news/$NID -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' -d '{"action":"publish"}' > /dev/null
check "published article visible" "$(curl -s "$BASE/api/news?q=$RUNTAG" | jv "['data']['total']" | grep -q 1 && echo 1 || echo 0)"
SLUG=$(curl -s "$BASE/api/news?q=$RUNTAG" | jv "['data']['news'][0]['slug']")
check "XSS script stripped from body" "$(curl -s "$BASE/api/news/$SLUG" | grep -qv '<script>' && echo 1 || echo 0)"
check "content mgr cannot verify payments (403)" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $BASE/api/payments/$PAY -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' -d '{"status":"REFUNDED"}' | grep -q 403 && echo 1 || echo 0)"

echo "=== 10. Contact form ==="
R=$(curl -s -X POST $BASE/api/contact -H 'Content-Type: application/json' \
  -d '{"name":"Visitor","message":"When is the eye clinic open?"}')
check "contact form saved" "$(echo "$R" | jv "['ok'] and 1 or 0")"
check "message in admin inbox" "$(curl -s -H "Authorization: Bearer $CTOK" $BASE/api/admin/contact-messages | grep -q 'eye clinic' && echo 1 || echo 0)"

echo "=== 11. Account lockout ==="
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"labuser1","password":"bad"}'
done
R=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"labuser1","password":"LabPass#2026x"}')
check "account locked after 5 failures (429)" "$(echo "$R" | jv "['code']" | grep -q ACCOUNT_LOCKED && echo 1 || echo 0)" "$R"

echo "=== 12. SPA serving ==="
check "SPA served at /" "$(curl -s $BASE/ | grep -q 'Adare General Hospital' && echo 1 || echo 0)"
check "SPA fallback for /appointments" "$(curl -s $BASE/appointments | grep -q root && echo 1 || echo 0)"
check "OpenAPI docs" "$(curl -s $BASE/api/docs/openapi.json | jv "['info']['title']" | grep -q Adare && echo 1 || echo 0)"
check "unknown API route → 404 JSON" "$(curl -s $BASE/api/nothing | jv "['code']" | grep -q NOT_FOUND && echo 1 || echo 0)"

echo
echo "================================"
echo "RESULT: $PASS passed, $FAIL failed"
echo "================================"
rm -f $JP $JR $JF $JA $JC
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
