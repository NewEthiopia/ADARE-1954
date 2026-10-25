BEGIN;

ALTER TABLE procurement_tenders ALTER COLUMN price DROP NOT NULL;
ALTER TABLE procurement_tenders DROP CONSTRAINT IF EXISTS procurement_tenders_price_check;
ALTER TABLE procurement_tenders ADD CONSTRAINT procurement_tenders_price_check CHECK (price IS NULL OR price > 0);

COMMIT;
