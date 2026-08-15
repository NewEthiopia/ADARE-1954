import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { one, q, tx, nextReference } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import {
  hashPassword, verifyPassword, signAccess, issueRefresh, rotateRefresh,
  clearRefresh, requireAuth, audit,
} from '../auth.js';
import { config } from '../config.js';
import { notifyRole } from '../notify.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', error: 'Too many attempts. Try again later.' },
});

async function checkLock(user) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw fail(429, 'ACCOUNT_LOCKED', `Account temporarily locked. Try again after ${config.loginLockMinutes} minutes.`);
  }
}
async function recordFail(userId, fails) {
  const lock = fails + 1 >= config.loginMaxFails
    ? new Date(Date.now() + config.loginLockMinutes * 60000) : null;
  await q('UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3', [fails + 1, lock, userId]);
}

const loginSchema = z.object({
  username: z.string().min(2).max(150),
  password: z.string().min(1).max(200),
});

authRouter.post('/login', loginLimiter, validate(loginSchema), wrap(async (req, res) => {
  const { username, password } = req.body;
  const user = await one(
    `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id
     WHERE (lower(u.username) = lower($1) OR lower(u.email) = lower($1)) AND u.deleted_at IS NULL`,
    [username]
  );
  if (!user) throw fail(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
  await checkLock(user);
  if (!(await verifyPassword(password, user.password_hash))) {
    await recordFail(user.id, user.failed_attempts);
    await audit(req, 'LOGIN_FAILED', 'users', user.id, username, 'FAIL');
    throw fail(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
  }
  if (!user.is_active) throw fail(403, 'ACCOUNT_DISABLED', 'This account is deactivated. Contact the administrator.');

  await q('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [user.id]);
  await issueRefresh(user.id, res);
  req.user = { id: user.id, role: user.role_code, name: user.full_name };
  await audit(req, 'LOGIN', 'users', user.id);

  let patient = null;
  if (user.role_code === 'patient') {
    patient = await one('SELECT id, patient_number, full_name, phone FROM patients WHERE user_id=$1', [user.id]);
  }
  ok(res, {
    access_token: signAccess(user),
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role_code, must_change_pw: user.must_change_pw },
    patient,
  }, 'Signed in');
}));

authRouter.post('/refresh', wrap(async (req, res) => {
  const user = await rotateRefresh(req.cookies?.agh_refresh, res);
  let patient = null;
  if (user.role_code === 'patient') {
    patient = await one('SELECT id, patient_number, full_name, phone FROM patients WHERE user_id=$1', [user.id]);
  }
  ok(res, {
    access_token: signAccess(user),
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role_code },
    patient,
  }, 'Token refreshed');
}));

authRouter.post('/logout', requireAuth, wrap(async (req, res) => {
  await clearRefresh(req.user.id, res);
  await audit(req, 'LOGOUT', 'users', req.user.id);
  ok(res, {}, 'Signed out');
}));

// ---- Patient self-registration (creates user with role=patient + patient record) ----
const registerSchema = z.object({
  full_name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9\s-]{6,20}$/, 'valid phone required').transform(v => v.replace(/[\s-]/g, '')),
  email: z.string().email().max(150).optional().or(z.literal('')),
  password: z.string().min(8).max(200),
  gender: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

authRouter.post('/register', loginLimiter, validate(registerSchema), wrap(async (req, res) => {
  const { full_name, phone, email, password, gender, date_of_birth } = req.body;
  const dup = await one('SELECT id FROM users WHERE username=$1', [phone]);
  if (dup) throw fail(409, 'DUPLICATE', 'An account already exists for this phone number. Please sign in.');

  const pwHash = await hashPassword(password);
  const result = await tx(async (client) => {
    const role = (await client.query(`SELECT id FROM roles WHERE code='patient'`)).rows[0];
    const u = (await client.query(
      `INSERT INTO users (username, email, phone, full_name, password_hash, role_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [phone, email || null, phone, full_name, pwHash, role.id]
    )).rows[0];
    const patientNumber = await nextReference('PAT', client);
    const p = (await client.query(
      `INSERT INTO patients (patient_number, user_id, full_name, phone, email, gender, date_of_birth)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, patient_number`,
      [patientNumber, u.id, full_name, phone, email || null, gender || null, date_of_birth || null]
    )).rows[0];
    return { userId: u.id, patient: p };
  });

  req.user = { id: result.userId, role: 'patient', name: full_name };
  await audit(req, 'PATIENT_REGISTERED', 'patients', result.patient.id);
  await notifyRole('receptionist', 'new_patient', 'New patient registration',
    `${full_name} registered on the patient portal (${result.patient.patient_number}).`, result.patient.patient_number);
  await issueRefresh(result.userId, res);
  const user = { id: result.userId, full_name, role_code: 'patient' };
  ok(res, {
    access_token: signAccess(user),
    user: { id: result.userId, full_name, role: 'patient' },
    patient: { ...result.patient, full_name, phone },
  }, 'Account created', 201);
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  let patient = null;
  if (req.user.role === 'patient') {
    patient = await one('SELECT id, patient_number, full_name, phone, email, gender, date_of_birth, address, insurance_type FROM patients WHERE user_id=$1', [req.user.id]);
  }
  ok(res, { user: req.user, patient }, 'OK');
}));

const pwSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(8).max(200) });
authRouter.post('/change-password', requireAuth, validate(pwSchema), wrap(async (req, res) => {
  const user = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await verifyPassword(req.body.current_password, user.password_hash))) {
    throw fail(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  await q('UPDATE users SET password_hash=$1, must_change_pw=false WHERE id=$2',
    [await hashPassword(req.body.new_password), req.user.id]);
  await audit(req, 'PASSWORD_CHANGED', 'users', req.user.id);
  ok(res, {}, 'Password updated');
}));
