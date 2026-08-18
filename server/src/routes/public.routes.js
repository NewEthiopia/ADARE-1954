// Public website content APIs (no auth): services, doctors, departments,
// news, health education, leaders, gallery, settings/stats, contact, search.
import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { notifyRole } from '../notify.js';

export const publicRouter = Router();

publicRouter.get('/settings', wrap(async (_req, res) => {
  // internal_* keys are LAN-only system links for staff — never exposed publicly
  const rows = (await q(`SELECT key, value FROM hospital_settings WHERE key NOT LIKE 'internal\\_%'`)).rows;
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  ok(res, { settings }, 'Settings');
}));

publicRouter.get('/departments', wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT id, slug, name, name_am, description, location, phone
     FROM departments WHERE is_active ORDER BY sort_order, name`)).rows;
  ok(res, { departments: rows }, 'Departments');
}));

publicRouter.get('/services', wrap(async (req, res) => {
  const params = []; const where = ['s.is_active'];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }
  if (req.query.department) { params.push(req.query.department); where.push(`d.slug = $${params.length}`); }
  if (req.query.emergency === '1') where.push('s.emergency');
  const rows = (await q(
    `SELECT s.id, s.slug, s.name, s.description, s.available_days, s.working_hours,
            s.location, s.contact, s.bookable, s.emergency, d.name AS department, d.slug AS department_slug
     FROM services s LEFT JOIN departments d ON d.id = s.department_id
     WHERE ${where.join(' AND ')} ORDER BY s.name`, params)).rows;
  ok(res, { services: rows }, 'Services');
}));

publicRouter.get('/doctors', wrap(async (req, res) => {
  const params = []; const where = ['doc.is_active'];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(doc.full_name ILIKE $${params.length} OR doc.specialty ILIKE $${params.length})`); }
  if (req.query.department) { params.push(req.query.department); where.push(`d.slug = $${params.length}`); }
  const rows = (await q(
    `SELECT doc.id, doc.slug, doc.full_name, doc.title, doc.specialty, doc.qualifications,
            doc.languages, doc.working_days, doc.working_hours, doc.accepts_appointments,
            doc.biography, doc.photo_path, d.name AS department, d.slug AS department_slug
     FROM doctors doc LEFT JOIN departments d ON d.id = doc.department_id
     WHERE ${where.join(' AND ')} ORDER BY doc.full_name`, params)).rows;
  ok(res, { doctors: rows }, 'Doctors');
}));

publicRouter.get('/leaders', wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT id, full_name, position, order_label, period, biography, photo_path, is_current
     FROM leaders WHERE is_active ORDER BY sort_order`)).rows;
  ok(res, { leaders: rows }, 'Leaders');
}));

publicRouter.get('/gallery', wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT id, title, category, image_path, caption, is_featured
     FROM gallery WHERE deleted_at IS NULL ORDER BY sort_order, id DESC LIMIT 60`)).rows;
  ok(res, { gallery: rows }, 'Gallery');
}));

publicRouter.get('/news', wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const per = Math.min(24, Math.max(3, Number(req.query.per_page || 9)));
  const params = []; const where = [`n.deleted_at IS NULL`, `n.status='PUBLISHED'`, `(n.publish_at IS NULL OR n.publish_at <= now())`];
  if (req.query.category) { params.push(req.query.category); where.push(`c.slug = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(n.title ILIKE $${params.length} OR n.excerpt ILIKE $${params.length})`); }
  const base = `FROM news n LEFT JOIN news_categories c ON c.id = n.category_id WHERE ${where.join(' AND ')}`;
  const total = Number((await q(`SELECT count(*) ${base}`, params)).rows[0].count);
  const rows = (await q(
    `SELECT n.id, n.slug, n.title, n.excerpt, n.image_path, n.is_featured, n.publish_at, n.created_at,
            c.name AS category, c.slug AS category_slug
     ${base} ORDER BY coalesce(n.publish_at, n.created_at) DESC
     LIMIT ${per} OFFSET ${(page - 1) * per}`, params)).rows;
  ok(res, { news: rows, total, page, per_page: per }, 'News');
}));

publicRouter.get('/news/:slug', wrap(async (req, res) => {
  const row = await one(
    `SELECT n.id, n.slug, n.title, n.excerpt, n.body_html, n.image_path, n.publish_at, n.created_at,
            c.name AS category, u.full_name AS author
     FROM news n LEFT JOIN news_categories c ON c.id=n.category_id LEFT JOIN users u ON u.id=n.author_id
     WHERE n.slug=$1 AND n.deleted_at IS NULL AND n.status='PUBLISHED'`, [req.params.slug]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Article not found.');
  ok(res, { article: row }, 'Article');
}));

publicRouter.get('/health-articles', wrap(async (req, res) => {
  const params = []; const where = [`status='PUBLISHED'`];
  if (req.query.category) { params.push(req.query.category); where.push(`category = $${params.length}`); }
  const rows = (await q(
    `SELECT id, slug, title, category, body_html, updated_at FROM health_articles
     WHERE ${where.join(' AND ')} ORDER BY category, title`, params)).rows;
  ok(res, { articles: rows }, 'Health education');
}));

// Global public search (services, doctors, departments, news, health ed)
publicRouter.get('/search', wrap(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) throw fail(422, 'VALIDATION', 'Enter at least 2 characters.');
  const like = `%${term}%`;
  const [services, doctors, departments, news, articles] = await Promise.all([
    q(`SELECT slug, name, 'service' AS kind FROM services WHERE is_active AND name ILIKE $1 LIMIT 6`, [like]),
    q(`SELECT slug, full_name AS name, 'doctor' AS kind FROM doctors WHERE is_active AND (full_name ILIKE $1 OR specialty ILIKE $1) LIMIT 6`, [like]),
    q(`SELECT slug, name, 'department' AS kind FROM departments WHERE is_active AND name ILIKE $1 LIMIT 6`, [like]),
    q(`SELECT slug, title AS name, 'news' AS kind FROM news WHERE deleted_at IS NULL AND status='PUBLISHED' AND title ILIKE $1 LIMIT 6`, [like]),
    q(`SELECT slug, title AS name, 'health' AS kind FROM health_articles WHERE status='PUBLISHED' AND title ILIKE $1 LIMIT 6`, [like]),
  ]);
  ok(res, {
    results: [...services.rows, ...doctors.rows, ...departments.rows, ...news.rows, ...articles.rows],
  }, 'Search');
}));

// Contact form → stored, visible in admin dashboard
const contactSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email().max(150).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  subject: z.string().max(200).optional().or(z.literal('')),
  message: z.string().min(5).max(4000),
});
publicRouter.post('/contact', validate(contactSchema), wrap(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  await q(
    `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5)`,
    [name, email || null, phone || null, subject || null, message]
  );
  await notifyRole('hospital_admin', 'contact_message', 'New contact message',
    `${name}: ${(subject || message).slice(0, 120)}`);
  ok(res, {}, 'Message received. Our team will get back to you.');
}));
