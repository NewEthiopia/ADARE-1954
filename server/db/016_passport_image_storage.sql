BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS passport_document_path VARCHAR(255);

COMMIT;
