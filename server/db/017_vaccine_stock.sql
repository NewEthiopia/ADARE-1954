BEGIN;

CREATE TABLE IF NOT EXISTS vaccine_stock_receipts (
  id BIGSERIAL PRIMARY KEY,
  vaccine_name VARCHAR(150) NOT NULL,
  batch_number VARCHAR(80) NOT NULL,
  manufacturer VARCHAR(150),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  expiry_date DATE NOT NULL,
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes VARCHAR(500),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vaccine_stock_receipts_expiry_idx
  ON vaccine_stock_receipts (expiry_date);
CREATE INDEX IF NOT EXISTS vaccine_stock_receipts_created_idx
  ON vaccine_stock_receipts (created_at);

COMMIT;
