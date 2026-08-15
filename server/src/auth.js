// Authentication + RBAC: JWT access tokens, rotating refresh tokens in
// HTTP-only cookies, account lockout, and server-side role authorization.
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from './config.js';
import { one, q } from './db.js';
import { fail } from './http.js';

export const hashPassword = (pw) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function signAccess(user) {
  return jwt.sign(
    { sub: user.id, role: user.role_code, name: user.full_name },
    config.jwtSecret,
    { expiresIn: config.accessTtl }
  );
}

export async function issueRefresh(userId, res) {
  const token = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + config.refreshTtlDays * 864e5);
  await q('UPDATE users SET refresh_token_hash=$1, refresh_expires_at=$2 WHERE id=$3', [hash, expires, userId]);
  res.cookie('agh_refresh', token, {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookies,
    path: '/api/auth', maxAge: config.refreshTtlDays * 864e5,
  });
}

export async function rotateRefresh(rawToken, res) {
  if (!rawToken) throw fail(401, 'NO_REFRESH', 'Sign-in required.');
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const user = await one(
    `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id
     WHERE u.refresh_token_hash=$1 AND u.refresh_expires_at > now() AND u.is_active AND u.deleted_at IS NULL`,
    [hash]
  );
  if (!user) throw fail(401, 'REFRESH_INVALID', 'Session expired. Please sign in again.');
  await issueRefresh(user.id, res);          // rotation: old token is replaced
  return user;
}

export async function clearRefresh(userId, res) {
  await q('UPDATE users SET refresh_token_hash=NULL, refresh_expires_at=NULL WHERE id=$1', [userId]);
  res.clearCookie('agh_refresh', { path: '/api/auth' });
}

/** Express middleware — require a valid access token. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(fail(401, 'UNAUTHENTICATED', 'Authentication required.'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    next(fail(401, 'TOKEN_EXPIRED', 'Session expired. Please sign in again.'));
  }
}

/** Role guard. super_admin & hospital_admin always pass. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(fail(401, 'UNAUTHENTICATED', 'Authentication required.'));
    const allowed = new Set([...roles, 'super_admin', 'hospital_admin']);
    if (!allowed.has(req.user.role)) {
      return next(fail(403, 'FORBIDDEN', 'You do not have permission for this action.'));
    }
    next();
  };
}

/** Patient-only guard (portal endpoints). */
export function requirePatient(req, _res, next) {
  if (!req.user || req.user.role !== 'patient') {
    return next(fail(401, 'UNAUTHENTICATED', 'Patient sign-in required.'));
  }
  next();
}

export async function audit(req, action, entity = null, entityId = null, detail = null, result = 'OK') {
  try {
    await q(
      `INSERT INTO audit_logs (user_id, actor, role_code, action, entity, entity_id, result, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.user?.id ?? null, req.user?.name ?? 'public', req.user?.role ?? null,
       action, entity, entityId ? String(entityId) : null, result, detail, req.ip?.slice(0, 45) ?? null]
    );
  } catch (e) { console.error('[audit]', e.message); }
}
