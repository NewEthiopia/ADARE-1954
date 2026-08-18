-- ============================================================
-- Migration 008 — internal hospital systems (LAN links shown in
-- the staff app only). CMS-editable via hospital_settings.
-- These are private-network addresses (192.168.x.x): they only
-- resolve inside the hospital LAN, never from the public internet.
-- ============================================================
BEGIN;

INSERT INTO hospital_settings (key, value, description) VALUES
 ('internal_dagu_url',  'http://192.168.1.63/login',        'Dagu 2.0 — internal LAN link (staff app)'),
 ('internal_emr_url',   'http://192.168.1.63/login',        'EMR System — internal LAN link (staff app)'),
 ('internal_odoo_url',  'http://192.168.1.13:8069/web/login','Odoo ERP — internal LAN link (staff app)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
