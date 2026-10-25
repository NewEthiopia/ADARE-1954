BEGIN;

INSERT INTO roles (code, name)
VALUES ('hr_admin', 'HR Administrator')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, description)
VALUES ('hr.credentials.view', 'View staff educational credential records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('super_admin', 'hospital_admin', 'hr_admin')
  AND p.code = 'hr.credentials.view'
ON CONFLICT DO NOTHING;

COMMIT;
