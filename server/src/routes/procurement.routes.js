// Public tender listings, buyer payment submissions, and protected document downloads.
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, one, tx, nextReference } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, audit } from '../auth.js';
import { notifyRole } from '../notify.js';

export const procurementRouter = Router();
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const paymentSchema = z.object({
  payer_name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9\s-]{6,20}$/).transform(v => v.replace(/[\s-]/g, '')),
  method: z.enum(['telebirr', 'bank_transfer', 'card', 'cash', 'other']),
  provider_ref: z.string().max(120).optional().or(z.literal('')),
});

function tenderView(row) {
  return { ...row, download_available: Boolean(row.released_at), file_name: undefined, file_path: undefined };
}

procurementRouter.get('/', wrap(async (_req, res) => {
  const rows = (await q(`SELECT id, reference, title, description, price, currency, deadline, status, released_at, created_at
    FROM procurement_tenders WHERE status='PUBLISHED' AND (deadline IS NULL OR deadline >= now()) ORDER BY deadline NULLS LAST, created_at DESC`)).rows;
  ok(res, { tenders: rows.map(tenderView) }, 'Procurement tenders');
}));

procurementRouter.get('/:id(\\d+)', wrap(async (req, res) => {
  const row = await one(`SELECT id, reference, title, description, price, currency, deadline, status, released_at, created_at
    FROM procurement_tenders WHERE id=$1 AND status='PUBLISHED'`, [Number(req.params.id)]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Tender not found.');
  ok(res, { tender: tenderView(row) }, 'Tender');
}));

procurementRouter.post('/:id(\\d+)/payments', validate(paymentSchema), wrap(async (req, res) => {
  const tender = await one(`SELECT id, reference, price, currency, status, deadline FROM procurement_tenders WHERE id=$1`, [Number(req.params.id)]);
  if (!tender || tender.status !== 'PUBLISHED') throw fail(404, 'NOT_FOUND', 'Tender is not available.');
  if (tender.deadline && new Date(tender.deadline) < new Date()) throw fail(409, 'CLOSED', 'The tender deadline has passed.');
  const b = req.body;
  if (b.provider_ref) {
    const duplicate = await one('SELECT reference FROM payments WHERE provider_ref=$1', [b.provider_ref]);
    if (duplicate) throw fail(409, 'DUPLICATE', `This transaction reference was already submitted (${duplicate.reference}).`);
  }
  if (b.method !== 'cash' && !b.provider_ref) throw fail(422, 'VALIDATION', 'Provide the transaction reference from your bank or wallet.');
  const payment = await tx(async (client) => {
    const reference = await nextReference('PAY', client);
    const row = (await client.query(`INSERT INTO payments
      (reference, procurement_id, payer_name, phone, amount, currency, method, provider_ref, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')
      RETURNING reference, amount, currency, method, status, created_at`,
      [reference, tender.id, b.payer_name, b.phone, tender.price, tender.currency, b.method, b.provider_ref || null])).rows[0];
    await client.query(`INSERT INTO payment_transactions (payment_id, event, detail, actor)
      SELECT id, 'created', $2, $3 FROM payments WHERE reference=$1`, [reference, `${tender.reference} · ${tender.price} ${tender.currency}`, 'public']);
    return row;
  });
  await audit(req, 'PROCUREMENT_PAYMENT_CREATED', 'procurement_tenders', tender.id, `${tender.reference} · ${payment.reference}`);
  await notifyRole('finance', 'procurement_payment', 'Tender payment submitted', `${b.payer_name} submitted ${payment.reference} for ${tender.reference}.`, payment.reference);
  ok(res, { payment, tender_reference: tender.reference }, 'Payment submitted for admin verification', 201);
}));

procurementRouter.get('/:id(\\d+)/download', wrap(async (req, res) => {
  const reference = String(req.query.payment_reference || '').toUpperCase().trim();
  const phone = String(req.query.phone || '').replace(/[\s-]/g, '');
  if (!reference || !phone) throw fail(422, 'VALIDATION', 'Provide your payment reference and phone number.');
  const row = await one(`SELECT t.*, p.reference AS payment_reference, p.status AS payment_status
    FROM procurement_tenders t JOIN payments p ON p.procurement_id=t.id
    WHERE t.id=$1 AND p.reference=$2 AND p.phone=$3`, [Number(req.params.id), reference, phone]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Tender payment not found.');
  if (row.payment_status !== 'SUCCESSFUL') throw fail(403, 'PAYMENT_NOT_VERIFIED', 'Your payment must be verified by finance before download.');
  if (!row.released_at) throw fail(403, 'NOT_RELEASED', 'The tender document has not been released by an administrator yet.');
  if (!fs.existsSync(row.file_path)) throw fail(404, 'FILE_NOT_FOUND', 'The tender document is unavailable.');
  await audit(req, 'PROCUREMENT_FILE_DOWNLOADED', 'procurement_tenders', row.id, row.payment_reference);
  res.download(row.file_path, row.file_name);
}));

export const procurementAdminRouter = Router();
procurementAdminRouter.use(requireAuth, requireRole('content_manager'));
const tenderSchema = z.object({
  title: z.string().min(3).max(240),
  description: z.string().max(5000).optional().or(z.literal('')),
  price: z.coerce.number().positive().max(10_000_000),
  deadline: z.string().optional().or(z.literal('')),
});

procurementAdminRouter.get('/', wrap(async (_req, res) => {
  const rows = (await q(`SELECT t.id, t.reference, t.title, t.price, t.currency, t.deadline, t.status, t.released_at, t.created_at,
    count(p.id)::int AS payment_count, count(p.id) FILTER (WHERE p.status='PENDING')::int AS pending_payments
    FROM procurement_tenders t LEFT JOIN payments p ON p.procurement_id=t.id
    GROUP BY t.id ORDER BY t.created_at DESC`)).rows;
  ok(res, { tenders: rows }, 'Procurement admin');
}));

procurementAdminRouter.post('/', documentUpload.single('document'), validate(tenderSchema), wrap(async (req, res) => {
  if (!req.file) throw fail(422, 'VALIDATION', 'Attach a tender document using the document field.');
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowed = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip']);
  if (!allowed.has(ext)) throw fail(415, 'UPLOAD_TYPE', 'Use PDF, Word, Excel, or ZIP tender documents.');
  const reference = `AGH-TDR-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const dir = path.join(process.env.PRIVATE_DIR || path.join(process.cwd(), 'storage', 'private'), 'procurement');
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${reference}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const filePath = path.join(dir, stored);
  fs.writeFileSync(filePath, req.file.buffer, { mode: 0o640 });
  const row = await one(`INSERT INTO procurement_tenders (reference, title, description, price, deadline, file_name, file_path, status, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'PUBLISHED',$8) RETURNING id, reference, title, price, currency, deadline, status`,
    [reference, req.body.title, req.body.description || null, req.body.price, req.body.deadline || null, req.file.originalname, filePath, req.user.id]);
  await audit(req, 'PROCUREMENT_CREATED', 'procurement_tenders', row.id, `${reference} · ${req.file.originalname}`);
  ok(res, { tender: row }, 'Tender uploaded', 201);
}));

procurementAdminRouter.patch('/:id(\\d+)/release', wrap(async (req, res) => {
  const row = await one(`UPDATE procurement_tenders SET released_at=now(), released_by=$1, updated_at=now()
    WHERE id=$2 RETURNING id, reference, released_at`, [req.user.id, Number(req.params.id)]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Tender not found.');
  await audit(req, 'PROCUREMENT_RELEASED', 'procurement_tenders', row.id, row.reference);
  ok(res, { tender: row }, 'Tender document released');
}));
