-- ============================================================
-- Migration 005 — correct years-of-service to Ethiopian calendar
-- Founded 1954 E.C. (≈1961/62 G.C.); 1954–2019 E.C. = 65 years.
-- ============================================================
BEGIN;

UPDATE hospital_settings
SET value = '65',
    description = 'Years of service, 1954–2019 E.C. (Ethiopian calendar)',
    updated_at = now()
WHERE key = 'stat_years_of_service';

INSERT INTO hospital_settings (key, value, description) VALUES
  ('founded_year_ec', '1954', 'Founding year, Ethiopian calendar'),
  ('current_year_ec', '2019', 'Reference Ethiopian year used for the years-of-service stat')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
