// Payment architecture (spec §16): real records, verification workflow,
// provider abstraction — never fake confirmation.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { q, one, tx, nextReference } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, audit } from '../auth.js';
import { notifyRole, notifyPatient, broadcast, sendSms } from '../notify.js';

export const paymentsRouter = Router();
const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

const createSchema = z.object({
  payer_name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9\s-]{6,20}$/).transform(v => v.replace(/[\s-]/g, '')),
  amount: z.number().positive().max(10_000_000),
  method: z.enum(['telebirr', 'bank_transfer', 'card', 'cash', 'cbhi', 'other']),
  provider_ref: z.string().max(120).optional().or(z.literal('')),
  appointment_ref: z.string().max(30).optional().or(z.literal('')),
});

paymentsRouter.post('/', createLimiter, validate(createSchema), wrap(async (req, res) => {
  const b = req.body;
  if (!['cash'].includes(b.method) && !b.provider_ref) {
    throw fail(422, 'VALIDATION', 'Provide the transaction reference from your bank or wallet.');
  }
  if (b.provider_ref) {
    const dup = await one('SELECT reference FROM payments WHERE provider_ref=$1', [b.provider_ref]);
    if (dup) throw fail(409, 'DUPLICATE', `This transaction reference was already submitted (${dup.reference}).`);
  }
  let patientId = null;
  if (req.user?.role === 'patient') {
    const p = await one('SELECT id FROM patients WHERE user_id=$1', [req.user.id]);
    patientId = p?.id ?? null;
  }
  if (!patientId) {
    const p = await one('SELECT id FROM patients WHERE phone=$1 ORDER BY id LIMIT 1', [b.phone]);
    patientId = p?.id ?? null;
  }

  const payment = await tx(async (client) => {
    const reference = await nextReference('PAY', client);
    const row = (await client.query(
      `INSERT INTO payments (reference, patient_id, appointment_ref, payer_name, phone, amount, method, provider_ref, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING') RETURNING id, reference, amount, currency, method, status, created_at`,
      [reference, patientId, b.appointment_ref || null, b.payer_name, b.phone, b.amount, b.method, b.provider_ref || null]
    )).rows[0];
    await client.query(
      `INSERT INTO payment_transactions (payment_id, event, detail, actor) VALUES ($1,'created',$2,$3)`,
      [row.id, `${b.amount} ETB via ${b.method}`, req.user?.name ?? 'public']);
    return row;
  });

  await audit(req, 'PAYMENT_CREATED', 'payments', payment.reference, `${b.amount} ETB · ${b.method}`);
  await notifyRole('finance', 'payment_submitted', 'New payment submitted',
    `${b.payer_name} submitted ${b.amount} ETB (${payment.reference}) — pending verification.`, payment.reference);
  broadcast('payment', { reference: payment.reference, status: 'PENDING' }, { roles: ['finance', 'receptionist'] });
  ok(res, { payment }, 'Payment submitted for verification', 201);
}));

// Public status lookup
paymentsRouter.get('/status', wrap(async (req, res) => {
  const reference = String(req.query.reference || '').toUpperCase().trim();
  const phone = String(req.query.phone || '').replace(/[\s-]/g, '');
  if (!reference || !phone) throw fail(422, 'VALIDATION', 'Provide both the payment reference and phone number.');
  const row = await one(
    `SELECT reference, payer_name, amount, currency, method, status, status_note, created_at
     FROM payments WHERE reference=$1 AND phone=$2`, [reference, phone]);
  if (!row) throw fail(404, 'NOT_FOUND', 'No payment found for that reference and phone.');
  ok(res, { payment: row }, 'Found');
}));

// Staff list + summary
paymentsRouter.get('/', requireAuth, requireRole('finance', 'receptionist'), wrap(async (req, res) => {
  const params = []; const where = ['1=1'];
  if (req.query.status) { params.push(req.query.status); where.push(`p.status = $${params.length}`); }
  if (req.query.method) { params.push(req.query.method); where.push(`p.method = $${params.length}`); }
  if (req.query.date) { params.push(req.query.date); where.push(`p.created_at::date = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(p.payer_name ILIKE $${params.length} OR p.reference ILIKE $${params.length} OR p.provider_ref ILIKE $${params.length})`); }
  const rows = (await q(
    `SELECT p.*, u.full_name AS verified_by_name FROM payments p LEFT JOIN users u ON u.id=p.verified_by
     WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 300`, params)).rows;
  ok(res, { payments: rows }, 'Payments');
}));

paymentsRouter.get('/summary', requireAuth, requireRole('finance', 'receptionist'), wrap(async (_req, res) => {
  const [today, month, counts, byMethod, daily] = await Promise.all([
    one(`SELECT coalesce(sum(amount),0) v FROM payments WHERE status='SUCCESSFUL' AND created_at::date = CURRENT_DATE`),
    one(`SELECT coalesce(sum(amount),0) v FROM payments WHERE status='SUCCESSFUL' AND date_trunc('month', created_at) = date_trunc('month', now())`),
    q(`SELECT status, count(*) c FROM payments GROUP BY status`),
    q(`SELECT method, count(*) c, coalesce(sum(amount),0) total FROM payments WHERE status='SUCCESSFUL' GROUP BY method ORDER BY total DESC`),
    q(`SELECT created_at::date AS day, coalesce(sum(amount) FILTER (WHERE status='SUCCESSFUL'),0) AS verified, count(*) AS submissions
       FROM payments WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
  ]);
  ok(res, {
    today_revenue: Number(today.v), month_revenue: Number(month.v),
    counts: Object.fromEntries(counts.rows.map(r => [r.status, Number(r.c)])),
    by_method: byMethod.rows, daily: daily.rows,
  }, 'Summary');
}));

// Verify / reject / refund
const statusSchema = z.object({
  status: z.enum(['SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED']),
  note: z.string().max(255).optional().or(z.literal('')),
});
paymentsRouter.patch('/:reference', requireAuth, requireRole('finance'), validate(statusSchema),
  wrap(async (req, res) => {
    const reference = req.params.reference.toUpperCase();
    const { status, note } = req.body;
    if (['FAILED', 'CANCELLED'].includes(status) && !note) {
      throw fail(422, 'VALIDATION', 'A note is required when failing or cancelling a payment.');
    }
    const payment = await tx(async (client) => {
      const row = (await client.query('SELECT * FROM payments WHERE reference=$1 FOR UPDATE', [reference])).rows[0];
      if (!row) throw fail(404, 'NOT_FOUND', 'Payment not found.');
      const allowed = { PENDING: ['SUCCESSFUL', 'FAILED', 'CANCELLED'], PROCESSING: ['SUCCESSFUL', 'FAILED'], SUCCESSFUL: ['REFUNDED'] };
      if (!(allowed[row.status] || []).includes(status)) {
        throw fail(409, 'INVALID_TRANSITION', `Cannot move a ${row.status} payment to ${status}.`);
      }
      await client.query(
        `UPDATE payments SET status=$1, status_note=$2, verified_by=$3, verified_at=now(), updated_at=now() WHERE id=$4`,
        [status, note || null, req.user.id, row.id]);
      await client.query(
        `INSERT INTO payment_transactions (payment_id, event, detail, actor) VALUES ($1,$2,$3,$4)`,
        [row.id, status.toLowerCase(), note || null, req.user.name]);
      return row;
    });
    await audit(req, `PAYMENT_${status}`, 'payments', reference, note || null);
    if (payment.patient_id) {
      await notifyPatient(payment.patient_id, `payment_${status.toLowerCase()}`, 'Payment update',
        `Your payment ${reference} is now ${status}.${note ? ' Note: ' + note : ''}`, reference);
    }
    if (status === 'SUCCESSFUL') {
      await sendSms(payment.phone, `Adare General Hospital: payment ${reference} (${payment.amount} ETB) verified. Thank you.`, 'payment_successful', reference);
    }
    broadcast('payment', { reference, status }, { roles: ['finance', 'receptionist'] });
    ok(res, { payment: { reference, status } }, `Payment ${status.toLowerCase()}`);
  }));

// CSV export
paymentsRouter.get('/export/csv', requireAuth, requireRole('finance'), wrap(async (req, res) => {
  const rows = (await q(
    `SELECT reference, payer_name, phone, amount, currency, method, provider_ref, status, created_at
     FROM payments ORDER BY created_at DESC LIMIT 5000`)).rows;
  await audit(req, 'PAYMENTS_EXPORTED', 'payments', null, `${rows.length} rows CSV`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="adare-payments-${Date.now()}.csv"`);
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  res.write('\uFEFFReference,Payer,Phone,Amount,Currency,Method,Provider Ref,Status,Created\n');
  for (const r of rows) {
    res.write([r.reference, r.payer_name, r.phone, r.amount, r.currency, r.method, r.provider_ref, r.status, r.created_at.toISOString()].map(esc).join(',') + '\n');
  }
  res.end();
}));
