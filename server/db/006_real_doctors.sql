-- ============================================================
-- Migration 006 — replace fictional dev-seed doctors with the
-- real Adare General Hospital physicians provided by the hospital.
-- Names are stored exactly as provided (Amharic primary).
-- FK appointments.doctor_id is ON DELETE SET NULL — safe.
-- ============================================================
BEGIN;

-- Remove the fictional development placeholders
DELETE FROM doctors WHERE slug IN
 ('dr-alemu-bekele','dr-sara-tesfaye','dr-yohannes-girma',
  'dr-hanna-abebe','dr-dawit-mekonnen','dr-bethlehem-alemayehu');

-- Real physicians
INSERT INTO doctors (slug, full_name, title, department_id, specialty, languages, working_days, working_hours, biography)
VALUES
 ('dr-asbew',
  'ዶ/ር አስበው (Dr. Asbew)',
  'የውስጥ ደዌ እስፔሻሊስት · Internal Medicine Specialist',
  (SELECT id FROM departments WHERE slug='opd'),
  'Internal medicine · የውስጥ ደዌ',
  'Amharic, English',
  'Mon–Fri', '8:00–17:00',
  'የውስጥ ደዌ እስፔሻሊስት በአዳሬ አጠቃላይ ሆስፒታል ተመላላሽ ታካሚ ክፍል (OPD)። Internal medicine specialist serving patients at the Outpatient Department.'),
 ('dr-elias-gulma',
  'ዶ/ር ኤሊያስ ጉልማ (Dr. Elias Gulma)',
  'የውስጥ ደዌ እስፔሻሊስት · Internal Medicine Specialist',
  (SELECT id FROM departments WHERE slug='opd'),
  'Internal medicine · የውስጥ ደዌ',
  'Amharic, English',
  'Mon–Fri', '8:00–17:00',
  'የውስጥ ደዌ እስፔሻሊስት በአዳሬ አጠቃላይ ሆስፒታል ተመላላሽ ታካሚ ክፍል (OPD)። Internal medicine specialist serving patients at the Outpatient Department.'),
 ('dr-tariku-dabaro',
  'ዶ/ር ታሪኩ ዳባሮ (Dr. Tariku Dabaro)',
  'የውስጥ ደዌ እስፔሻሊስት · Internal Medicine Specialist',
  (SELECT id FROM departments WHERE slug='opd'),
  'Internal medicine · የውስጥ ደዌ',
  'Amharic, English',
  'Mon–Fri', '8:00–17:00',
  'የውስጥ ደዌ እስፔሻሊስት በአዳሬ አጠቃላይ ሆስፒታል ተመላላሽ ታካሚ ክፍል (OPD)። Internal medicine specialist serving patients at the Outpatient Department.'),
 ('dr-shanbel',
  'ዶ/ር ሻንበል (Dr. Shanbel)',
  'Ophthalmologist · የዓይን ሕክምና እስፔሻሊስት',
  (SELECT id FROM departments WHERE slug='ophthalmology'),
  'Ophthalmology · የዓይን ሕክምና',
  'Amharic, English',
  'Mon–Fri', '8:00–17:00',
  'የዓይን ሕክምና እስፔሻሊስት በአዳሬ አጠቃላይ ሆስፒታል። Ophthalmologist providing eye examinations, treatment and minor eye surgery.'),
 ('dr-meron',
  'ዶ/ር ሜሮን (Dr. Meron)',
  'Pediatrician · የሕፃናት ሕክምና እስፔሻሊስት',
  (SELECT id FROM departments WHERE slug='mch'),
  'Pediatrics · የሕፃናት ሕክምና',
  'Amharic, English',
  'Mon–Fri', '8:00–17:00',
  'የሕፃናት ሕክምና እስፔሻሊስት በእናቶች እና ሕፃናት ጤና ክፍል። Pediatrician serving children at the Maternal & Child Health department.')
ON CONFLICT (slug) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  title = EXCLUDED.title,
  department_id = EXCLUDED.department_id,
  specialty = EXCLUDED.specialty,
  biography = EXCLUDED.biography;

COMMIT;
