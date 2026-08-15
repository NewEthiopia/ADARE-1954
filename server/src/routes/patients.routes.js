// Patient portal (self) + staff patient management.
import { Router } from 'express';
import { z } from 'zod';
import { q, one, nextReference } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, requirePatient, audit } from '../auth.js';
import { notifyRole } from '../notify.js';

export const patientsRouter = Router();

// ---- portal: my data ----
patientsRouter.get('/me', requireAuth, requirePatient, wrap(async (req, res) => {
  const patient = await one('SELECT * FROM patients WHERE user_id=$1', [req.user.id]);
  if (!patient) throw fail(404, 'NOT_FOUND', 'Patient record not found.');
  const appointments = (await q(
    `SELECT a.reference, a.preferred_date, a.preferred_time, a.scheduled_date, a.scheduled_time,
            a.status, a.status_note, d.name AS department, doc.full_name AS doctor, a.created_at
     FROM appointments a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN doctors doc ON doc.id=a.doctor_id
     WHERE a.patient_id=$1 OR a.phone=$2 ORDER BY a.created_at DESC LIMIT 100`,
    [patient.id, patient.phone])).rows;
  const payments = (await q(
    `SELECT reference, amount, currency, method, status, status_note, provider_ref, created_at
     FROM payments WHERE patient_id=$1 OR phone=$2 ORDER BY created_at DESC LIMIT 100`,
    [patient.id, patient.phone])).rows;
  const notifications = (await q(
    `SELECT id, type, title, body, reference, is_read, created_at
     FROM notifications WHERE audience='patient' AND patient_id=$1 ORDER BY id DESC LIMIT 50`,
    [patient.id])).rows;
  delete patient.user_id;
  ok(res, { patient, appointments, payments, notifications }, 'Profile');
}));

const meSchema = z.object({
  full_name: z.string().min(2).max(150).optional(),
  email: z.string().email().max(150).optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  emergency_contact: z.string().max(150).optional().or(z.literal('')),
  insurance_type: z.enum(['none', 'cbhi', 'private', 'other']).optional(),
});
patientsRouter.patch('/me', requireAuth, requirePatient, validate(meSchema), wrap(async (req, res) => {
  const patient = await one('SELECT id FROM patients WHERE user_id=$1', [req.user.id]);
  if (!patient) throw fail(404, 'NOT_FOUND', 'Patient record not found.');
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(req.body)) {
    params.push(v === '' ? null : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) throw fail(422, 'VALIDATION', 'No changes submitted.');
  params.push(patient.id);
  await q(`UPDATE patients SET ${sets.join(', ')}, updated_at=now() WHERE id = $${params.length}`, params);
  await audit(req, 'PATIENT_UPDATED', 'patients', patient.id, Object.keys(req.body).join(','));
  ok(res, {}, 'Profile updated');
}));

// portal: notifications mark read
patientsRouter.post('/me/notifications/read', requireAuth, requirePatient, wrap(async (req, res) => {
  const patient = await one('SELECT id FROM patients WHERE user_id=$1', [req.user.id]);
  if (req.body?.all) {
    await q(`UPDATE notifications SET is_read=true, read_at=now() WHERE audience='patient' AND patient_id=$1 AND NOT is_read`, [patient.id]);
  } else if (req.body?.id) {
    await q(`UPDATE notifications SET is_read=true, read_at=now() WHERE id=$1 AND audience='patient' AND patient_id=$2`, [Number(req.body.id), patient.id]);
  }
  ok(res, {}, 'Updated');
}));

// ---- staff: register + search + profile ----
const createSchema = z.object({
  full_name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9\s-]{6,20}$/).transform(v => v.replace(/[\s-]/g, '')),
  email: z.string().email().max(150).optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  insurance_type: z.enum(['none', 'cbhi', 'private', 'other']).optional(),
});
patientsRouter.post('/', requireAuth, requireRole('receptionist', 'nurse', 'doctor'), validate(createSchema),
  wrap(async (req, res) => {
    const b = req.body;
    const dup = await one('SELECT patient_number FROM patients WHERE phone=$1 AND full_name=$2 AND deleted_at IS NULL', [b.phone, b.full_name]);
    if (dup) throw fail(409, 'DUPLICATE', `A patient with this name and phone already exists (${dup.patient_number}).`);
    const patientNumber = await nextReference('PAT');
    const row = await one(
      `INSERT INTO patients (patient_number, full_name, phone, email, gender, date_of_birth, address, insurance_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, patient_number, full_name, phone`,
      [patientNumber, b.full_name, b.phone, b.email || null, b.gender || null, b.date_of_birth || null, b.address || null, b.insurance_type || null]);
    await audit(req, 'PATIENT_CREATED', 'patients', row.patient_number);
    await notifyRole('receptionist', 'new_patient', 'Patient registered', `${b.full_name} (${row.patient_number}).`, row.patient_number);
    ok(res, { patient: row }, 'Patient registered', 201);
  }));

patientsRouter.get('/', requireAuth, requireRole('receptionist', 'nurse', 'doctor', 'finance'), wrap(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) throw fail(422, 'VALIDATION', 'Enter at least 2 characters.');
  const like = `%${term}%`;
  const rows = (await q(
    `SELECT DISTINCT p.id, p.patient_number, p.full_name, p.phone, p.email, p.gender, p.date_of_birth, p.insurance_type, p.created_at
     FROM patients p LEFT JOIN appointments a ON a.patient_id = p.id
     WHERE p.deleted_at IS NULL AND
       (p.full_name ILIKE $1 OR p.patient_number ILIKE $1 OR p.phone ILIKE $1 OR a.reference ILIKE $1)
     ORDER BY p.full_name LIMIT 50`, [like])).rows;
  ok(res, { patients: rows }, 'Search');
}));

patientsRouter.get('/:patientNumber', requireAuth, requireRole('receptionist', 'nurse', 'doctor', 'finance'),
  wrap(async (req, res) => {
    const patient = await one('SELECT * FROM patients WHERE patient_number=$1 AND deleted_at IS NULL', [req.params.patientNumber.toUpperCase()]);
    if (!patient) throw fail(404, 'NOT_FOUND', 'Patient not found.');
    const appointments = (await q(
      `SELECT a.reference, a.preferred_date, a.scheduled_date, a.status, d.name AS department, a.created_at
       FROM appointments a LEFT JOIN departments d ON d.id=a.department_id
       WHERE a.patient_id=$1 OR a.phone=$2 ORDER BY a.created_at DESC LIMIT 100`, [patient.id, patient.phone])).rows;
    const payments = (await q(
      `SELECT reference, amount, method, status, created_at FROM payments
       WHERE patient_id=$1 OR phone=$2 ORDER BY created_at DESC LIMIT 100`, [patient.id, patient.phone])).rows;
    delete patient.user_id;
    ok(res, { patient, appointments, payments }, 'Profile');
  }));
