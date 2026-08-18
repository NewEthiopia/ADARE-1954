// Development/testing seed accounts — clearly labeled, NOT for production.
// Production admins are created with scripts/create-admin.js instead.
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

// One-click demo role accounts (testing suite — random unusable passwords;
// they are only reachable through /api/auth/demo-login while DEMO_MODE is on).
const DEMO_ACCOUNTS = [
  ['demo.superadmin', 'Demo Super Admin',        'super_admin'],
  ['demo.director',   'Demo Director',           'hospital_admin'],
  ['demo.surgeon',    'Demo Doctor (Surgeon)',   'doctor'],
  ['demo.internist',  'Demo Doctor (Internal Med)', 'doctor'],
  ['demo.reception',  'Demo Receptionist',       'receptionist'],
  ['demo.pharmacist', 'Demo Pharmacist',         'pharmacy'],
  ['demo.labtech',    'Demo Lab Technician',     'laboratory'],
  ['demo.cashier',    'Demo Cashier / Finance',  'finance'],
  ['demo.patient',    'Demo Patient',            'patient'],
];

const DEV_ACCOUNTS = [
  ['admin',       'Hospital Administrator (DEV)', 'hospital_admin',  'AdareAdmin#2026'],
  ['reception1',  'Meseret Alemu (DEV)',          'receptionist',    'AdareReception#2026'],
  ['doctor1',     'Dr. Alemu Bekele (DEV)',       'doctor',          'AdareDoctor#2026'],
  ['nurse1',      'Sr. Almaz Haile (DEV)',        'nurse',           'AdareNurse#2026'],
  ['finance1',    'Tadesse Bekele (DEV)',         'finance',         'AdareFinance#2026'],
  ['content1',    'Selam Kebede (DEV)',           'content_manager', 'AdareContent#2026'],
];

// Real doctors are loaded by db/006_real_doctors.sql — no fictional seeds.
const DOCTORS = [];

async function seedDemoAccounts() {
  const crypto = await import('node:crypto');
  for (const [username, fullName, role] of DEMO_ACCOUNTS) {
    const exists = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    if (exists.rowCount) { console.log(`= ${username} exists`); continue; }
    // random password nobody knows — sign-in happens only via demo-login endpoint
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 11);
    const u = await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role_id)
       VALUES ($1,$2,$3,(SELECT id FROM roles WHERE code=$4)) RETURNING id`,
      [username, fullName, hash, role]);
    if (role === 'patient') {
      const n = await pool.query(
        `INSERT INTO reference_counters (counter_key, current_value) VALUES ('PAT-' || extract(year from now())::int, 1)
         ON CONFLICT (counter_key) DO UPDATE SET current_value = reference_counters.current_value + 1
         RETURNING current_value`);
      const patientNumber = `AGH-PAT-${new Date().getFullYear()}-${String(n.rows[0].current_value).padStart(6, '0')}`;
      await pool.query(
        `INSERT INTO patients (patient_number, user_id, full_name, phone) VALUES ($1,$2,$3,$4)`,
        [patientNumber, u.rows[0].id, fullName, '0900000000']);
    }
    console.log(`+ demo account ${username} (${role})`);
  }
}

async function main() {
  await seedDemoAccounts();
  for (const [username, fullName, role, password] of DEV_ACCOUNTS) {
    const exists = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    if (exists.rowCount) { console.log(`= ${username} exists`); continue; }
    const hash = await bcrypt.hash(password, 11);
    await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role_id)
       VALUES ($1,$2,$3,(SELECT id FROM roles WHERE code=$4))`,
      [username, fullName, hash, role]);
    console.log(`+ created ${username} (${role}) — dev password: ${password}`);
  }
  for (const [slug, name, title, dept, specialty, quals, langs] of DOCTORS) {
    const exists = await pool.query('SELECT id FROM doctors WHERE slug=$1', [slug]);
    if (exists.rowCount) { console.log(`= doctor ${slug} exists`); continue; }
    await pool.query(
      `INSERT INTO doctors (slug, full_name, title, department_id, specialty, qualifications, languages, biography)
       VALUES ($1,$2,$3,(SELECT id FROM departments WHERE slug=$4),$5,$6,$7,$8)`,
      [slug, name, title, dept, specialty, quals, langs,
       `${name} serves patients at Adare General Hospital in the ${specialty} service. Appointments can be requested online and are confirmed by reception.`]);
    console.log(`+ doctor ${name}`);
  }
  // One sample published article so the public news page renders (labeled sample)
  const news = await pool.query(`SELECT id FROM news LIMIT 1`);
  if (!news.rowCount) {
    await pool.query(
      `INSERT INTO news (slug, title, excerpt, body_html, category_id, status, publish_at, is_featured)
       VALUES ('adare-platform-launch','Adare General Hospital launches its new digital platform',
       'Patients can now book appointments online, track their status, and use the patient portal.',
       '<p>Adare General Hospital has launched its new digital hospital platform. Patients can book appointments online, receive a reference number, track status, and manage payments through the patient portal.</p><p>For emergencies, the Emergency &amp; Trauma Unit remains open 24 hours a day, every day.</p>',
       (SELECT id FROM news_categories WHERE slug='latest-news'),'PUBLISHED', now(), true)`);
    console.log('+ sample news article');
  }
  await pool.end();
  console.log('Seed complete.');
}
main().catch((e) => { console.error(e); process.exit(1); });
