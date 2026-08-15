-- ============================================================
-- ADARE GENERAL HOSPITAL DIGITAL PLATFORM — PostgreSQL schema
-- Migration 001 — core entities
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS roles (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(40) UNIQUE NOT NULL,   -- super_admin, hospital_admin, receptionist, doctor, nurse, pharmacy, laboratory, finance, content_manager, patient
  name         VARCHAR(80) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(60) UNIQUE NOT NULL,   -- appointments.manage, news.publish …
  description  VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  username          VARCHAR(60) UNIQUE NOT NULL,
  email             VARCHAR(150) UNIQUE,
  phone             VARCHAR(30),
  full_name         VARCHAR(150) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  role_id           INT NOT NULL REFERENCES roles(id),
  department_id     INT,                       -- FK added after departments
  is_active         BOOLEAN NOT NULL DEFAULT true,
  must_change_pw    BOOLEAN NOT NULL DEFAULT false,
  failed_attempts   INT NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  refresh_token_hash VARCHAR(255),
  refresh_expires_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE TABLE IF NOT EXISTS departments (
  id           SERIAL PRIMARY KEY,
  slug         VARCHAR(120) UNIQUE NOT NULL,
  name         VARCHAR(150) NOT NULL,
  name_am      VARCHAR(150),
  description  TEXT,
  location     VARCHAR(150),
  phone        VARCHAR(30),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD CONSTRAINT fk_users_department
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS services (
  id             SERIAL PRIMARY KEY,
  slug           VARCHAR(140) UNIQUE NOT NULL,
  name           VARCHAR(160) NOT NULL,
  department_id  INT REFERENCES departments(id) ON DELETE SET NULL,
  description    TEXT,
  available_days VARCHAR(120) DEFAULT 'Mon–Fri',
  working_hours  VARCHAR(120) DEFAULT '8:00–17:00',
  location       VARCHAR(150),
  contact        VARCHAR(120),
  bookable       BOOLEAN NOT NULL DEFAULT true,
  emergency      BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_dept ON services(department_id);

CREATE TABLE IF NOT EXISTS doctors (
  id             SERIAL PRIMARY KEY,
  slug           VARCHAR(140) UNIQUE NOT NULL,
  user_id        INT REFERENCES users(id) ON DELETE SET NULL,
  full_name      VARCHAR(150) NOT NULL,
  title          VARCHAR(120),                 -- e.g. General Surgeon
  department_id  INT REFERENCES departments(id) ON DELETE SET NULL,
  specialty      VARCHAR(150),
  qualifications VARCHAR(255),
  languages      VARCHAR(150) DEFAULT 'Amharic, English',
  working_days   VARCHAR(120) DEFAULT 'Mon–Fri',
  working_hours  VARCHAR(120) DEFAULT '8:00–17:00',
  accepts_appointments BOOLEAN NOT NULL DEFAULT true,
  biography      TEXT,
  photo_path     VARCHAR(255),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctors_dept ON doctors(department_id);

CREATE TABLE IF NOT EXISTS patients (
  id              SERIAL PRIMARY KEY,
  patient_number  VARCHAR(30) UNIQUE NOT NULL,      -- AGH-PAT-2026-000001
  user_id         INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name       VARCHAR(150) NOT NULL,
  phone           VARCHAR(30) NOT NULL,
  email           VARCHAR(150),
  gender          VARCHAR(10),
  date_of_birth   DATE,
  address         VARCHAR(255),
  emergency_contact VARCHAR(150),
  insurance_type  VARCHAR(40),                       -- none | cbhi | private | other
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);

CREATE TABLE IF NOT EXISTS appointments (
  id              SERIAL PRIMARY KEY,
  reference       VARCHAR(30) UNIQUE NOT NULL,       -- AGH-APT-2026-000001
  patient_id      INT REFERENCES patients(id) ON DELETE SET NULL,
  patient_name    VARCHAR(150) NOT NULL,
  phone           VARCHAR(30) NOT NULL,
  email           VARCHAR(150),
  gender          VARCHAR(10),
  date_of_birth   DATE,
  department_id   INT REFERENCES departments(id) ON DELETE SET NULL,
  doctor_id       INT REFERENCES doctors(id) ON DELETE SET NULL,
  service_id      INT REFERENCES services(id) ON DELETE SET NULL,
  preferred_date  DATE NOT NULL,
  preferred_time  VARCHAR(20),
  scheduled_date  DATE,
  scheduled_time  VARCHAR(20),
  reason          TEXT,
  is_emergency    BOOLEAN NOT NULL DEFAULT false,
  insurance_type  VARCHAR(40),
  notes           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CONFIRMED','RESCHEDULED','CHECKED_IN','IN_CONSULTATION','COMPLETED','CANCELLED','REJECTED','NO_SHOW')),
  status_note     VARCHAR(255),
  handled_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(preferred_date);
CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(phone);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id              BIGSERIAL PRIMARY KEY,
  appointment_id  INT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status     VARCHAR(20),
  to_status       VARCHAR(20) NOT NULL,
  note            VARCHAR(255),
  changed_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ash_appt ON appointment_status_history(appointment_id);

CREATE TABLE IF NOT EXISTS payments (
  id               SERIAL PRIMARY KEY,
  reference        VARCHAR(30) UNIQUE NOT NULL,      -- AGH-PAY-2026-000001
  patient_id       INT REFERENCES patients(id) ON DELETE SET NULL,
  appointment_ref  VARCHAR(30),
  payer_name       VARCHAR(150) NOT NULL,
  phone            VARCHAR(30) NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency         VARCHAR(8) NOT NULL DEFAULT 'ETB',
  method           VARCHAR(30) NOT NULL,             -- telebirr | bank_transfer | card | cash | cbhi | other
  provider_ref     VARCHAR(120),
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','SUCCESSFUL','FAILED','CANCELLED','REFUNDED')),
  status_note      VARCHAR(255),
  verified_by      INT REFERENCES users(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  receipt_path     VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_pay_phone ON payments(phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_provider_ref ON payments(provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id           BIGSERIAL PRIMARY KEY,
  payment_id   INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event        VARCHAR(40) NOT NULL,                 -- created, provider_callback, verified …
  detail       TEXT,
  actor        VARCHAR(120),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  audience     VARCHAR(10) NOT NULL DEFAULT 'staff'   -- staff | role | user | patient
    CHECK (audience IN ('staff','role','user','patient')),
  role_code    VARCHAR(40),
  user_id      INT REFERENCES users(id) ON DELETE CASCADE,
  patient_id   INT REFERENCES patients(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  title        VARCHAR(150) NOT NULL,
  body         VARCHAR(500) NOT NULL,
  reference    VARCHAR(60),
  is_read      BOOLEAN NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_target ON notifications(audience, role_code, user_id, patient_id, is_read);

CREATE TABLE IF NOT EXISTS news_categories (
  id    SERIAL PRIMARY KEY,
  slug  VARCHAR(80) UNIQUE NOT NULL,
  name  VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS news (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(160) UNIQUE NOT NULL,
  title         VARCHAR(200) NOT NULL,
  excerpt       VARCHAR(500),
  body_html     TEXT,                                -- sanitized server-side
  category_id   INT REFERENCES news_categories(id) ON DELETE SET NULL,
  tags          VARCHAR(255),
  author_id     INT REFERENCES users(id) ON DELETE SET NULL,
  image_path    VARCHAR(255),
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  status        VARCHAR(12) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SCHEDULED')),
  publish_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_news_status ON news(status, publish_at);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(160) UNIQUE NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  location    VARCHAR(200),
  is_public   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200),
  category    VARCHAR(80) DEFAULT 'facility',
  image_path  VARCHAR(255) NOT NULL,
  caption     VARCHAR(255),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS leaders (
  id           SERIAL PRIMARY KEY,
  full_name    VARCHAR(150) NOT NULL,
  position     VARCHAR(150) NOT NULL,
  order_label  VARCHAR(20),                        -- 1st, 2nd …
  period       VARCHAR(80),                        -- e.g. Primary Hospital era
  biography    TEXT,
  photo_path   VARCHAR(255),
  is_current   BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS health_articles (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(160) UNIQUE NOT NULL,
  title       VARCHAR(200) NOT NULL,
  category    VARCHAR(60) NOT NULL,                -- maternal, child, nutrition, diabetes, hypertension, infectious, medication, mental, preventive
  body_html   TEXT,
  status      VARCHAR(12) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(150),
  phone       VARCHAR(30),
  subject     VARCHAR(200),
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  actor       VARCHAR(120) NOT NULL DEFAULT 'system',
  role_code   VARCHAR(40),
  action      VARCHAR(60) NOT NULL,
  entity      VARCHAR(60),
  entity_id   VARCHAR(60),
  result      VARCHAR(12) NOT NULL DEFAULT 'OK',
  detail      TEXT,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS hospital_settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       TEXT NOT NULL,
  description VARCHAR(255),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reference_counters (
  counter_key   VARCHAR(40) PRIMARY KEY,
  current_value BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS translations (
  id        SERIAL PRIMARY KEY,
  lang      VARCHAR(8) NOT NULL,
  namespace VARCHAR(60) NOT NULL DEFAULT 'common',
  t_key     VARCHAR(120) NOT NULL,
  t_value   TEXT NOT NULL,
  UNIQUE (lang, namespace, t_key)
);

COMMIT;
