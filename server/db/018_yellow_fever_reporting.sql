BEGIN;

CREATE TABLE IF NOT EXISTS staff_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code VARCHAR(60) NOT NULL
    CHECK (permission_code IN ('yellow_fever_manager', 'nursing_daily_report')),
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_code)
);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS vaccination_administered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vaccinated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS vaccine_stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  stock_receipt_id BIGINT NOT NULL REFERENCES vaccine_stock_receipts(id),
  unit_name VARCHAR(150) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vaccine_stock_transfers_receipt_idx
  ON vaccine_stock_transfers (stock_receipt_id);
CREATE INDEX IF NOT EXISTS vaccine_stock_transfers_unit_idx
  ON vaccine_stock_transfers (unit_name);

CREATE TABLE IF NOT EXISTS vaccine_stock_usages (
  id BIGSERIAL PRIMARY KEY,
  stock_receipt_id BIGINT NOT NULL REFERENCES vaccine_stock_receipts(id),
  unit_name VARCHAR(150) NOT NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  usage_type VARCHAR(20) NOT NULL CHECK (usage_type IN ('ADMINISTERED', 'WASTED')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vaccine_stock_usages_receipt_idx
  ON vaccine_stock_usages (stock_receipt_id);
CREATE INDEX IF NOT EXISTS vaccine_stock_usages_unit_idx
  ON vaccine_stock_usages (unit_name);
CREATE UNIQUE INDEX IF NOT EXISTS vaccine_stock_usages_appointment_idx
  ON vaccine_stock_usages (appointment_id) WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS nursing_daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  unit_name VARCHAR(150) NOT NULL,
  vaccination_activity BOOLEAN NOT NULL,
  adverse_events BOOLEAN NOT NULL,
  doses_wasted INTEGER NOT NULL DEFAULT 0 CHECK (doses_wasted >= 0),
  waste_stock_receipt_id BIGINT REFERENCES vaccine_stock_receipts(id),
  notes VARCHAR(1000),
  submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  dhis2_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED'
    CHECK (dhis2_status IN ('NOT_SUBMITTED', 'SUBMITTED')),
  dhis2_submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_date, unit_name)
);

CREATE INDEX IF NOT EXISTS nursing_daily_reports_date_idx
  ON nursing_daily_reports (report_date, unit_name);

COMMIT;
