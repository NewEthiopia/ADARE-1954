BEGIN;

CREATE TABLE IF NOT EXISTS appointment_passport_documents (
  appointment_id INTEGER PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
  file_path VARCHAR(255) NOT NULL UNIQUE,
  extension VARCHAR(4) NOT NULL CHECK (extension IN ('jpg', 'png', 'webp')),
  encryption_iv BYTEA NOT NULL CHECK (octet_length(encryption_iv) = 12),
  authentication_tag BYTEA NOT NULL CHECK (octet_length(authentication_tag) = 16),
  encrypted_data BYTEA NOT NULL CHECK (octet_length(encrypted_data) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
