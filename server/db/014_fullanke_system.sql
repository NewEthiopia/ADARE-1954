INSERT INTO hospital_settings (key, value, description)
VALUES (
  'internal_fullanke_url',
  'http://192.168.1.250/iemrs/',
  'Fullanke iEMRS — internal LAN link (staff app)'
)
ON CONFLICT (key) DO NOTHING;
