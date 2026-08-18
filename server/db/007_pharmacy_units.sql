-- ============================================================
-- Migration 007 — real pharmacy units of Adare General Hospital
-- OPD Pharmacy (inside the new building), Emergency Pharmacy,
-- Inpatient Pharmacy, ART Pharmacy, Community Pharmacy One,
-- Community Pharmacy Two.
-- ============================================================
BEGIN;

UPDATE departments
SET description = 'Six pharmacy units serve patients across the hospital: OPD Pharmacy (inside the new building), Emergency Pharmacy (24/7), Inpatient Pharmacy, ART Pharmacy, and Community Pharmacy One and Two.',
    updated_at = now()
WHERE slug = 'pharmacy';

-- Update the two existing units with real locations
UPDATE services SET
  location = 'Inside the new building',
  description = 'Prescription dispensing for outpatients — located inside the new hospital building.',
  updated_at = now()
WHERE slug = 'opd-pharmacy';

UPDATE services SET
  description = '24-hour dispensing for emergency cases at the Emergency & Trauma Unit.',
  updated_at = now()
WHERE slug = 'emergency-pharmacy';

-- Add the missing four units
INSERT INTO services (slug, name, department_id, description, available_days, working_hours, location, emergency, bookable)
VALUES
 ('inpatient-pharmacy', 'Inpatient Pharmacy',
  (SELECT id FROM departments WHERE slug='pharmacy'),
  'Medication supply and dispensing for admitted patients on the wards.',
  'Every day', '24 hours', 'Ward block', false, false),
 ('art-pharmacy', 'ART Pharmacy',
  (SELECT id FROM departments WHERE slug='pharmacy'),
  'Antiretroviral therapy dispensing, adherence counselling and refills for HIV care.',
  'Mon–Fri', '8:00–17:00', 'ART clinic', false, false),
 ('community-pharmacy-one', 'Community Pharmacy One',
  (SELECT id FROM departments WHERE slug='pharmacy'),
  'Community-facing pharmacy providing affordable medicines to the public.',
  'Mon–Sat', '8:00–20:00', 'Hospital compound', false, false),
 ('community-pharmacy-two', 'Community Pharmacy Two',
  (SELECT id FROM departments WHERE slug='pharmacy'),
  'Second community pharmacy extending access to affordable medicines.',
  'Mon–Sat', '8:00–20:00', 'Hospital compound', false, false)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  location = EXCLUDED.location,
  available_days = EXCLUDED.available_days,
  working_hours = EXCLUDED.working_hours;

COMMIT;
