// Admin: dashboard KPIs, staff/user management, CMS (news/leaders/gallery/settings),
// contact inbox, notifications, audit log, reports.
import { Router } from 'express';
import { z } from 'zod';
import { q, one, tx } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';
import { requireAuth, requireRole, hashPassword, audit, hasStaffPermission } from '../auth.js';
import { config } from '../config.js';

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

// ---------- internal systems (staff-only LAN links) ----------
adminRouter.get('/internal-systems', wrap(async (_req, res) => {
  const rows = (await q(`SELECT key, value FROM hospital_settings WHERE key LIKE 'internal\\_%'`)).rows;
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const systems = [
    { name: 'Dagu 2.0', url: map.internal_dagu_url, note: 'Supply chain / logistics' },
    { name: 'EMR System', url: map.internal_emr_url, note: 'Electronic medical records' },
    { name: 'Odoo ERP', url: map.internal_odoo_url, note: 'Enterprise resource planning' },
    { name: 'Fullanke', url: map.internal_fullanke_url, note: 'Integrated electronic medical records system' },
  ].filter(s => s.url);
  ok(res, { systems }, 'Internal systems');
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

adminRouter.get('/my-permissions', wrap(async (req, res) => {
  const rows = (await q('SELECT permission_code FROM staff_permissions WHERE user_id=$1', [req.user.id])).rows;
  const permissions = new Set(rows.map(row => row.permission_code));
  const isAdmin = ['super_admin', 'hospital_admin'].includes(req.user.role);
  ok(res, {
    can_manage_yellow_fever: isAdmin || permissions.has('yellow_fever_manager'),
    can_submit_nursing_daily_report: isAdmin || permissions.has('nursing_daily_report'),
  }, 'Staff permissions');
}));

// ---------- vaccine stock ----------
const vaccineStockSchema = z.object({
  vaccine_name: z.string().trim().min(2).max(150),
  batch_number: z.string().trim().min(2).max(80),
  manufacturer: z.string().trim().max(150).optional().or(z.literal('')),
  quantity: z.number().int().positive().max(1000000),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  received_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});
const vaccineTransferSchema = z.object({
  stock_receipt_id: z.number().int().positive(),
  unit_name: z.string().trim().min(2).max(150),
  quantity: z.number().int().positive().max(1000000),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});
const nursingReportSchema = z.object({
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit_name: z.string().trim().min(2).max(150),
  vaccination_activity: z.boolean(),
  adverse_events: z.boolean(),
  doses_wasted: z.number().int().min(0).max(10000).default(0),
  waste_stock_receipt_id: z.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});
const isValidDate = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

adminRouter.get('/vaccine-stock', requireRole('pharmacy', 'finance'), wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT r.id, r.vaccine_name, r.batch_number, r.manufacturer, r.quantity, r.expiry_date,
            r.received_on, r.notes, r.created_at,
            r.quantity - coalesce((SELECT sum(t.quantity) FROM vaccine_stock_transfers t
                                  WHERE t.stock_receipt_id=r.id),0) AS central_on_hand
     FROM vaccine_stock_receipts r ORDER BY r.expiry_date, r.vaccine_name, r.id DESC`)).rows;
  ok(res, { stock: rows }, 'Vaccine stock');
}));

adminRouter.get('/vaccine-stock/transfers', requireRole('pharmacy', 'finance'), wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT t.id, r.vaccine_name, r.batch_number, t.unit_name, t.quantity, t.notes, t.created_at,
            u.full_name AS issued_by_name
     FROM vaccine_stock_transfers t
     JOIN vaccine_stock_receipts r ON r.id=t.stock_receipt_id
     LEFT JOIN users u ON u.id=t.issued_by
     ORDER BY t.created_at DESC, t.id DESC LIMIT 500`)).rows;
  ok(res, { transfers: rows }, 'Vaccine stock transfers');
}));

adminRouter.post('/vaccine-stock', requireRole('pharmacy'), validate(vaccineStockSchema), wrap(async (req, res) => {
  const b = req.body;
  const receivedOn = b.received_on || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!isValidDate(receivedOn) || !isValidDate(b.expiry_date)) {
    throw fail(422, 'VALIDATION', 'Enter valid vaccine received and expiry dates.');
  }
  if (receivedOn > today) throw fail(422, 'VALIDATION', 'Vaccine received date cannot be in the future.');
  if (b.expiry_date < receivedOn) throw fail(422, 'VALIDATION', 'Vaccine expiry date must be on or after its received date.');
  const row = await one(
    `INSERT INTO vaccine_stock_receipts
      (vaccine_name, batch_number, manufacturer, quantity, expiry_date, received_on, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, vaccine_name, batch_number, manufacturer, quantity, expiry_date, received_on, notes, created_at`,
    [b.vaccine_name, b.batch_number, b.manufacturer || null, b.quantity, b.expiry_date, receivedOn, b.notes || null, req.user.id]);
  await audit(req, 'VACCINE_STOCK_RECEIVED', 'vaccine_stock_receipts', row.id,
    `${row.vaccine_name}, batch ${row.batch_number}, quantity ${row.quantity}`);
  ok(res, { stock: row }, 'Vaccine stock received', 201);
}));

adminRouter.post('/vaccine-stock/transfers', requireRole('pharmacy'), validate(vaccineTransferSchema), wrap(async (req, res) => {
  const { stock_receipt_id: receiptId, unit_name: unitName, quantity, notes } = req.body;
  const transfer = await tx(async (client) => {
    const receipt = (await client.query(
      'SELECT id, vaccine_name, batch_number, expiry_date FROM vaccine_stock_receipts WHERE id=$1 FOR UPDATE',
      [receiptId])).rows[0];
    if (!receipt) throw fail(404, 'NOT_FOUND', 'Vaccine stock batch not found.');
    if (String(receipt.expiry_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      throw fail(422, 'VALIDATION', 'Expired vaccine stock cannot be issued to a pharmacy unit.');
    }
    const available = Number((await client.query(
      `SELECT r.quantity - coalesce(sum(t.quantity),0) AS available
       FROM vaccine_stock_receipts r
       LEFT JOIN vaccine_stock_transfers t ON t.stock_receipt_id=r.id
       WHERE r.id=$1 GROUP BY r.id, r.quantity`, [receiptId])).rows[0].available);
    if (quantity > available) throw fail(409, 'INSUFFICIENT_STOCK', `Only ${available} doses remain in the central pharmacy store for this batch.`);
    const row = (await client.query(
      `INSERT INTO vaccine_stock_transfers (stock_receipt_id, unit_name, quantity, issued_by, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, stock_receipt_id, unit_name, quantity, notes, created_at`,
      [receiptId, unitName, quantity, req.user.id, notes || null])).rows[0];
    return { ...row, vaccine_name: receipt.vaccine_name, batch_number: receipt.batch_number };
  });
  await audit(req, 'VACCINE_STOCK_TRANSFERRED', 'vaccine_stock_transfers', transfer.id,
    `${transfer.vaccine_name}, batch ${transfer.batch_number}, quantity ${transfer.quantity}, unit ${unitName}`);
  ok(res, { transfer }, 'Vaccine stock issued to pharmacy unit', 201);
}));

adminRouter.get('/reports/vaccine-stock', requireRole('pharmacy', 'finance'), wrap(async (_req, res) => {
  const [summary, batches, byUnit] = await Promise.all([
    q(`SELECT r.vaccine_name, sum(r.quantity)::bigint AS total_received,
              sum(r.quantity - coalesce(t.transferred,0))::bigint AS central_on_hand,
              sum(coalesce(t.transferred,0))::bigint AS total_issued_to_units,
              sum(coalesce(u.administered,0))::bigint AS doses_administered,
              sum(coalesce(u.wasted,0))::bigint AS doses_wasted,
              count(*)::int AS batch_count,
              count(*) FILTER (WHERE r.expiry_date < CURRENT_DATE)::int AS expired_batches,
              count(*) FILTER (WHERE r.expiry_date >= CURRENT_DATE AND r.expiry_date < CURRENT_DATE + 91)::int AS expiring_batches
       FROM vaccine_stock_receipts r
       LEFT JOIN LATERAL (SELECT sum(quantity) AS transferred FROM vaccine_stock_transfers WHERE stock_receipt_id=r.id) t ON true
       LEFT JOIN LATERAL (SELECT sum(quantity) FILTER (WHERE usage_type='ADMINISTERED') AS administered,
                                  sum(quantity) FILTER (WHERE usage_type='WASTED') AS wasted
                          FROM vaccine_stock_usages WHERE stock_receipt_id=r.id) u ON true
       GROUP BY r.vaccine_name ORDER BY r.vaccine_name`),
    q(`SELECT r.id AS stock_receipt_id, r.vaccine_name, r.batch_number, r.manufacturer, r.quantity AS total_received,
              r.quantity - coalesce(t.transferred,0) AS central_on_hand, r.expiry_date, r.received_on,
              coalesce(t.transferred,0) AS total_issued_to_units,
              coalesce(u.administered,0) AS doses_administered, coalesce(u.wasted,0) AS doses_wasted,
              CASE WHEN r.expiry_date < CURRENT_DATE THEN 'EXPIRED'
                   WHEN r.expiry_date < CURRENT_DATE + 91 THEN 'EXPIRING'
                   ELSE 'IN_STOCK' END AS status
       FROM vaccine_stock_receipts r
       LEFT JOIN LATERAL (SELECT sum(quantity) AS transferred FROM vaccine_stock_transfers WHERE stock_receipt_id=r.id) t ON true
       LEFT JOIN LATERAL (SELECT sum(quantity) FILTER (WHERE usage_type='ADMINISTERED') AS administered,
                                  sum(quantity) FILTER (WHERE usage_type='WASTED') AS wasted
                          FROM vaccine_stock_usages WHERE stock_receipt_id=r.id) u ON true
       ORDER BY r.expiry_date, r.vaccine_name, r.batch_number`),
    q(`WITH issued AS (
         SELECT stock_receipt_id, unit_name, sum(quantity) AS quantity
         FROM vaccine_stock_transfers GROUP BY stock_receipt_id, unit_name
       ), used AS (
         SELECT stock_receipt_id, unit_name,
                sum(quantity) FILTER (WHERE usage_type='ADMINISTERED') AS administered,
                sum(quantity) FILTER (WHERE usage_type='WASTED') AS wasted
         FROM vaccine_stock_usages GROUP BY stock_receipt_id, unit_name
       )
       SELECT i.unit_name, r.vaccine_name, sum(i.quantity)::bigint AS issued,
              sum(i.quantity - coalesce(u.administered,0) - coalesce(u.wasted,0))::bigint AS on_hand,
              sum(coalesce(u.administered,0))::bigint AS doses_administered,
              sum(coalesce(u.wasted,0))::bigint AS doses_wasted
       FROM issued i JOIN vaccine_stock_receipts r ON r.id=i.stock_receipt_id
       LEFT JOIN used u ON u.stock_receipt_id=i.stock_receipt_id AND u.unit_name=i.unit_name
       GROUP BY i.unit_name, r.vaccine_name ORDER BY i.unit_name, r.vaccine_name`),
  ]);
  ok(res, { summary: summary.rows, batches: batches.rows, by_unit: byUnit.rows, generated_at: new Date().toISOString() }, 'Vaccine stock report');
}));

adminRouter.get('/nursing/daily-reports', wrap(async (req, res) => {
  if (!await hasStaffPermission(req.user, 'nursing_daily_report')) {
    throw fail(403, 'FORBIDDEN', 'You do not have permission to access nursing daily reports.');
  }
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  if (!isValidDate(date)) throw fail(422, 'VALIDATION', 'Enter a valid report date.');
  const rows = (await q(
    `SELECT r.*, u.full_name AS submitted_by_name, s.vaccine_name, s.batch_number,
            coalesce(v.doses_administered,0)::int AS doses_administered
     FROM nursing_daily_reports r
     JOIN users u ON u.id=r.submitted_by
     LEFT JOIN vaccine_stock_receipts s ON s.id=r.waste_stock_receipt_id
     LEFT JOIN LATERAL (
       SELECT sum(quantity) AS doses_administered
       FROM vaccine_stock_usages
       WHERE usage_type='ADMINISTERED' AND created_at::date=r.report_date AND unit_name=r.unit_name
     ) v ON true
     WHERE r.report_date=$1 ORDER BY r.created_at DESC`, [date])).rows;
  const stock = (await q(
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
  const units = (await q(
    `SELECT name AS unit_name FROM services
     WHERE is_active AND department_id=(SELECT id FROM departments WHERE slug='pharmacy')
     UNION SELECT DISTINCT unit_name FROM vaccine_stock_transfers
     UNION SELECT DISTINCT unit_name FROM nursing_daily_reports
     UNION SELECT 'OPD vaccination centre' AS unit_name
     ORDER BY unit_name`)).rows;
  ok(res, { reports: rows, stock, units, date }, 'Nursing daily reports');
}));

adminRouter.get('/nursing/dhis2-status', wrap(async (req, res) => {
  if (!await hasStaffPermission(req.user, 'nursing_daily_report')) {
    throw fail(403, 'FORBIDDEN', 'You do not have permission to access nursing reports.');
  }
  const dataElements = config.dhis2DataElements;
  const metadataConfigured = Boolean(config.dhis2DataSetUid && config.dhis2OrgUnitUid
    && dataElements.vaccinationActivity && dataElements.dosesAdministered
    && dataElements.dosesWasted && dataElements.adverseEvents);
  const credentialsConfigured = Boolean(config.dhis2AccessToken || (config.dhis2Username && config.dhis2Password));
  ok(res, {
    configured: metadataConfigured && credentialsConfigured && config.dhis2BaseUrl === 'https://tbh.ephi.gov.et/api',
    metadata_configured: metadataConfigured,
    credentials_configured: credentialsConfigured,
    server: 'tbh.ephi.gov.et',
  }, 'DHIS2 integration status');
}));

adminRouter.post('/nursing/daily-reports', validate(nursingReportSchema), wrap(async (req, res) => {
  if (!await hasStaffPermission(req.user, 'nursing_daily_report')) {
    throw fail(403, 'FORBIDDEN', 'You do not have permission to submit nursing daily reports.');
  }
  const b = req.body;
  if (!isValidDate(b.report_date) || b.report_date > new Date().toISOString().slice(0, 10)) {
    throw fail(422, 'VALIDATION', 'Report date must be valid and cannot be in the future.');
  }
  if (b.doses_wasted > 0 && !b.waste_stock_receipt_id) {
    throw fail(422, 'VALIDATION', 'Select the vaccine batch used for the reported wastage.');
  }
  const saved = await tx(async (client) => {
    let receipt = null;
    if (b.doses_wasted > 0) {
      receipt = (await client.query(
        'SELECT id, vaccine_name, batch_number FROM vaccine_stock_receipts WHERE id=$1 FOR UPDATE',
        [b.waste_stock_receipt_id])).rows[0];
      if (!receipt) throw fail(404, 'NOT_FOUND', 'Vaccine stock batch not found.');
      const available = Number((await client.query(
        `SELECT
           (SELECT coalesce(sum(quantity),0) FROM vaccine_stock_transfers WHERE stock_receipt_id=$1 AND unit_name=$2)
           - (SELECT coalesce(sum(quantity),0) FROM vaccine_stock_usages WHERE stock_receipt_id=$1 AND unit_name=$2) AS available`,
        [receipt.id, b.unit_name])).rows[0].available);
      if (b.doses_wasted > available) throw fail(409, 'INSUFFICIENT_STOCK', `Only ${available} doses remain in ${b.unit_name} for this batch.`);
    }
    const row = (await client.query(
      `INSERT INTO nursing_daily_reports
        (report_date, unit_name, vaccination_activity, adverse_events, doses_wasted, waste_stock_receipt_id, notes, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (report_date, unit_name) DO NOTHING
       RETURNING id, report_date, unit_name, vaccination_activity, adverse_events, doses_wasted, waste_stock_receipt_id, notes, submitted_by, dhis2_status`,
      [b.report_date, b.unit_name, b.vaccination_activity, b.adverse_events, b.doses_wasted,
       b.doses_wasted ? b.waste_stock_receipt_id : null, b.notes || null, req.user.id])).rows[0];
    if (!row) throw fail(409, 'DUPLICATE_REPORT', 'A nursing report has already been submitted for this unit and date.');
    if (b.doses_wasted > 0) {
      await client.query(
        `INSERT INTO vaccine_stock_usages (stock_receipt_id, unit_name, usage_type, quantity, recorded_by)
         VALUES ($1,$2,'WASTED',$3,$4)`,
        [receipt.id, b.unit_name, b.doses_wasted, req.user.id]);
    }
    return row;
  });
  await audit(req, 'NURSING_DAILY_REPORT_SUBMITTED', 'nursing_daily_reports', saved.id,
    `date ${b.report_date}, vaccination activity ${b.vaccination_activity ? 'yes' : 'no'}, unit ${b.unit_name}`);
  ok(res, { report: saved }, 'Nursing daily report submitted', 201);
}));

adminRouter.post('/nursing/daily-reports/:id/dhis2', wrap(async (req, res) => {
  if (!await hasStaffPermission(req.user, 'nursing_daily_report')) {
    throw fail(403, 'FORBIDDEN', 'You do not have permission to submit nursing reports to DHIS2.');
  }
  const report = await one(
    `SELECT r.*, coalesce(v.doses_administered,0)::int AS doses_administered
     FROM nursing_daily_reports r
     LEFT JOIN LATERAL (
       SELECT sum(quantity) AS doses_administered
       FROM vaccine_stock_usages
       WHERE usage_type='ADMINISTERED' AND created_at::date=r.report_date AND unit_name=r.unit_name
     ) v ON true
     WHERE r.id=$1`, [Number(req.params.id)]);
  if (!report) throw fail(404, 'NOT_FOUND', 'Nursing daily report not found.');
  const dataElements = config.dhis2DataElements;
  const credentialsConfigured = Boolean(config.dhis2AccessToken || (config.dhis2Username && config.dhis2Password));
  const metadataConfigured = Boolean(config.dhis2DataSetUid && config.dhis2OrgUnitUid
    && dataElements.vaccinationActivity && dataElements.dosesAdministered
    && dataElements.dosesWasted && dataElements.adverseEvents);
  let endpoint;
  try {
    endpoint = new URL(config.dhis2BaseUrl);
  } catch {
    throw fail(503, 'DHIS2_NOT_CONFIGURED', 'DHIS2 integration is not configured. Ask the administrator to configure server-side DHIS2 settings.');
  }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'tbh.ephi.gov.et'
      || !credentialsConfigured || !metadataConfigured) {
    throw fail(503, 'DHIS2_NOT_CONFIGURED', 'DHIS2 submission is disabled until an authorized service account and the data set, organization unit, and data-element UIDs are configured.');
  }
  const period = String(report.report_date).slice(0, 10).replaceAll('-', '');
  const value = (dataElement, number) => ({ dataElement, period, orgUnit: config.dhis2OrgUnitUid, value: String(number) });
  const payload = {
    dataSet: config.dhis2DataSetUid,
    completeDate: String(report.report_date).slice(0, 10),
    orgUnit: config.dhis2OrgUnitUid,
    dataValues: [
      value(dataElements.vaccinationActivity, report.vaccination_activity ? 1 : 0),
      value(dataElements.dosesAdministered, report.doses_administered),
      value(dataElements.dosesWasted, report.doses_wasted),
      value(dataElements.adverseEvents, report.adverse_events ? 1 : 0),
    ],
  };
  const headers = { 'Content-Type': 'application/json' };
  if (config.dhis2AccessToken) headers.Authorization = `Bearer ${config.dhis2AccessToken}`;
  else headers.Authorization = `Basic ${Buffer.from(`${config.dhis2Username}:${config.dhis2Password}`).toString('base64')}`;
  let response;
  try {
    response = await fetch(new URL('dataValueSets', `${endpoint.href.replace(/\/?$/, '/')}`), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw fail(504, 'DHIS2_TIMEOUT', 'DHIS2 did not respond in time. The report remains saved locally and can be retried.');
    }
    console.error('[dhis2] report submission failed:', error.message);
    throw fail(502, 'DHIS2_UNAVAILABLE', 'DHIS2 could not be reached. The report remains saved locally and can be retried.');
  }
  const responseBody = await response.text();
  if (!response.ok) {
    console.error(`[dhis2] report ${report.id} rejected with HTTP ${response.status}`);
    throw fail(502, 'DHIS2_REJECTED', 'DHIS2 rejected the report. Check the configured data set and data-element mappings; the report remains saved locally.');
  }
  let importSummary;
  try { importSummary = JSON.parse(responseBody); } catch { importSummary = null; }
  if (importSummary?.status === 'ERROR' || Number(importSummary?.importCount?.ignored || 0) > 0) {
    console.error(`[dhis2] report ${report.id} import returned errors`);
    throw fail(502, 'DHIS2_REJECTED', 'DHIS2 did not accept all report values. Check data-set period and element mappings; the report remains saved locally.');
  }
  await q(`UPDATE nursing_daily_reports SET dhis2_status='SUBMITTED', dhis2_submitted_at=now() WHERE id=$1`, [report.id]);
  await audit(req, 'NURSING_REPORT_SUBMITTED_DHIS2', 'nursing_daily_reports', report.id, `date ${String(report.report_date).slice(0, 10)}`);
  ok(res, { id: report.id, dhis2_status: 'SUBMITTED' }, 'Report submitted to DHIS2');
}));

adminRouter.patch('/users/:id/permissions', requireRole(), validate(z.object({
  yellow_fever_manager: z.boolean(),
  nursing_daily_report: z.boolean(),
})), wrap(async (req, res) => {
  const userId = Number(req.params.id);
  const target = await one(
    `SELECT u.id, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id
     WHERE u.id=$1 AND u.deleted_at IS NULL`, [userId]);
  if (!target || target.role === 'patient') throw fail(404, 'NOT_FOUND', 'Staff account not found.');
  const permissions = [
    ['yellow_fever_manager', req.body.yellow_fever_manager],
    ['nursing_daily_report', req.body.nursing_daily_report],
  ];
  await tx(async (client) => {
    for (const [permission, enabled] of permissions) {
      if (enabled) {
        await client.query(
          `INSERT INTO staff_permissions (user_id, permission_code, granted_by)
           VALUES ($1,$2,$3) ON CONFLICT (user_id, permission_code)
           DO UPDATE SET granted_by=EXCLUDED.granted_by, granted_at=now()`,
          [userId, permission, req.user.id]);
      } else {
        await client.query('DELETE FROM staff_permissions WHERE user_id=$1 AND permission_code=$2', [userId, permission]);
      }
    }
  });
  await audit(req, 'STAFF_PERMISSIONS_UPDATED', 'users', userId,
    permissions.filter(([, enabled]) => enabled).map(([permission]) => permission).join(',') || 'revoked all custom permissions');
  ok(res, { permissions: Object.fromEntries(permissions) }, 'Staff permissions updated');
}));

// ---------- staff management (admin only) ----------
const STAFF_ROLES = ['super_admin','hospital_admin','hr_admin','receptionist','doctor','nurse','pharmacy','laboratory','finance','content_manager'];

adminRouter.get('/users', requireRole(), wrap(async (_req, res) => {
  const rows = (await q(
    `SELECT u.id, u.username, u.email, u.phone, u.full_name, r.code AS role, d.name AS department,
            u.is_active, u.last_login_at, u.created_at,
            EXISTS (SELECT 1 FROM staff_permissions p WHERE p.user_id=u.id AND p.permission_code='yellow_fever_manager') AS can_manage_yellow_fever,
            EXISTS (SELECT 1 FROM staff_permissions p WHERE p.user_id=u.id AND p.permission_code='nursing_daily_report') AS can_submit_nursing_daily_report
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
}).refine(({ key, value }) => {
  if (key === 'site_heartbeat') return ['true', 'false'].includes(value);
  if (key !== 'internal_fullanke_url') return true;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const parts = url.hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  } catch {
    return false;
  }
}, {
  message: 'Fullanke URL must use HTTP or HTTPS and point to a private IPv4 address.',
})), wrap(async (req, res) => {
  if (req.body.key === 'site_heartbeat') {
    await q(
      `INSERT INTO hospital_settings (key, value, description)
       VALUES ('site_heartbeat', $1, 'Enable the animated heartbeat effect across the public website')
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [req.body.value]);
  } else {
    const r = await q('UPDATE hospital_settings SET value=$1, updated_at=now() WHERE key=$2', [req.body.value, req.body.key]);
    if (!r.rowCount) throw fail(404, 'NOT_FOUND', 'Unknown setting key.');
  }
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
