// Public website content APIs (no auth): services, doctors, departments,
// news, health education, leaders, gallery, settings/stats, contact, search.
import { Router } from 'express';
import { z } from 'zod';
import iconv from 'iconv-lite';
import { q, one } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { notifyRole } from '../notify.js';

export const publicRouter = Router();

const fallbackSettings = {
  hospital_name: 'Adare General Hospital',
  hospital_tagline: 'Compassionate Care. Professional Excellence. Better Health.',
  phone_emergency: '046 221 1661',
  stat_years_of_service: '65', stat_departments: '12', stat_health_professionals: '461',
  stat_opd_attendances: '183759', stat_emergency_visits: '39253',
};
const fallbackServices = [
  { id: 'emergency', slug: 'emergency-care', name: 'Emergency & Trauma Care', description: 'Immediate care for injuries, trauma and sudden medical conditions.', available_days: 'Every day', working_hours: '24 hours', emergency: true, bookable: false, department: 'Emergency & Trauma Unit' },
  { id: 'opd', slug: 'general-consultation', name: 'General Consultation (OPD)', description: 'Consultation for new and returning patients with triage and referral.', available_days: 'Mon-Fri', working_hours: '8:00-17:00', emergency: false, bookable: true, department: 'Outpatient Department' },
  { id: 'mch', slug: 'antenatal-care', name: 'Antenatal Care', description: 'Pregnancy follow-up, screening and birth planning.', available_days: 'Mon-Fri', working_hours: '8:00-17:00', emergency: false, bookable: true, department: 'Maternal & Child Health' },
];
const fallbackDoctors = [{ id: 'team', full_name: 'Adare Clinical Team', title: 'Healthcare Professionals', specialty: 'General care', department: 'Outpatient Department', working_days: 'Mon-Fri', working_hours: '8:00-17:00' }];

const decodeLegacyText = (value) => {
  if (value == null) return value;
  const codePage = [
    0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021,
    0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
    0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
  ];
  const mojibake = [...Buffer.from(value, 'base64')]
    .map((byte) => String.fromCodePoint(byte >= 0x80 && byte <= 0x9f ? codePage[byte - 0x80] : byte))
    .join('');
  const bytes = Buffer.from([...mojibake].flatMap((character) => {
    const code = character.codePointAt(0);
    if (code >= 0x80 && code <= 0x9f) return [code];
    return [...iconv.encode(character, 'win1252')];
  }));
  return iconv.decode(bytes, 'utf8').replace(/\u129d\u1743/g, '\u1290\u1343');
};

publicRouter.get('/settings', wrap(async (_req, res) => {
  // internal_* keys are LAN-only system links for staff — never exposed publicly
  let rows;
  try { rows = (await q(`SELECT key, value FROM hospital_settings WHERE key NOT LIKE 'internal\\_%'`)).rows; }
  catch { rows = Object.entries(fallbackSettings).map(([key, value]) => ({ key, value })); }
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
  let rows;
  try { rows = (await q(
    `SELECT s.id, s.slug, s.name, s.description, s.available_days, s.working_hours,
            s.location, s.contact, s.bookable, s.emergency, d.name AS department, d.slug AS department_slug
     FROM services s LEFT JOIN departments d ON d.id = s.department_id
     WHERE ${where.join(' AND ')} ORDER BY s.name`, params)).rows; }
  catch { rows = fallbackServices; }
  ok(res, { services: rows }, 'Services');
}));

publicRouter.get('/doctors', wrap(async (req, res) => {
  const params = []; const where = ['doc.is_active'];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(doc.full_name ILIKE $${params.length} OR doc.specialty ILIKE $${params.length})`); }
  if (req.query.department) { params.push(req.query.department); where.push(`d.slug = $${params.length}`); }
  let rows;
  try { rows = (await q(
    `SELECT doc.id, doc.slug, doc.full_name, doc.title, doc.specialty, doc.qualifications,
            doc.languages, doc.working_days, doc.working_hours, doc.accepts_appointments,
            doc.biography, doc.photo_path, d.name AS department, d.slug AS department_slug
     FROM doctors doc LEFT JOIN departments d ON d.id = doc.department_id
      WHERE ${where.join(' AND ')} ORDER BY doc.full_name`, params)).rows; }
    catch { rows = fallbackDoctors; }
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
    `SELECT n.id, n.slug,
            encode(convert_to(n.title, 'WIN1252'), 'base64') AS title_b64,
            encode(convert_to(n.excerpt, 'WIN1252'), 'base64') AS excerpt_b64,
            n.image_path, n.is_featured, n.publish_at, n.created_at,
            c.name AS category, c.slug AS category_slug
     ${base} ORDER BY coalesce(n.publish_at, n.created_at) DESC
     LIMIT ${per} OFFSET ${(page - 1) * per}`, params)).rows;
  ok(res, {
    news: rows.map(({ title_b64, excerpt_b64, ...row }) => ({
      ...row,
      title: decodeLegacyText(title_b64),
      excerpt: decodeLegacyText(excerpt_b64),
    })),
    total,
    page,
    per_page: per,
  }, 'News');
}));

publicRouter.get('/news/:slug', wrap(async (req, res) => {
  const row = await one(
    `SELECT n.id, n.slug,
            encode(convert_to(n.title, 'WIN1252'), 'base64') AS title_b64,
            encode(convert_to(n.excerpt, 'WIN1252'), 'base64') AS excerpt_b64,
            encode(convert_to(n.body_html, 'WIN1252'), 'base64') AS body_html_b64,
            n.image_path, n.publish_at, n.created_at,
            c.name AS category, u.full_name AS author
     FROM news n LEFT JOIN news_categories c ON c.id=n.category_id LEFT JOIN users u ON u.id=n.author_id
     WHERE n.slug=$1 AND n.deleted_at IS NULL AND n.status='PUBLISHED'`, [req.params.slug]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Article not found.');
  const { title_b64, excerpt_b64, body_html_b64, ...article } = row;
  ok(res, {
    article: {
      ...article,
      title: decodeLegacyText(title_b64),
      excerpt: decodeLegacyText(excerpt_b64),
      body_html: decodeLegacyText(body_html_b64),
    },
  }, 'Article');
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
