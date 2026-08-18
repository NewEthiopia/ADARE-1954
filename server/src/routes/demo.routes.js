// One-click demo role logins (testing suite).
// Enabled only when config.demoMode is true (never in production unless
// DEMO_MODE=1 is set explicitly). Every demo login is audited and uses the
// SAME session/RBAC machinery as a normal login — no special powers.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { one, q } from '../db.js';
import { ok, fail, wrap } from '../http.js';
import { signAccess, issueRefresh, audit } from '../auth.js';
import { config } from '../config.js';

export const demoRouter = Router();

const DEMO_ROLES = [
  { key: 'super_admin', username: 'demo.superadmin', label: 'Super Admin',         desc: 'Full System Control & Audit' },
  { key: 'director',    username: 'demo.director',   label: 'Director',            desc: 'Executive Analytics & Governance' },
  { key: 'surgeon',     username: 'demo.surgeon',    label: 'Doctor (Surgeon)',    desc: 'EHR Consultation & Prescriptions' },
  { key: 'internist',   username: 'demo.internist',  label: 'Doctor (Internal Med)', desc: 'Consultation & Lab Ordering' },
  { key: 'reception',   username: 'demo.reception',  label: 'Receptionist',        desc: 'Patient Check-in & Queue Triage' },
  { key: 'pharmacist',  username: 'demo.pharmacist', label: 'Pharmacist',          desc: 'Prescription Fulfillment & Stock' },
  { key: 'labtech',     username: 'demo.labtech',    label: 'Lab Technician',      desc: 'Sample Workstation & Results' },
  { key: 'cashier',     username: 'demo.cashier',    label: 'Cashier / Finance',   desc: 'Telebirr/CBE Revenue Desk' },
  { key: 'patient',     username: 'demo.patient',    label: 'Patient Portal',      desc: 'Appointments, Prescriptions & Labs' },
];

function requireDemoMode(_req, _res, next) {
  if (!config.demoMode) {
    return next(fail(403, 'DEMO_DISABLED', 'Demo logins are disabled on this server.'));
  }
  next();
}

const demoLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

demoRouter.get('/demo-roles', requireDemoMode, wrap(async (_req, res) => {
  ok(res, { roles: DEMO_ROLES.map(({ key, label, desc }) => ({ key, label, desc })) }, 'Demo roles');
}));

demoRouter.post('/demo-login', requireDemoMode, demoLimiter, wrap(async (req, res) => {
  const entry = DEMO_ROLES.find(r => r.key === String(req.body?.key || ''));
  if (!entry) throw fail(422, 'VALIDATION', 'Unknown demo role.');
  const user = await one(
    `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.username = $1 AND u.is_active AND u.deleted_at IS NULL`, [entry.username]);
  if (!user) throw fail(404, 'NOT_FOUND', 'Demo account not seeded. Run: node scripts/seed-dev.js');

  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await issueRefresh(user.id, res);
  req.user = { id: user.id, role: user.role_code, name: user.full_name };
  await audit(req, 'LOGIN', 'users', user.id, `demo one-click (${entry.key})`);

  let patient = null;
  if (user.role_code === 'patient') {
    patient = await one('SELECT id, patient_number, full_name, phone FROM patients WHERE user_id = $1', [user.id]);
  }
  ok(res, {
    access_token: signAccess(user),
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role_code },
    patient,
    demo: true,
  }, `Signed in as ${entry.label} (demo)`);
}));
