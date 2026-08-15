-- ============================================================
-- Migration 002 — reference + development seed data
-- Seed accounts are DEVELOPMENT/TESTING accounts (clearly labeled).
-- Passwords are set by the seed script (hashed), never here.
-- ============================================================
BEGIN;

INSERT INTO roles (code, name) VALUES
 ('super_admin','Super Administrator'),
 ('hospital_admin','Hospital Administrator'),
 ('receptionist','Receptionist'),
 ('doctor','Doctor'),
 ('nurse','Nurse'),
 ('pharmacy','Pharmacy Staff'),
 ('laboratory','Laboratory Staff'),
 ('finance','Finance Staff'),
 ('content_manager','Content Manager'),
 ('patient','Patient')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, description) VALUES
 ('appointments.view','View appointments'),
 ('appointments.manage','Confirm/reject/reschedule appointments'),
 ('patients.view','View patients'),
 ('patients.manage','Register and update patients'),
 ('payments.view','View payments'),
 ('payments.manage','Verify or reject payments'),
 ('news.manage','Create and edit news'),
 ('news.publish','Publish news'),
 ('content.manage','Edit CMS content, gallery, leaders'),
 ('staff.manage','Manage staff accounts'),
 ('reports.view','View reports'),
 ('audit.view','View audit logs'),
 ('settings.manage','Edit hospital settings')
ON CONFLICT (code) DO NOTHING;

-- role → permission map
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  (r.code IN ('super_admin','hospital_admin')) OR
  (r.code = 'receptionist'    AND p.code IN ('appointments.view','appointments.manage','patients.view','patients.manage','payments.view')) OR
  (r.code = 'doctor'          AND p.code IN ('appointments.view','appointments.manage','patients.view')) OR
  (r.code = 'nurse'           AND p.code IN ('appointments.view','patients.view')) OR
  (r.code = 'finance'         AND p.code IN ('payments.view','payments.manage','reports.view')) OR
  (r.code = 'content_manager' AND p.code IN ('news.manage','news.publish','content.manage'))
)
ON CONFLICT DO NOTHING;

INSERT INTO departments (slug, name, name_am, description, location, sort_order) VALUES
 ('emergency-trauma','Emergency & Trauma Unit','ድንገተኛ እና ትራውማ','Round-the-clock acute care for injuries and sudden illness. Open 24/7.','Main building, ground floor',1),
 ('opd','Outpatient Department (OPD)','ተመላላሽ ታካሚ ክፍል','General consultation, triage and referral into specialist clinics.','OPD block',2),
 ('inpatient','Inpatient Wards','ተኝቶ ታካሚ ክፍል','Admitted-patient care across medical and surgical wards.','Ward block',3),
 ('mch','Maternal & Child Health','እናቶች እና ሕፃናት ጤና','Antenatal, delivery, postnatal, immunization and child health.','MCH wing',4),
 ('surgery','Surgical Services','ቀዶ ሕክምና','Elective and emergency surgical care with modern theatres.','Surgical block',5),
 ('internal-medicine','Internal Medicine','የውስጥ ደዌ ሕክምና','Diagnosis and management of adult medical conditions.','OPD block',6),
 ('tb-clinic','Tuberculosis (TB) Clinic','የቲቢ ክሊኒክ','TB screening, GeneXpert testing and directly-observed therapy.','TB clinic',7),
 ('hiv-id','HIV & Infectious Diseases','ኤችአይቪ እና ተላላፊ በሽታዎች','ART services, counselling and infectious disease care.','ART clinic',8),
 ('ophthalmology','Ophthalmology','የዓይን ሕክምና','Eye examinations, treatment and minor eye surgery.','Specialty clinics',9),
 ('laboratory','Laboratory & Diagnostics','ላቦራቶሪ','ISO 15189:2022-committed laboratory with GeneXpert MTB/RIF. EAS Facility Accreditation No. M0093.','Diagnostics wing',10),
 ('radiology','Radiology & Imaging','ራዲዮሎጂ','X-ray and ultrasound imaging with urgent priority for emergencies.','Diagnostics wing',11),
 ('pharmacy','Pharmacy','ፋርማሲ','OPD, emergency, inpatient, ART/OI and community pharmacies.','Pharmacy block',12);

INSERT INTO services (slug, name, department_id, description, available_days, working_hours, emergency, bookable) VALUES
 ('emergency-care','Emergency & Trauma Care',(SELECT id FROM departments WHERE slug='emergency-trauma'),'Immediate care for injuries, trauma and sudden medical conditions.','Every day','24 hours',true,false),
 ('general-consultation','General Consultation (OPD)',(SELECT id FROM departments WHERE slug='opd'),'Consultation for new and returning patients with triage and referral.','Mon–Fri','8:00–17:00',false,true),
 ('antenatal-care','Antenatal Care',(SELECT id FROM departments WHERE slug='mch'),'Pregnancy follow-up, screening and birth planning.','Mon–Fri','8:00–17:00',false,true),
 ('delivery','Delivery Services',(SELECT id FROM departments WHERE slug='mch'),'Safe delivery attended by skilled professionals.','Every day','24 hours',true,false),
 ('immunization','Child Immunization',(SELECT id FROM departments WHERE slug='mch'),'Routine EPI vaccination for infants and children.','Mon–Fri','8:00–12:00',false,true),
 ('elective-surgery','Elective Surgery',(SELECT id FROM departments WHERE slug='surgery'),'Scheduled surgical procedures after specialist consultation.','Mon–Fri','8:00–17:00',false,true),
 ('tb-screening','TB Screening & GeneXpert',(SELECT id FROM departments WHERE slug='tb-clinic'),'Sputum testing and GeneXpert MTB/RIF molecular diagnosis.','Mon–Fri','8:00–17:00',false,true),
 ('art-services','ART & HIV Care',(SELECT id FROM departments WHERE slug='hiv-id'),'Antiretroviral therapy, counselling and follow-up.','Mon–Fri','8:00–17:00',false,true),
 ('eye-examination','Eye Examination',(SELECT id FROM departments WHERE slug='ophthalmology'),'Vision testing, eye disease diagnosis and treatment.','Mon–Fri','8:00–17:00',false,true),
 ('laboratory-tests','Laboratory Testing',(SELECT id FROM departments WHERE slug='laboratory'),'Clinical chemistry, hematology, serology and molecular testing.','Every day','6:00–22:00',false,true),
 ('xray','X-ray Imaging',(SELECT id FROM departments WHERE slug='radiology'),'Plain radiography with radiologist reporting.','Mon–Sat','8:00–17:00',false,true),
 ('ultrasound','Ultrasound',(SELECT id FROM departments WHERE slug='radiology'),'Obstetric and general ultrasound examinations.','Mon–Fri','8:00–17:00',false,true),
 ('opd-pharmacy','OPD Pharmacy',(SELECT id FROM departments WHERE slug='pharmacy'),'Prescription dispensing for outpatients.','Mon–Fri','8:00–17:00',false,false),
 ('emergency-pharmacy','Emergency Pharmacy',(SELECT id FROM departments WHERE slug='pharmacy'),'24-hour dispensing for emergency cases.','Every day','24 hours',true,false);

INSERT INTO news_categories (slug, name) VALUES
 ('latest-news','Latest News'),('notices','Notices'),('press-releases','Press Releases'),
 ('events','Events'),('job-vacancies','Job Vacancies'),('procurement','Procurement')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO leaders (full_name, position, order_label, period, is_current, sort_order) VALUES
 ('Fikru Tesfaye','Hospital Manager','1st','Adare Primary Hospital era',false,1),
 ('Muntash Birhanu','Hospital Manager','2nd','Adare Primary Hospital era',false,2),
 ('Firew Hanke','Hospital Manager','3rd','Adare Primary Hospital era',false,3),
 ('Maradona Zeleke','Hospital Manager','4th','Growth era',false,4),
 ('Zenebe Turiche','Hospital Manager','5th','Growth era',false,5),
 ('Yirdachew Anato','Hospital Manager / CEO','6th','Adare General Hospital',true,6);

INSERT INTO hospital_settings (key, value, description) VALUES
 ('hospital_name','Adare General Hospital','Official hospital name'),
 ('hospital_tagline','Compassionate Care. Professional Excellence. Better Health.','Homepage tagline'),
 ('address','Hawassa City, Sidama Regional State, Ethiopia','Physical address'),
 ('phone_main','046 221 1661','Main phone line'),
 ('phone_emergency','046 221 1661','Emergency phone (update with dedicated line when assigned)'),
 ('email_public','','Public email (configure)'),
 ('working_hours','Mon–Fri 8:00–17:00 · Emergency 24/7','Working hours'),
 ('stat_opd_attendances','183759','OPD attendances (latest reporting year)'),
 ('stat_emergency_visits','39253','Emergency visits (same year)'),
 ('stat_ipd_admissions','4810','Inpatient admissions (same year)'),
 ('stat_total_staff','712','Total staff'),
 ('stat_health_professionals','461','Healthcare professionals'),
 ('stat_years_of_service','65','Years of service, 1954–2019 E.C. (Ethiopian calendar)'),
 ('stat_departments','12','Medical departments'),
 ('map_lat','7.0621','Map latitude (Hawassa)'),
 ('map_lng','38.4764','Map longitude (Hawassa)'),
 ('facebook_url','','Facebook page URL'),
 ('bank_account_sidama','3401302000016','Sidama Bank account number')
ON CONFLICT (key) DO NOTHING;

INSERT INTO health_articles (slug, title, category, body_html) VALUES
 ('safe-motherhood-basics','Safe Motherhood: Antenatal Visits Matter','maternal','<p>Attending at least four antenatal visits helps detect risks early. Adare General Hospital provides free antenatal screening — visit the MCH wing Monday to Friday.</p>'),
 ('child-vaccination-schedule','Your Child''s Vaccination Schedule','child','<p>Immunization protects children against measles, polio, and other preventable diseases. Bring your child''s card every visit; catch-up doses are available.</p>'),
 ('healthy-eating-on-a-budget','Healthy Eating on a Budget','nutrition','<p>Local foods such as lentils, kale, eggs and enset-based dishes provide excellent nutrition. Aim for variety and iodized salt.</p>'),
 ('living-well-with-diabetes','Living Well with Diabetes','diabetes','<p>Regular blood-sugar checks, consistent medication and foot care prevent complications. The internal medicine clinic offers follow-up appointments.</p>'),
 ('know-your-blood-pressure','Know Your Blood Pressure','hypertension','<p>High blood pressure often has no symptoms. Adults should check at least yearly; free measurement is offered at community health fairs.</p>'),
 ('tb-early-detection','Tuberculosis: Early Detection Saves Lives','infectious','<p>A cough lasting more than two weeks deserves testing. GeneXpert testing at our accredited laboratory gives fast, reliable results.</p>'),
 ('medication-safety-at-home','Medication Safety at Home','medication','<p>Complete the full course, never share antibiotics, and store medicines away from children. Ask our pharmacists about interactions.</p>'),
 ('caring-for-your-mind','Caring for Your Mind','mental','<p>Stress, sleep problems and low mood are health issues like any other. Speak to a professional — help is available and confidential.</p>'),
 ('handwashing-prevention','Handwashing: The Cheapest Prevention','preventive','<p>Washing hands with soap for 20 seconds prevents diarrhoeal disease and respiratory infection. Teach children the habit early.</p>');

INSERT INTO reference_counters (counter_key, current_value) VALUES
 ('APT-2026',0),('PAT-2026',0),('PAY-2026',0)
ON CONFLICT DO NOTHING;

COMMIT;
