// Admin: dashboard KPIs, staff/user management, CMS (news/leaders/gallery/settings),
// contact inbox, notifications, audit log, reports.
import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, hashPassword, audit } from '../auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

// ---------- dashboard ----------
adminRouter.get('/dashboard', requireRole('receptionist', 'doctor', 'nurse', 'finance', 'content_manager', 'pharmacy', 'laboratory'),
  wrap(async (_req, res) => {
    const [kpi, apptByDay, apptStatus, regByDay, revenue, recent] = await Promise.all([
      one(`SELECT
        (SELECT count(*) FROM patients WHERE deleted_at IS NULL) AS total_patients,
        (SELECT count(*) FROM appointments WHERE preferred_date = CURRENT_DATE OR scheduled_date = CURRENT_DATE) AS todays_appointments,
        (SELECT count(*) FROM appointments WHERE status='PENDING') AS pending_appointments,
        (SELECT count(*) FROM appointments WHERE status='COMPLETED') AS completed_appointments,
        (SELECT count(*) FROM users WHERE is_active AND deleted_at IS NULL AND role_id != (SELECT id FROM roles WHERE code='patient')) AS active_staff,
        (SELECT coalesce(sum(amount),0) FROM payments WHERE status='SUCCESSFUL' AND created_at::date = CURRENT_DATE) AS today_revenue,
        (SELECT count(*) FROM payments WHERE status='PENDING') AS pending_payments,
        (SELECT count(*) FROM contact_messages WHERE NOT is_read) AS unread_messages`),
      q(`SELECT created_at::date AS day, count(*) c FROM appointments WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
      q(`SELECT status, count(*) c FROM appointments GROUP BY status`),
      q(`SELECT created_at::date AS day, count(*) c FROM patients WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
      q(`SELECT created_at::date AS day, coalesce(sum(amount) FILTER (WHERE status='SUCCESSFUL'),0) v FROM payments WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
      q(`SELECT a.reference, a.patient_name, d.name AS department, a.preferred_date, a.status, a.created_at
         FROM appointments a LEFT JOIN departments d ON d.id=a.department_id ORDER BY a.created_at DESC LIMIT 10`),
    ]);
    ok(res, {
      kpi, appointments_by_day: apptByDay.rows, appointment_status: apptStatus.rows,
      registrations_by_day: regByDay.rows, revenue_by_day: revenue.rows, recent: recent.rows,
    }, 'Dashboard');
  }));

// ---------- notifications (staff feed) ----------
adminRouter.get('/notifications', wrap(async (req, res) => {
  const rows = (await q(
    `SELECT id, type, title, body, reference, is_read, created_at FROM notifications
     WHERE audience='staff' OR (audience='role' AND role_code=$1) OR (audience='user' AND user_id=$2)
     ORDER BY id DESC LIMIT 50`, [req.user.role, req.user.id])).rows;
  const unread = await one(
    `SELECT count(*) c FROM notifications
     WHERE (audience='staff' OR (audience='role' AND role_code=$1) OR (audience='user' AND user_id=$2)) AND NOT is_read`,
    [req.user.role, req.user.id]);
  ok(res, { notifications: rows, unread_count: Number(unread.c) }, 'Notifications');
}));
adminRouter.post('/notifications/read', wrap(async (req, res) => {
  if (req.body?.all) {
    await q(`UPDATE notifications SET is_read=true, read_at=now()
             WHERE NOT is_read AND (audience='staff' OR (audience='role' AND role_code=$1) OR (audience='user' AND user_id=$2))`,
      [req.user.role, req.user.id]);
  } else if (req.body?.id) {
    await q(`UPDATE notifications SET is_read=true, read_at=now() WHERE id=$1`, [Number(req.body.id)]);
  }
  ok(res, {}, 'Updated');
}));

// ---------- staff management (admin only) ----------
const STAFF_ROLES = ['super_admin','hospital_admin','receptionist','doctor','nurse','pharmacy','laboratory','finance','content_manager'];

adminRouter.get('/users', requireRole(), wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT u.id, u.username, u.email, u.phone, u.full_name, r.code AS role, d.name AS department,
            u.is_active, u.last_login_at, u.created_at
     FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id
     WHERE u.deleted_at IS NULL AND r.code != 'patient' ORDER BY u.full_name`)).rows;
  ok(res, { users: rows }, 'Users');
}));

const userCreateSchema = z.object({
  username: z.string().regex(/^[a-z0-9._-]{3,60}$/),
  full_name: z.string().min(2).max(150),
  role: z.enum(STAFF_ROLES),
  password: z.string().min(10).max(200),
  email: z.string().email().max(150).optional().or(z.literal('')),
  department_id: z.number().int().positive().optional().nullable(),
});
adminRouter.post('/users', requireRole(), validate(userCreateSchema), wrap(async (req, res) => {
  const b = req.body;
  if (b.role === 'super_admin' && req.user.role !== 'super_admin') {
    throw fail(403, 'FORBIDDEN', 'Only a super administrator can create super administrators.');
  }
  const dup = await one('SELECT id FROM users WHERE username=$1', [b.username]);
  if (dup) throw fail(409, 'DUPLICATE', 'That username is already taken.');
  const role = await one('SELECT id FROM roles WHERE code=$1', [b.role]);
  const row = await one(
    `INSERT INTO users (username, full_name, email, password_hash, role_id, department_id, must_change_pw)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id, username`,
    [b.username, b.full_name, b.email || null, await hashPassword(b.password), role.id, b.department_id ?? null]);
  await audit(req, 'USER_CREATED', 'users', row.id, `role ${b.role}`);
  ok(res, { user: row }, 'User created', 201);
}));

const userPatchSchema = z.object({
  action: z.enum(['enable', 'disable', 'reset_password', 'update']),
  password: z.string().min(10).max(200).optional(),
  full_name: z.string().min(2).max(150).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  department_id: z.number().int().positive().nullable().optional(),
});
adminRouter.patch('/users/:id', requireRole(), validate(userPatchSchema), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const target = await one('SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1', [id]);
  if (!target) throw fail(404, 'NOT_FOUND', 'User not found.');
  const { action } = req.body;
  if (action === 'disable') {
    if (id === req.user.id) throw fail(422, 'VALIDATION', 'You cannot deactivate your own account.');
    await q('UPDATE users SET is_active=false, refresh_token_hash=NULL WHERE id=$1', [id]);
    await audit(req, 'USER_DISABLED', 'users', id);
  } else if (action === 'enable') {
    await q('UPDATE users SET is_active=true, failed_attempts=0, locked_until=NULL WHERE id=$1', [id]);
    await audit(req, 'USER_UPDATED', 'users', id, 'enabled');
  } else if (action === 'reset_password') {
    if (!req.body.password) throw fail(422, 'VALIDATION', 'Provide a new password (min 10 characters).');
    await q('UPDATE users SET password_hash=$1, must_change_pw=true, refresh_token_hash=NULL WHERE id=$2',
      [await hashPassword(req.body.password), id]);
    await audit(req, 'USER_PASSWORD_RESET', 'users', id);
  } else {
    const sets = []; const params = [];
    if (req.body.full_name) { params.push(req.body.full_name); sets.push(`full_name=$${params.length}`); }
    if (req.body.role) {
      const role = await one('SELECT id FROM roles WHERE code=$1', [req.body.role]);
      params.push(role.id); sets.push(`role_id=$${params.length}`);
    }
    if ('department_id' in req.body) { params.push(req.body.department_id); sets.push(`department_id=$${params.length}`); }
    if (!sets.length) throw fail(422, 'VALIDATION', 'No changes submitted.');
    params.push(id);
    await q(`UPDATE users SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
    await audit(req, 'USER_UPDATED', 'users', id, sets.map(s => s.split('=')[0]).join(','));
  }
  ok(res, {}, 'User updated');
}));

// ---------- news CMS ----------
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150);
// Allow-list HTML sanitizer for the rich text editor
function sanitizeHtml(html) {
  let out = String(html || '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)[^>]*\/?>/gi, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1="#"');
  return out;
}

adminRouter.get('/news', requireRole('content_manager'), wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT n.id, n.slug, n.title, n.excerpt, n.status, n.is_featured, n.publish_at, n.created_at,
            c.name AS category, u.full_name AS author
     FROM news n LEFT JOIN news_categories c ON c.id=n.category_id LEFT JOIN users u ON u.id=n.author_id
     WHERE n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 200`)).rows;
  const categories = (await q('SELECT id, slug, name FROM news_categories ORDER BY name')).rows;
  ok(res, { news: rows, categories }, 'News');
}));

const newsSchema = z.object({
  title: z.string().min(3).max(200),
  excerpt: z.string().max(500).optional().or(z.literal('')),
  body_html: z.string().max(100000).optional().or(z.literal('')),
  category_id: z.number().int().positive().optional().nullable(),
  tags: z.string().max(255).optional().or(z.literal('')),
  is_featured: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED']).optional(),
  publish_at: z.string().optional().or(z.literal('')),
});
adminRouter.post('/news', requireRole('content_manager'), validate(newsSchema), wrap(async (req, res) => {
  const b = req.body;
  let slug = slugify(b.title);
  const exists = await one('SELECT id FROM news WHERE slug=$1', [slug]);
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;
  const row = await one(
    `INSERT INTO news (slug, title, excerpt, body_html, category_id, tags, author_id, is_featured, status, publish_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, slug`,
    [slug, b.title, b.excerpt || null, sanitizeHtml(b.body_html), b.category_id ?? null, b.tags || null,
     req.user.id, b.is_featured ?? false, b.status || 'DRAFT', b.publish_at || null]);
  await audit(req, 'NEWS_CREATED', 'news', row.id, b.title);
  ok(res, { article: row }, 'Article created', 201);
}));

adminRouter.patch('/news/:id', requireRole('content_manager'), validate(newsSchema.partial().extend({
  action: z.enum(['update', 'publish', 'unpublish', 'delete']).optional(),
})), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const target = await one('SELECT id, title FROM news WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!target) throw fail(404, 'NOT_FOUND', 'Article not found.');
  const action = req.body.action || 'update';
  if (action === 'delete') {
    await q('UPDATE news SET deleted_at=now() WHERE id=$1', [id]);
    await audit(req, 'NEWS_DELETED', 'news', id, target.title);
    return ok(res, {}, 'Article deleted');
  }
  if (action === 'publish') {
    await q(`UPDATE news SET status='PUBLISHED', publish_at=coalesce(publish_at, now()), updated_at=now() WHERE id=$1`, [id]);
    await audit(req, 'NEWS_PUBLISHED', 'news', id, target.title);
    return ok(res, {}, 'Article published');
  }
  if (action === 'unpublish') {
    await q(`UPDATE news SET status='DRAFT', updated_at=now() WHERE id=$1`, [id]);
    await audit(req, 'NEWS_UNPUBLISHED', 'news', id, target.title);
    return ok(res, {}, 'Article unpublished');
  }
  const sets = []; const params = [];
  const fields = { title: req.body.title, excerpt: req.body.excerpt, tags: req.body.tags, publish_at: req.body.publish_at || null };
  if (req.body.body_html !== undefined) fields.body_html = sanitizeHtml(req.body.body_html);
  if (req.body.category_id !== undefined) fields.category_id = req.body.category_id;
  if (req.body.is_featured !== undefined) fields.is_featured = req.body.is_featured;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    params.push(v === '' ? null : v); sets.push(`${k}=$${params.length}`);
  }
  if (!sets.length) throw fail(422, 'VALIDATION', 'No changes submitted.');
  params.push(id);
  await q(`UPDATE news SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
  await audit(req, 'NEWS_UPDATED', 'news', id);
  ok(res, {}, 'Article updated');
}));

// ---------- settings CMS ----------
adminRouter.get('/settings', requireRole('content_manager'), wrap(async (_req, res) => {
  const rows = (await q('SELECT key, value, description, updated_at FROM hospital_settings ORDER BY key')).rows;
  ok(res, { settings: rows }, 'Settings');
}));
adminRouter.patch('/settings', requireRole(), validate(z.object({
  key: z.string().min(2).max(80), value: z.string().max(4000),
})), wrap(async (req, res) => {
  const r = await q('UPDATE hospital_settings SET value=$1, updated_at=now() WHERE key=$2', [req.body.value, req.body.key]);
  if (!r.rowCount) throw fail(404, 'NOT_FOUND', 'Unknown setting key.');
  await audit(req, 'SETTING_UPDATED', 'hospital_settings', req.body.key);
  ok(res, {}, 'Setting updated');
}));

// ---------- contact inbox ----------
adminRouter.get('/contact-messages', requireRole('content_manager'), wrap(async (_req, res) => {
  const rows = (await q('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200')).rows;
  ok(res, { messages: rows }, 'Messages');
}));
adminRouter.post('/contact-messages/:id/read', requireRole('content_manager'), wrap(async (req, res) => {
  await q('UPDATE contact_messages SET is_read=true WHERE id=$1', [Number(req.params.id)]);
  ok(res, {}, 'Marked read');
}));

// ---------- audit log (admins only) ----------
adminRouter.get('/audit', requireRole(), wrap(async (req, res) => {
  const params = []; const where = ['1=1'];
  if (req.query.action) { params.push(String(req.query.action).toUpperCase()); where.push(`action = $${params.length}`); }
  if (req.query.user) { params.push(`%${req.query.user}%`); where.push(`actor ILIKE $${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`created_at::date >= $${params.length}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`created_at::date <= $${params.length}`); }
  const rows = (await q(
    `SELECT id, actor, role_code, action, entity, entity_id, result, detail, ip, created_at
     FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 200`, params)).rows;
  ok(res, { logs: rows }, 'Audit log');
}));

// ---------- reports ----------
adminRouter.get('/reports/appointments', requireRole('finance', 'receptionist'), wrap(async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const [byDay, byDept, byStatus, cancellations] = await Promise.all([
    q(`SELECT created_at::date AS day, count(*) c FROM appointments WHERE created_at::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [from, to]),
    q(`SELECT coalesce(d.name,'Unassigned') AS department, count(*) c FROM appointments a LEFT JOIN departments d ON d.id=a.department_id
       WHERE a.created_at::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY c DESC`, [from, to]),
    q(`SELECT status, count(*) c FROM appointments WHERE created_at::date BETWEEN $1 AND $2 GROUP BY 1`, [from, to]),
    one(`SELECT count(*) c FROM appointments WHERE status IN ('CANCELLED','NO_SHOW') AND created_at::date BETWEEN $1 AND $2`, [from, to]),
  ]);
  ok(res, { from, to, by_day: byDay.rows, by_department: byDept.rows, by_status: byStatus.rows, cancellations: Number(cancellations.c) }, 'Report');
}));
