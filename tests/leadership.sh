#!/usr/bin/env bash
# Leadership carousel + CMS API tests
set -u
BASE="${1:-http://127.0.0.1:4000}"
PASS=0; FAIL=0
check() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "✗ FAIL  $1   ${3:-}"; fi; }
jv() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

sudo -u postgres psql -d adare_platform -q -c "DELETE FROM leaders WHERE full_name='CMS Test Leader';"

echo "=== Public API ==="
R=$(curl -s $BASE/api/leadership)
check "GET /api/leadership returns 6 active" "$(echo "$R" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin)['data']['leadership'])==6 else 0)")" "$R"
check "exact names preserved" "$(echo "$R" | python3 -c "
import sys,json
names=[l['full_name'] for l in json.load(sys.stdin)['data']['leadership']]
want=['Fikru Tesfaye','Muntash Birhanu','Firew Hanke','Maradona Zeleke','Zenebe Turiche','Yirdachew Anato']
print(1 if names==want else 0)")"
check "current manager = Yirdachew Anato" "$(echo "$R" | python3 -c "
import sys,json
cur=[l for l in json.load(sys.stdin)['data']['leadership'] if l['is_current']]
print(1 if len(cur)==1 and cur[0]['full_name']=='Yirdachew Anato' else 0)")"
check "no invented years in periods" "$(echo "$R" | python3 -c "
import sys,json,re
ps=[l.get('period') or '' for l in json.load(sys.stdin)['data']['leadership']]
print(0 if any(re.search(r'\b(19|20)\d\d\b', p) for p in ps) else 1)")"
ID1=$(echo "$R" | jv "['data']['leadership'][0]['id']")
R=$(curl -s $BASE/api/leadership/$ID1)
check "GET /api/leadership/:id" "$(echo "$R" | jv "['data']['leader']['full_name']" | grep -q 'Fikru Tesfaye' && echo 1 || echo 0)"

echo "=== Real photos served ==="
for s in fikru-tesfaye muntash-birhanu firew-hanke maradona-zeleke zenebe-turiche yirdachew-anato; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' $BASE/uploads/leaders/$s.jpg)
  WCODE=$(curl -s -o /dev/null -w '%{http_code}' $BASE/uploads/leaders/$s.webp)
  check "photo $s (jpg $CODE / webp $WCODE)" "$([ "$CODE" = 200 ] && [ "$WCODE" = 200 ] && echo 1 || echo 0)"
done
CT=$(curl -s -o /dev/null -w '%{content_type}' $BASE/uploads/leaders/fikru-tesfaye.webp)
check "webp content-type" "$(echo "$CT" | grep -q webp && echo 1 || echo 0)" "$CT"
CACHE=$(curl -sI $BASE/uploads/leaders/fikru-tesfaye.jpg | grep -i cache-control)
check "long-cache header on photos" "$(echo "$CACHE" | grep -q max-age && echo 1 || echo 0)"

echo "=== RBAC ==="
check "anonymous POST blocked (401)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/leadership -H 'Content-Type: application/json' -d '{"full_name":"X","position":"Y"}' | grep -q 401 && echo 1 || echo 0)"
RTOK=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"reception1","password":"AdareReception#2026"}' | jv "['data']['access_token']")
check "receptionist POST blocked (403)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/leadership -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"full_name":"X","position":"Y"}' | grep -q 403 && echo 1 || echo 0)"

echo "=== CMS workflow (content manager) ==="
CTOK=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"content1","password":"AdareContent#2026"}' | jv "['data']['access_token']")
R=$(curl -s -X POST $BASE/api/leadership -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
  -d '{"full_name":"CMS Test Leader","position":"Deputy Manager","manager_number":"7th","display_order":900}')
LID=$(echo "$R" | jv "['data']['leader']['id']")
check "POST creates leader" "$([ -n "$LID" ] && echo 1 || echo 0)" "$R"
R=$(curl -s -X PATCH $BASE/api/leadership/$LID -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
  -d '{"description":"Test description","period":"Test era"}')
check "PATCH updates leader" "$(echo "$R" | jv "['data']['leader']['description']" | grep -q 'Test description' && echo 1 || echo 0)"

# photo upload with real JPEG
TMP=$(mktemp --suffix=.jpg)
cp /home/user/adare-platform/server/storage/uploads/leaders/fikru-tesfaye.jpg $TMP
R=$(curl -s -X POST $BASE/api/leadership/$LID/photo -H "Authorization: Bearer $CTOK" -F "photo=@$TMP;type=image/jpeg")
PURL=$(echo "$R" | jv "['data']['photo_url']")
check "photo upload accepted" "$(echo "$PURL" | grep -q '/uploads/leaders/leader-' && echo 1 || echo 0)" "$R"
check "uploaded photo served" "$(curl -s -o /dev/null -w '%{http_code}' $BASE$PURL | grep -q 200 && echo 1 || echo 0)"
# fake file rejected
TXT=$(mktemp --suffix=.jpg); echo "not an image" > $TXT
R=$(curl -s -X POST $BASE/api/leadership/$LID/photo -H "Authorization: Bearer $CTOK" -F "photo=@$TXT;type=image/jpeg")
check "non-image upload rejected (415)" "$(echo "$R" | jv "['code']" | grep -q UPLOAD_TYPE && echo 1 || echo 0)" "$R"

# mark current is exclusive
curl -s -X PATCH $BASE/api/leadership/$LID -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' -d '{"is_current":true}' > /dev/null
CURN=$(curl -s $BASE/api/leadership | python3 -c "import sys,json;print(sum(1 for l in json.load(sys.stdin)['data']['leadership'] if l['is_current']))")
check "only one current manager after switch" "$([ "$CURN" = "1" ] && echo 1 || echo 0)" "count=$CURN"
# restore Yirdachew as current
YID=$(curl -s $BASE/api/leadership | python3 -c "import sys,json;print([l['id'] for l in json.load(sys.stdin)['data']['leadership'] if l['full_name']=='Yirdachew Anato'][0])")
curl -s -X PATCH $BASE/api/leadership/$YID -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' -d '{"is_current":true}' > /dev/null

# DELETE = soft hide
R=$(curl -s -X DELETE $BASE/api/leadership/$LID -H "Authorization: Bearer $CTOK")
check "DELETE hides leader" "$(echo "$R" | jv "['ok'] and 1 or 0")"
check "hidden leader not in public list" "$(curl -s $BASE/api/leadership | grep -q 'CMS Test Leader' && echo 0 || echo 1)"
check "hidden leader in ?all=1 CMS list" "$(curl -s -H "Authorization: Bearer $CTOK" "$BASE/api/leadership?all=1" | grep -q 'CMS Test Leader' && echo 1 || echo 0)"

echo "=== Audit ==="
ATOK=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"AdareAdmin#2026"}' | jv "['data']['access_token']")
check "LEADER_CREATED audited" "$(curl -s -H "Authorization: Bearer $ATOK" "$BASE/api/admin/audit?action=LEADER_CREATED" | grep -q 'CMS Test Leader' && echo 1 || echo 0)"
check "LEADER_PHOTO_UPLOADED audited" "$(curl -s -H "Authorization: Bearer $ATOK" "$BASE/api/admin/audit?action=LEADER_PHOTO_UPLOADED" | grep -q leader- && echo 1 || echo 0)"

rm -f $TMP $TXT
echo
echo "================================"
echo "RESULT: $PASS passed, $FAIL failed"
echo "================================"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
