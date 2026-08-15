// Real database-backed appointment lifecycle (spec §9–§10).
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { q, one, tx, nextReference } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, audit } from '../auth.js';
import { notifyRole, notifyPatient, broadcast, sendSms } from '../notify.js';

export const appointmentsRouter = Router();

const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const createSchema = z.object({
  patient_name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9\s-]{6,20}$/).transform(v => v.replace(/[\s-]/g, '')),
  email: z.string().email().max(150).optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  department_id: z.number().int().positive().optional().nullable(),
  doctor_id: z.number().int().positive().optional().nullable(),
  service_id: z.number().int().positive().optional().nullable(),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferred_time: z.string().max(20).optional().or(z.literal('')),
  reason: z.string().max(2000).optional().or(z.literal('')),
  is_emergency: z.boolean().optional(),
  insurance_type: z.enum(['none', 'cbhi', 'private', 'other']).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

appointmentsRouter.post('/', createLimiter, validate(createSchema), wrap(async (req, res) => {
  const b = req.body;
  if (b.preferred_date < new Date().toISOString().slice(0, 10)) {
    throw fail(422, 'VALIDATION', 'The preferred date cannot be in the past.');
  }
  // link to existing patient by portal user or phone
  let patientId = null;
  if (req.user?.role === 'patient') {
    const p = await one('SELECT id FROM patients WHERE user_id=$1', [req.user.id]);
    patientId = p?.id ?? null;
  }
  if (!patientId) {
    const p = await one('SELECT id FROM patients WHERE phone=$1 ORDER BY id LIMIT 1', [b.phone]);
    patientId = p?.id ?? null;
  }
  // duplicate guard: same phone + department + date still pending
  const dup = await one(
    `SELECT reference FROM appointments WHERE phone=$1 AND preferred_date=$2
     AND coalesce(department_id,0)=coalesce($3,0) AND status='PENDING' LIMIT 1`,
    [b.phone, b.preferred_date, b.department_id ?? null]);
  if (dup) throw fail(409, 'DUPLICATE', `A pending appointment (${dup.reference}) already exists for this phone, department and date.`);

  const appt = await tx(async (client) => {
    const reference = await nextReference('APT', client);
    const row = (await client.query(
      `INSERT INTO appointments
        (reference, patient_id, patient_name, phone, email, gender, date_of_birth,
         department_id, doctor_id, service_id, preferred_date, preferred_time,
         reason, is_emergency, insurance_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, reference, status, preferred_date`,
      [reference, patientId, b.patient_name, b.phone, b.email || null, b.gender || null,
       b.date_of_birth || null, b.department_id ?? null, b.doctor_id ?? null, b.service_id ?? null,
       b.preferred_date, b.preferred_time || null, b.reason || null, b.is_emergency ?? false,
       b.insurance_type || null, b.notes || null]
    )).rows[0];
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, to_status, note) VALUES ($1,'PENDING','Submitted online')`,
      [row.id]);
    return row;
  });

  await audit(req, 'APPOINTMENT_CREATED', 'appointments', appt.reference, `date ${b.preferred_date}`);
  await notifyRole('receptionist', 'appointment_created', 'New appointment request',
    `${b.patient_name} requested ${b.preferred_date} (${appt.reference}).`, appt.reference);
  if (patientId) await notifyPatient(patientId, 'appointment_created', 'Appointment submitted',
    `Your request ${appt.reference} is awaiting confirmation.`, appt.reference);
  broadcast('appointment', { reference: appt.reference, status: 'PENDING' }, { roles: ['receptionist', 'doctor', 'nurse'] });
  await sendSms(b.phone, `Adare General Hospital: appointment request ${appt.reference} received for ${b.preferred_date}.`, 'appointment_submitted', appt.reference);

  ok(res, { appointment: appt }, 'Appointment request submitted', 201);
}));

// Public status lookup (reference + phone required — prevents enumeration)
appointmentsRouter.get('/status', wrap(async (req, res) => {
  const reference = String(req.query.reference || '').toUpperCase().trim();
  const phone = String(req.query.phone || '').replace(/[\s-]/g, '');
  if (!reference || !phone) throw fail(422, 'VALIDATION', 'Provide both the reference and the phone number used for booking.');
  const row = await one(
    `SELECT a.reference, a.patient_name, a.preferred_date, a.preferred_time, a.scheduled_date, a.scheduled_time,
            a.status, a.status_note, d.name AS department, doc.full_name AS doctor, a.created_at
     FROM appointments a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN doctors doc ON doc.id=a.doctor_id
     WHERE a.reference=$1 AND a.phone=$2`, [reference, phone]);
  if (!row) throw fail(404, 'NOT_FOUND', 'No appointment found for that reference and phone.');
  ok(res, { appointment: row }, 'Found');
}));

// ---- staff list ----
appointmentsRouter.get('/', requireAuth, requireRole('receptionist', 'doctor', 'nurse'), wrap(async (req, res) => {
  const params = []; const where = ['1=1'];
  if (req.query.status) { params.push(req.query.status); where.push(`a.status = $${params.length}`); }
  if (req.query.date) { params.push(req.query.date); where.push(`(a.preferred_date = $${params.length} OR a.scheduled_date = $${params.length})`); }
  if (req.query.department_id) { params.push(Number(req.query.department_id)); where.push(`a.department_id = $${params.length}`); }
  if (req.query.doctor_id) { params.push(Number(req.query.doctor_id)); where.push(`a.doctor_id = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(a.patient_name ILIKE $${params.length} OR a.phone ILIKE $${params.length} OR a.reference ILIKE $${params.length})`); }
  const page = Math.max(1, Number(req.query.page || 1));
  const per = Math.min(100, Math.max(10, Number(req.query.per_page || 50)));
  const base = `FROM appointments a WHERE ${where.join(' AND ')}`;
  const total = Number((await q(`SELECT count(*) ${base}`, params)).rows[0].count);
  const rows = (await q(
    `SELECT a.*, d.name AS department, doc.full_name AS doctor, s.name AS service, u.full_name AS handled_by_name
     FROM appointments a
     LEFT JOIN departments d ON d.id=a.department_id
     LEFT JOIN doctors doc ON doc.id=a.doctor_id
     LEFT JOIN services s ON s.id=a.service_id
     LEFT JOIN users u ON u.id=a.handled_by
     WHERE ${where.join(' AND ').replaceAll('a.', 'a.')}
     ORDER BY a.is_emergency DESC, a.created_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, params)).rows;
  ok(res, { appointments: rows, total, page, per_page: per }, 'Appointments');
}));

// ---- workflow transitions ----
const TRANSITIONS = {
  confirm:    { to: 'CONFIRMED',       from: ['PENDING', 'RESCHEDULED'], auditAs: 'APPOINTMENT_CONFIRMED' },
  reject:     { to: 'REJECTED',        from: ['PENDING', 'RESCHEDULED'], auditAs: 'APPOINTMENT_REJECTED', requireNote: true },
  reschedule: { to: 'RESCHEDULED',     from: ['PENDING', 'CONFIRMED', 'RESCHEDULED'], auditAs: 'APPOINTMENT_RESCHEDULED' },
  checkin:    { to: 'CHECKED_IN',      from: ['CONFIRMED', 'RESCHEDULED'], auditAs: 'APPOINTMENT_CHECKED_IN' },
  start:      { to: 'IN_CONSULTATION', from: ['CHECKED_IN'], auditAs: 'APPOINTMENT_STARTED' },
  complete:   { to: 'COMPLETED',       from: ['CHECKED_IN', 'IN_CONSULTATION'], auditAs: 'APPOINTMENT_COMPLETED' },
  cancel:     { to: 'CANCELLED',       from: ['PENDING', 'CONFIRMED', 'RESCHEDULED', 'CHECKED_IN'], auditAs: 'APPOINTMENT_CANCELLED' },
  noshow:     { to: 'NO_SHOW',         from: ['CONFIRMED', 'RESCHEDULED'], auditAs: 'APPOINTMENT_NO_SHOW' },
};

const patchSchema = z.object({
  action: z.enum(Object.keys(TRANSITIONS)),
  note: z.string().max(255).optional().or(z.literal('')),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduled_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});

appointmentsRouter.patch('/:reference', requireAuth, requireRole('receptionist', 'doctor', 'nurse'),
  validate(patchSchema), wrap(async (req, res) => {
    const t = TRANSITIONS[req.body.action];
    const note = req.body.note || '';
    if (t.requireNote && !note) throw fail(422, 'VALIDATION', 'A note explaining the decision is required.');
    if (req.body.action === 'reschedule' && !req.body.scheduled_date) {
      throw fail(422, 'VALIDATION', 'A new scheduled date is required to reschedule.');
    }
    const reference = req.params.reference.toUpperCase();

    const appt = await tx(async (client) => {
      const row = (await client.query('SELECT * FROM appointments WHERE reference=$1 FOR UPDATE', [reference])).rows[0];
      if (!row) throw fail(404, 'NOT_FOUND', 'Appointment not found.');
      if (!t.from.includes(row.status)) {
        throw fail(409, 'INVALID_TRANSITION', `Cannot ${req.body.action} an appointment in status ${row.status}.`);
      }
      await client.query(
        `UPDATE appointments SET status=$1, status_note=$2, handled_by=$3,
            scheduled_date=coalesce($4, scheduled_date), scheduled_time=coalesce($5, scheduled_time), updated_at=now()
         WHERE id=$6`,
        [t.to, note || null, req.user.id, req.body.scheduled_date ?? null, req.body.scheduled_time ?? null, row.id]);
      await client.query(
        `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, note, changed_by)
         VALUES ($1,$2,$3,$4,$5)`, [row.id, row.status, t.to, note || null, req.user.id]);
      return { ...row, status: t.to };
    });

    await audit(req, t.auditAs, 'appointments', reference, note || null);
    broadcast('appointment', { reference, status: t.to }, { roles: ['receptionist', 'doctor', 'nurse'] });

    const patientMsgs = {
      confirm: `Your appointment ${reference} is CONFIRMED for ${req.body.scheduled_date || appt.preferred_date?.toISOString?.().slice(0,10) || ''}`.trim() + '.',
      reject: `Your appointment request ${reference} could not be confirmed. ${note}`,
      reschedule: `Your appointment ${reference} was rescheduled to ${req.body.scheduled_date}${req.body.scheduled_time ? ' ' + req.body.scheduled_time : ''}.`,
      cancel: `Your appointment ${reference} has been cancelled. ${note}`,
    };
    if (patientMsgs[req.body.action]) {
      if (appt.patient_id) await notifyPatient(appt.patient_id, `appointment_${req.body.action}`, 'Appointment update', patientMsgs[req.body.action], reference);
      await sendSms(appt.phone, `Adare General Hospital: ${patientMsgs[req.body.action]}`, `appointment_${req.body.action}`, reference);
    }
    ok(res, { appointment: { reference, status: t.to } }, `Appointment ${t.to.toLowerCase()}`);
  }));

appointmentsRouter.get('/:reference/history', requireAuth, requireRole('receptionist', 'doctor', 'nurse'),
  wrap(async (req, res) => {
    const rows = (await q(
      `SELECT h.from_status, h.to_status, h.note, h.created_at, u.full_name AS changed_by
       FROM appointment_status_history h
       JOIN appointments a ON a.id = h.appointment_id
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE a.reference=$1 ORDER BY h.id`, [req.params.reference.toUpperCase()])).rows;
    ok(res, { history: rows }, 'History');
  }));
