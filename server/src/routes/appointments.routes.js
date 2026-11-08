// Real database-backed appointment lifecycle (spec §9–§10).
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { q, one, tx, nextReference } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, audit, hasStaffPermission } from '../auth.js';
import { notifyRole, notifyPatient, broadcast, sendSms, sendEmail } from '../notify.js';
import { config } from '../config.js';
import { readPassportDocument, savePassportDocument } from '../passport-storage.js';

export const appointmentsRouter = Router();

const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const passportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(fail(415, 'UPLOAD_TYPE', 'Passport images must be JPEG, PNG, or WebP.'));
    }
    callback(null, true);
  },
});
const receivePassport = (req, res, next) => passportUpload.single('passport_document')(req, res, (error) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return next(fail(413, 'UPLOAD_TOO_LARGE', 'Passport image must be 5 MB or smaller.'));
  }
  next(error);
});
const parseAppointmentMultipart = (req, _res, next) => {
  if (!req.is('multipart/form-data')) return next();
  try {
    if (typeof req.body.appointment !== 'string') {
      throw fail(422, 'VALIDATION', 'Appointment details are required with the passport image.');
    }
    const body = JSON.parse(req.body.appointment);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw fail(422, 'VALIDATION', 'Appointment details are invalid.');
    }
    if (req.file) {
      body.passport_document_name = req.file.originalname
        .replace(/^.*[\\/]/, '')
        .replace(/[\u0000-\u001f]/g, '')
        .slice(0, 255);
    }
    req.body = body;
    next();
  } catch (error) {
    next(error instanceof SyntaxError ? fail(422, 'VALIDATION', 'Appointment details are invalid.') : error);
  }
};
const passportImageExtension = (buffer) => {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString() === 'PNG') return 'png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
};
const toIsoDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const toEthiopianDate = (value) => new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
}).format(new Date(`${toIsoDate(value)}T12:00:00Z`));

const createSchema = z.object({
  patient_name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9\s-]{6,20}$/).transform(v => v.replace(/[\s-]/g, '')),
  email: z.string().email().max(150),
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
  passport_number: z.string().trim().min(4).max(40).regex(/^[A-Za-z0-9-]+$/).optional().or(z.literal('')),
  passport_document_name: z.string().trim().max(255).optional().or(z.literal('')),
  yellow_fever_vaccination: z.boolean().optional(),
});

appointmentsRouter.post('/', createLimiter, receivePassport, parseAppointmentMultipart, validate(createSchema), wrap(async (req, res) => {
  const b = req.body;
  const isYellowFeverVisit = Boolean(b.yellow_fever_vaccination);
  if (b.preferred_date < new Date().toISOString().slice(0, 10)) {
    throw fail(422, 'VALIDATION', 'The preferred date cannot be in the past.');
  }
  if (isYellowFeverVisit) {
    if (!b.passport_number || !req.file) {
      throw fail(422, 'VALIDATION', 'Yellow Fever bookings require a passport number and an uploaded passport image.');
    }
    if (!b.preferred_time) {
      throw fail(422, 'VALIDATION', 'Please choose a preferred time so the vaccination team can confirm availability.');
    }
  }
  if (!isYellowFeverVisit && req.file) {
    throw fail(422, 'VALIDATION', 'Passport image uploads are only used for Yellow Fever vaccination bookings.');
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

  let passportDocumentPath = null;
  let passportExtension = null;
  if (req.file) {
    passportExtension = passportImageExtension(req.file.buffer);
    if (!passportExtension) throw fail(415, 'UPLOAD_TYPE', 'The selected file is not a valid JPEG, PNG, or WebP image.');
    passportDocumentPath = `${crypto.randomBytes(16).toString('hex')}.${passportExtension}`;
  }

  const appt = await tx(async (client) => {
    const reference = await nextReference('APT', client);
    const yellowFeverNote = isYellowFeverVisit
      ? 'Yellow Fever vaccination: passport verified and yellow card certificate to be issued after attendance.'
      : null;
    const row = (await client.query(
      `INSERT INTO appointments
        (reference, patient_id, patient_name, phone, email, gender, date_of_birth,
         department_id, doctor_id, service_id, preferred_date, preferred_time,
         reason, is_emergency, insurance_type, notes, passport_number,
         passport_document_name, passport_document_path, yellow_fever_vaccination)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id, reference, status, preferred_date`,
      [reference, patientId, b.patient_name, b.phone, b.email || null, b.gender || null,
       b.date_of_birth || null, b.department_id ?? null, b.doctor_id ?? null, b.service_id ?? null,
       b.preferred_date, b.preferred_time || null, b.reason || null, b.is_emergency ?? false,
       b.insurance_type || null, [b.notes, yellowFeverNote].filter(Boolean).join('\n') || null,
       b.passport_number || null, b.passport_document_name || null, passportDocumentPath, isYellowFeverVisit]
    )).rows[0];
    if (req.file) {
      await savePassportDocument(client, {
        appointmentId: row.id,
        filePath: passportDocumentPath,
        extension: passportExtension,
        buffer: req.file.buffer,
      });
    }
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, to_status, note) VALUES ($1,'PENDING','Submitted online')`,
      [row.id]);
    return row;
  });

  const details = await one(
    `SELECT d.name AS department, doc.full_name AS doctor, s.name AS service
     FROM appointments a
     LEFT JOIN departments d ON d.id=a.department_id
     LEFT JOIN doctors doc ON doc.id=a.doctor_id
     LEFT JOIN services s ON s.id=a.service_id
     WHERE a.id=$1`, [appt.id]);
  const ethiopianDate = toEthiopianDate(b.preferred_date);
  const emailLines = [
    `Hello ${b.patient_name},`,
    '',
    'We received your appointment request. It is pending review by the hospital reception team.',
    '',
    `Reference: ${appt.reference}`,
    'Status: PENDING',
    `Preferred date (Ethiopian calendar): ${ethiopianDate}`,
    `Preferred date (Gregorian calendar): ${b.preferred_date}`,
    `Preferred time: ${b.preferred_time || 'Any time'}`,
    `Department: ${details?.department || 'Not selected'}`,
    `Doctor: ${details?.doctor || 'Any available doctor'}`,
    `Service: ${details?.service || 'General visit'}`,
    '',
    ...(isYellowFeverVisit ? [
      'Yellow Fever vaccination notice: please attend at the scheduled time with your passport and phone available.',
      'After vaccination, the hospital will issue the required yellow card certificate.',
      ''
    ] : []),
    'Keep your reference number to check the request status on the hospital website. This is a request, not a confirmed appointment.',
    '',
    'Adare General Hospital',
  ];
  let emailSent = false;
  try {
    const delivery = await sendEmail({
      to: b.email,
      subject: `Appointment request received — ${appt.reference}`,
      text: emailLines.join('\n'),
    });
    if (!delivery.sent) {
      console.warn(`[email] appointment confirmation skipped for ${appt.reference}: ${delivery.reason}`);
    } else {
      emailSent = true;
    }
  } catch (error) {
    console.error(`[email] appointment confirmation failed for ${appt.reference}:`, error.message);
  }

  await audit(req, 'APPOINTMENT_CREATED', 'appointments', appt.reference, `date ${b.preferred_date}`);
  await notifyRole('receptionist', 'appointment_created', 'New appointment request',
    `${b.patient_name} requested ${b.preferred_date} (${appt.reference}).`, appt.reference);
  if (patientId) await notifyPatient(patientId, 'appointment_created', 'Appointment submitted',
    `Your request ${appt.reference} is awaiting confirmation.`, appt.reference);
  broadcast('appointment', { reference: appt.reference, status: 'PENDING' }, { roles: ['receptionist', 'doctor', 'nurse'] });
  await sendSms(b.phone, `Adare General Hospital: appointment request ${appt.reference} received for ${b.preferred_date}.`, 'appointment_submitted', appt.reference);

  ok(res, { appointment: appt, email_sent: emailSent }, 'Appointment request submitted', 201);
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

appointmentsRouter.get('/:reference/passport', requireAuth, wrap(async (req, res) => {
  const reference = req.params.reference.toUpperCase();
  const row = await one(
    'SELECT passport_document_path, yellow_fever_vaccination FROM appointments WHERE reference=$1',
    [reference]);
  if (!row) throw fail(404, 'NOT_FOUND', 'Appointment not found.');
  const canManageAll = ['receptionist', 'doctor', 'nurse', 'super_admin', 'hospital_admin'].includes(req.user.role);
  if (!row.yellow_fever_vaccination
      || (!canManageAll && !await hasStaffPermission(req.user, 'yellow_fever_manager'))) {
    throw fail(403, 'FORBIDDEN', 'You do not have permission to access this passport image.');
  }
  if (!row.passport_document_path) throw fail(404, 'NOT_FOUND', 'No passport image is available for this appointment.');
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(row.passport_document_path)) {
    throw fail(404, 'NOT_FOUND', 'The passport image is unavailable.');
  }
  const document = await readPassportDocument(row.passport_document_path);
  if (!document) throw fail(404, 'NOT_FOUND', 'The passport image is unavailable.');
  const contentType = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[document.extension];
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="passport-image.${document.extension}"`,
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(document.image);
}));

// ---- staff list ----
appointmentsRouter.get('/', requireAuth, wrap(async (req, res) => {
  const canManageAll = ['receptionist', 'doctor', 'nurse', 'super_admin', 'hospital_admin'].includes(req.user.role);
  const canManageYellowFever = canManageAll || await hasStaffPermission(req.user, 'yellow_fever_manager');
  if (!canManageYellowFever) throw fail(403, 'FORBIDDEN', 'You do not have permission to view staff appointments.');
  const params = []; const where = canManageAll ? ['1=1'] : ['a.yellow_fever_vaccination=true'];
  if (req.query.yellow_fever === 'true') where.push('a.yellow_fever_vaccination=true');
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

const vaccinationSchema = z.object({
  stock_receipt_id: z.number().int().positive(),
  unit_name: z.string().trim().min(2).max(150),
  yellow_card_certificate_issued: z.boolean(),
});

appointmentsRouter.get('/vaccine-stock', requireAuth, wrap(async (req, res) => {
  const canAdminister = ['nurse', 'super_admin', 'hospital_admin'].includes(req.user.role)
    || await hasStaffPermission(req.user, 'nursing_daily_report');
  if (!canAdminister) throw fail(403, 'FORBIDDEN', 'Nursing permission is required to view vaccine stock for administration.');
  const rows = (await q(
    `SELECT r.id AS stock_receipt_id, r.vaccine_name, r.batch_number, r.expiry_date,
            t.unit_name, sum(t.quantity)::int
              - coalesce((SELECT sum(u.quantity) FROM vaccine_stock_usages u
                          WHERE u.stock_receipt_id=r.id AND u.unit_name=t.unit_name),0)::int AS available
     FROM vaccine_stock_transfers t
     JOIN vaccine_stock_receipts r ON r.id=t.stock_receipt_id
     WHERE r.expiry_date >= CURRENT_DATE
     GROUP BY r.id, r.vaccine_name, r.batch_number, r.expiry_date, t.unit_name
     HAVING sum(t.quantity)
       - coalesce((SELECT sum(u.quantity) FROM vaccine_stock_usages u
                   WHERE u.stock_receipt_id=r.id AND u.unit_name=t.unit_name),0) > 0
     ORDER BY r.expiry_date, r.vaccine_name, t.unit_name`)).rows;
  ok(res, { stock: rows }, 'Vaccine stock available to nursing units');
}));

appointmentsRouter.patch('/:reference', requireAuth, validate(patchSchema), wrap(async (req, res) => {
    const t = TRANSITIONS[req.body.action];
    const note = req.body.note || '';
    if (t.requireNote && !note) throw fail(422, 'VALIDATION', 'A note explaining the decision is required.');
    if (req.body.action === 'reschedule' && !req.body.scheduled_date) {
      throw fail(422, 'VALIDATION', 'A new scheduled date is required to reschedule.');
    }
    const reference = req.params.reference.toUpperCase();
    const candidate = await one('SELECT yellow_fever_vaccination FROM appointments WHERE reference=$1', [reference]);
    if (!candidate) throw fail(404, 'NOT_FOUND', 'Appointment not found.');
    const canManageAll = ['receptionist', 'doctor', 'nurse', 'super_admin', 'hospital_admin'].includes(req.user.role);
    if (!canManageAll && !(candidate.yellow_fever_vaccination && await hasStaffPermission(req.user, 'yellow_fever_manager'))) {
      throw fail(403, 'FORBIDDEN', 'You do not have permission to manage this appointment.');
    }

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
    let emailSent = false;
    if (patientMsgs[req.body.action]) {
      if (appt.patient_id) await notifyPatient(appt.patient_id, `appointment_${req.body.action}`, 'Appointment update', patientMsgs[req.body.action], reference);
      await sendSms(appt.phone, `Adare General Hospital: ${patientMsgs[req.body.action]}`, `appointment_${req.body.action}`, reference);
      if (appt.email) {
        const scheduledDate = req.body.scheduled_date || toIsoDate(appt.scheduled_date);
        const message = [
          `Hello ${appt.patient_name},`,
          '',
          patientMsgs[req.body.action],
          '',
          `Reference: ${reference}`,
          `Status: ${t.to}`,
          `Preferred date: ${toEthiopianDate(appt.preferred_date)} (${toIsoDate(appt.preferred_date)} Gregorian)`,
          ...(scheduledDate
            ? [`Scheduled date: ${toEthiopianDate(scheduledDate)} (${scheduledDate} Gregorian)`,
              `Scheduled time: ${req.body.scheduled_time || appt.scheduled_time || 'Not specified'}`]
            : []),
          ...(note ? ['', `Reception note: ${note}`] : []),
          '',
          'Adare General Hospital',
        ];
        try {
          const delivery = await sendEmail({
            to: appt.email,
            subject: `Appointment update — ${reference}`,
            text: message.join('\n'),
          });
          emailSent = delivery.sent;
          if (!delivery.sent) {
            console.warn(`[email] appointment update skipped for ${reference}: ${delivery.reason}`);
          }
        } catch (error) {
          console.error(`[email] appointment update failed for ${reference}:`, error.message);
        }
      }
    }
    ok(res, { appointment: { reference, status: t.to }, email_sent: emailSent }, `Appointment ${t.to.toLowerCase()}`);
  }));

appointmentsRouter.post('/:reference/vaccination', requireAuth, validate(vaccinationSchema), wrap(async (req, res) => {
  const canAdminister = ['nurse', 'super_admin', 'hospital_admin'].includes(req.user.role)
    || await hasStaffPermission(req.user, 'nursing_daily_report');
  if (!canAdminister) throw fail(403, 'FORBIDDEN', 'Nursing permission is required to record vaccine administration.');
  const reference = req.params.reference.toUpperCase();
  const { stock_receipt_id: receiptId, unit_name: unitName, yellow_card_certificate_issued: certificateIssued } = req.body;
  const result = await tx(async (client) => {
    const appointment = (await client.query(
      'SELECT id, reference, status FROM appointments WHERE reference=$1 AND yellow_fever_vaccination=true FOR UPDATE',
      [reference])).rows[0];
    if (!appointment) throw fail(404, 'NOT_FOUND', 'Yellow Fever appointment not found.');
    if (!['CHECKED_IN', 'IN_CONSULTATION'].includes(appointment.status)) {
      throw fail(409, 'INVALID_TRANSITION', 'Check in the patient before recording Yellow Fever vaccination.');
    }
    const receipt = (await client.query(
      'SELECT id, vaccine_name, batch_number, expiry_date FROM vaccine_stock_receipts WHERE id=$1 FOR UPDATE',
      [receiptId])).rows[0];
    if (!receipt) throw fail(404, 'NOT_FOUND', 'Vaccine stock batch not found.');
    if (String(receipt.expiry_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      throw fail(422, 'VALIDATION', 'Expired vaccine stock cannot be administered.');
    }
    const available = Number((await client.query(
      `SELECT
         (SELECT coalesce(sum(quantity),0) FROM vaccine_stock_transfers WHERE stock_receipt_id=$1 AND unit_name=$2)
         - (SELECT coalesce(sum(quantity),0) FROM vaccine_stock_usages WHERE stock_receipt_id=$1 AND unit_name=$2) AS available`,
      [receiptId, unitName])).rows[0].available);
    if (available < 1) throw fail(409, 'INSUFFICIENT_STOCK', `No doses remain in ${unitName} for batch ${receipt.batch_number}.`);
    const previousUse = await client.query(
      "SELECT id FROM vaccine_stock_usages WHERE appointment_id=$1 AND usage_type='ADMINISTERED'",
      [appointment.id]);
    if (previousUse.rowCount) throw fail(409, 'DUPLICATE', 'A vaccine dose is already recorded for this appointment.');
    await client.query(
      `INSERT INTO vaccine_stock_usages
        (stock_receipt_id, unit_name, appointment_id, usage_type, quantity, recorded_by)
       VALUES ($1,$2,$3,'ADMINISTERED',1,$4)`,
      [receiptId, unitName, appointment.id, req.user.id]);
    await client.query(
      `UPDATE appointments
       SET status='COMPLETED', yellow_card_certificate_issued=$1, vaccination_administered_at=now(),
           vaccinated_by=$2, handled_by=$2, updated_at=now()
       WHERE id=$3`,
      [certificateIssued, req.user.id, appointment.id]);
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, note, changed_by)
       VALUES ($1,$2,'COMPLETED',$3,$4)`,
      [appointment.id, appointment.status, `Yellow Fever vaccine administered from batch ${receipt.batch_number}; yellow card ${certificateIssued ? 'issued' : 'not yet issued'}.`, req.user.id]);
    return { appointment: appointment.reference, vaccine_name: receipt.vaccine_name, batch_number: receipt.batch_number };
  });
  await audit(req, 'YELLOW_FEVER_VACCINATION_RECORDED', 'appointments', reference,
    `batch ${result.batch_number}, unit ${unitName}, yellow card ${certificateIssued ? 'issued' : 'not yet issued'}`);
  broadcast('appointment', { reference, status: 'COMPLETED' }, { roles: ['receptionist', 'doctor', 'nurse'] });
  ok(res, { ...result, status: 'COMPLETED', yellow_card_certificate_issued: certificateIssued }, 'Vaccination recorded');
}));

appointmentsRouter.get('/:reference/history', requireAuth, wrap(async (req, res) => {
    const candidate = await one('SELECT yellow_fever_vaccination FROM appointments WHERE reference=$1', [req.params.reference.toUpperCase()]);
    if (!candidate) throw fail(404, 'NOT_FOUND', 'Appointment not found.');
    const canManageAll = ['receptionist', 'doctor', 'nurse', 'super_admin', 'hospital_admin'].includes(req.user.role);
    if (!canManageAll && !(candidate.yellow_fever_vaccination && await hasStaffPermission(req.user, 'yellow_fever_manager'))) {
      throw fail(403, 'FORBIDDEN', 'You do not have permission to view this appointment history.');
    }
    const rows = (await q(
      `SELECT h.from_status, h.to_status, h.note, h.created_at, u.full_name AS changed_by
       FROM appointment_status_history h
       JOIN appointments a ON a.id = h.appointment_id
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE a.reference=$1 ORDER BY h.id`, [req.params.reference.toUpperCase()])).rows;
    ok(res, { history: rows }, 'History');
  }));
