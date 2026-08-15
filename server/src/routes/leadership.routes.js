// Leadership CMS API (spec: GET/POST/PATCH/DELETE /api/leadership)
// Public read (active only) · content_manager/admin write · audited.
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, one } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, audit } from '../auth.js';
import { config } from '../config.js';

export const leadershipRouter = Router();

const LEADER_FIELDS = `id, full_name, position, order_label AS manager_number, period,
                       biography AS description, photo_path AS photo_url, is_current,
                       sort_order AS display_order, is_active AS active`;

// ---------- public ----------
leadershipRouter.get('/', wrap(async (req, res) => {
  const all = req.query.all === '1';
  let rows;
  if (all) {
    // full list for CMS — requires staff auth
    await new Promise((resolve, reject) => requireAuth(req, res, (e) => e ? reject(e) : resolve()));
    rows = (await q(`SELECT ${LEADER_FIELDS} FROM leaders ORDER BY sort_order, id`)).rows;
  } else {
    rows = (await q(`SELECT ${LEADER_FIELDS} FROM leaders WHERE is_active ORDER BY sort_order, id`)).rows;
  }
  ok(res, { leadership: rows }, 'Leadership');
}));

leadershipRouter.get('/:id(\\d+)', wrap(async (req, res) => {
  const row = await one(`SELECT ${LEADER_FIELDS} FROM leaders WHERE id=$1 AND is_active`, [Number(req.params.id)]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Leader not found.');
  ok(res, { leader: row }, 'Leader');
}));

// ---------- CMS (content_manager + admins) ----------
const upsertSchema = z.object({
  full_name: z.string().min(2).max(150),
  position: z.string().min(2).max(150),
  manager_number: z.string().max(20).optional().or(z.literal('')),   // e.g. "7th"
  period: z.string().max(80).optional().or(z.literal('')),
  description: z.string().max(4000).optional().or(z.literal('')),
  is_current: z.boolean().optional(),
  display_order: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

leadershipRouter.post('/', requireAuth, requireRole('content_manager'), validate(upsertSchema),
  wrap(async (req, res) => {
    const b = req.body;
    if (b.is_current) await q('UPDATE leaders SET is_current=false');   // single current manager
    const row = await one(
      `INSERT INTO leaders (full_name, position, order_label, period, biography, is_current, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${LEADER_FIELDS}`,
      [b.full_name, b.position, b.manager_number || null, b.period || null, b.description || null,
       b.is_current ?? false, b.display_order ?? 100, b.active ?? true]);
    await audit(req, 'LEADER_CREATED', 'leaders', row.id, b.full_name);
    ok(res, { leader: row }, 'Leader added', 201);
  }));

leadershipRouter.patch('/:id(\\d+)', requireAuth, requireRole('content_manager'),
  validate(upsertSchema.partial()), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const target = await one('SELECT id, full_name FROM leaders WHERE id=$1', [id]);
    if (!target) throw fail(404, 'NOT_FOUND', 'Leader not found.');
    if (req.body.is_current === true) await q('UPDATE leaders SET is_current=false');
    const map = { full_name: 'full_name', position: 'position', manager_number: 'order_label',
                  period: 'period', description: 'biography', is_current: 'is_current',
                  display_order: 'sort_order', active: 'is_active' };
    const sets = []; const params = [];
    for (const [k, col] of Object.entries(map)) {
      if (req.body[k] === undefined) continue;
      params.push(req.body[k] === '' ? null : req.body[k]);
      sets.push(`${col}=$${params.length}`);
    }
    if (!sets.length) throw fail(422, 'VALIDATION', 'No changes submitted.');
    params.push(id);
    const row = await one(`UPDATE leaders SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length} RETURNING ${LEADER_FIELDS}`, params);
    await audit(req, 'LEADER_UPDATED', 'leaders', id, sets.map(s => s.split('=')[0]).join(','));
    ok(res, { leader: row }, 'Leader updated');
  }));

leadershipRouter.delete('/:id(\\d+)', requireAuth, requireRole('content_manager'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const target = await one('SELECT id, full_name FROM leaders WHERE id=$1', [id]);
  if (!target) throw fail(404, 'NOT_FOUND', 'Leader not found.');
  // soft-hide rather than destroy history
  await q('UPDATE leaders SET is_active=false, updated_at=now() WHERE id=$1', [id]);
  await audit(req, 'LEADER_HIDDEN', 'leaders', id, target.full_name);
  ok(res, {}, 'Leader hidden');
}));

// ---------- photo upload (real image validation, WebP variant) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

const MAGIC = [
  { sig: [0xFF, 0xD8, 0xFF], ext: 'jpg' },
  { sig: [0x89, 0x50, 0x4E, 0x47], ext: 'png' },
  { sig: [0x52, 0x49, 0x46, 0x46], ext: 'webp' },   // RIFF….WEBP
];
function sniff(buf) {
  for (const m of MAGIC) {
    if (m.sig.every((b, i) => buf[i] === b)) {
      if (m.ext === 'webp' && buf.slice(8, 12).toString() !== 'WEBP') continue;
      return m.ext;
    }
  }
  return null;
}

leadershipRouter.post('/:id(\\d+)/photo', requireAuth, requireRole('content_manager'),
  upload.single('photo'), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const target = await one('SELECT id FROM leaders WHERE id=$1', [id]);
    if (!target) throw fail(404, 'NOT_FOUND', 'Leader not found.');
    if (!req.file) throw fail(422, 'VALIDATION', 'Attach a photo file (field name: photo).');
    const ext = sniff(req.file.buffer);
    if (!ext) throw fail(415, 'UPLOAD_TYPE', 'Photos must be JPEG, PNG or WebP images.');
    const dir = path.join(config.uploadDir, 'leaders');
    fs.mkdirSync(dir, { recursive: true });
    const name = `leader-${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, name), req.file.buffer, { mode: 0o644 });
    const publicPath = `/uploads/leaders/${name}`;
    await q('UPDATE leaders SET photo_path=$1, updated_at=now() WHERE id=$2', [publicPath, id]);
    await audit(req, 'LEADER_PHOTO_UPLOADED', 'leaders', id, name);
    ok(res, { photo_url: publicPath }, 'Photo uploaded');
  }));
