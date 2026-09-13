-- Procurement/tender documents: payment and explicit admin release are required before download.
BEGIN;

CREATE TABLE IF NOT EXISTS procurement_tenders (
  id             SERIAL PRIMARY KEY,
  reference      VARCHAR(40) UNIQUE NOT NULL,
  title          VARCHAR(240) NOT NULL,
  description    TEXT,
  price          NUMERIC(12,2) NOT NULL CHECK (price > 0),
  currency       VARCHAR(8) NOT NULL DEFAULT 'ETB',
  deadline       TIMESTAMPTZ,
  file_name      VARCHAR(255) NOT NULL,
  file_path      VARCHAR(500) NOT NULL,
  status         VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  released_at    TIMESTAMPTZ,
  released_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_by     INT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_status_deadline ON procurement_tenders(status, deadline);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS procurement_id INT REFERENCES procurement_tenders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_procurement ON payments(procurement_id);

COMMIT;
