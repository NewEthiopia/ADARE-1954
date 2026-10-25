INSERT INTO hospital_settings (key, value, description)
VALUES ('site_heartbeat', 'true', 'Enable the animated heartbeat effect across the public website')
ON CONFLICT (key) DO NOTHING;
