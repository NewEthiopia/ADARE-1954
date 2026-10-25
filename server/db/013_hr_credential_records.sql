BEGIN;

CREATE TABLE IF NOT EXISTS hr_credential_records (
  id BIGINT PRIMARY KEY CHECK (id > 0),
  record_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
