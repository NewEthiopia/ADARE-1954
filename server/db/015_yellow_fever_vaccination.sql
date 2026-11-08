BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS passport_number VARCHAR(40),
  ADD COLUMN IF NOT EXISTS passport_document_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS yellow_fever_vaccination BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS yellow_card_certificate_issued BOOLEAN NOT NULL DEFAULT false;

INSERT INTO services (slug, name, department_id, description, available_days, working_hours, location, contact, bookable, emergency, is_active)
SELECT 'yellow-fever-vaccination',
       'Yellow Fever Vaccination',
       (SELECT id FROM departments WHERE slug = 'opd'),
       'Passport verification, vaccine administration, and yellow card certificate issuance for eligible travelers and patients.',
       'Mon–Fri',
       '8:00–17:00',
       'OPD vaccination centre',
       '046 221 1661',
       true,
       false,
       true
WHERE NOT EXISTS (SELECT 1 FROM services WHERE slug = 'yellow-fever-vaccination');

COMMIT;
