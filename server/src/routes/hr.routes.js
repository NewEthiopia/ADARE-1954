import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRole, audit } from '../auth.js';
import { fail, ok, wrap } from '../http.js';
import { q } from '../db.js';

export const hrRouter = Router();

const credentialRecord = z.object({
  id: z.number().int().positive(),
  sn: z.union([z.string().max(100), z.number().finite()])
    .transform(value => String(value))
    .optional()
    .default(''),
  name: z.string().max(300).optional().default(''),
  origName: z.string().max(300).optional().default(''),
  stId: z.string().max(150).optional().default(''),
  origInst: z.string().max(300).optional().default(''),
  origLevel: z.string().max(150).optional().default(''),
  origField: z.string().max(300).optional().default(''),
  origCampus: z.string().max(200).optional().default(''),
  origProg: z.string().max(150).optional().default(''),
  admYr: z.string().max(100).optional().default(''),
  gradYr: z.string().max(100).optional().default(''),
  remarks: z.string().max(2000).optional().default(''),
  level: z.string().max(200).optional().default(''),
  dept: z.string().max(300).optional().default(''),
  inst: z.string().max(300).optional().default(''),
  prog: z.string().max(150).optional().default(''),
  campus: z.string().max(200).optional().default(''),
  recType: z.string().max(150).optional().default(''),
  audit: z.string().max(150).optional().default(''),
  missing: z.number().int().nonnegative().optional().default(0),
  documentLink: z.string().max(2048).optional().default(''),
}).strict();

export const credentialsSchema = z.array(credentialRecord).min(1).max(5000).superRefine((records, context) => {
  const ids = new Set();
  records.forEach((record, index) => {
    if (ids.has(record.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: `Credential record ID ${record.id} appears more than once.`,
      });
    }
    ids.add(record.id);
  });
});

const firstText = (record, keys) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
    if (typeof record[key] === 'number' && Number.isFinite(record[key])) return String(record[key]);
  }
  return '';
};

export function normalizeGroupedCredentials(input) {
  if (!Array.isArray(input) || !input.length || !input.every(record => record && Array.isArray(record.credentials))) {
    return input;
  }

  return input.flatMap(employee => employee.credentials.map((credential, index) => {
    const employeeId = employee.id;
    if (!credential || typeof credential !== 'object' || Array.isArray(credential)) return credential;
    return {
      id: 8_000_000_000_000_000 + employeeId * 10 + index,
      sn: firstText(employee, ['serialNumber', 'serial_number', 'sn']),
      name: firstText(employee, ['fullName', 'full_name', 'name']),
      stId: firstText(credential, ['studentId', 'student_id']),
      origInst: firstText(credential, ['nameOfInstitutionAttended', 'name_of_institution_attended', 'institutionAttended', 'institution_attended', 'institution']),
      origLevel: firstText(credential, ['levelOfEducation', 'level_of_education', 'level']),
      origField: firstText(credential, ['fieldOfStudy', 'field_of_study', 'field']),
      origCampus: firstText(credential, ['campus']),
      origProg: firstText(credential, ['educationProgram', 'education_program', 'program']),
      admYr: firstText(credential, ['yearOfAdmission', 'yearOfAdimission', 'year_of_admission', 'year_of_adimission', 'admissionYear']),
      gradYr: firstText(credential, ['yearOfGraduation', 'year_of_graduation', 'graduationYear']),
      remarks: firstText(credential, ['remarks']),
      level: firstText(credential, ['levelOfEducation', 'level_of_education', 'level']),
      inst: firstText(credential, ['nameOfInstitutionAttended', 'name_of_institution_attended', 'institutionAttended', 'institution_attended', 'institution']),
      prog: firstText(credential, ['educationProgram', 'education_program', 'program']),
      campus: firstText(credential, ['campus']),
      documentLink: firstText(credential, ['attachedDocumentLink', 'attached_document_link', 'documentLink']),
    };
  }));
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
}).single('file');

function parseCredentialsFile(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(fail(413, 'FILE_TOO_LARGE', 'Credential JSON must be no larger than 2 MB.'));
    }
    return next(fail(400, 'INVALID_UPLOAD', 'Upload one JSON credential file.'));
  });
}

hrRouter.get('/credentials', requireAuth, requireRole('hr_admin', 'hospital_admin', 'super_admin'), wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await q('SELECT record_json FROM hr_credential_records ORDER BY id');
  await audit(req, 'HR_CREDENTIALS_VIEWED', 'hr_credentials', null, `${result.rowCount} credential records`);
  ok(res, { credentials: result.rows.map(row => row.record_json), record_count: result.rowCount }, 'Staff educational credentials');
}));

hrRouter.post(
  '/credentials/import',
  requireAuth,
  requireRole('hr_admin', 'hospital_admin', 'super_admin'),
  parseCredentialsFile,
  wrap(async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.json')) {
      throw fail(400, 'INVALID_FILE', 'Choose a .json credential export.');
    }

    let input;
    try {
      input = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      throw fail(422, 'INVALID_JSON', 'The uploaded file is not valid JSON.');
    }

    const parsed = credentialsSchema.safeParse(normalizeGroupedCredentials(input));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw fail(422, 'INVALID_CREDENTIALS', `Credential data is invalid at ${issue.path.join('.') || 'input'}: ${issue.message}`);
    }

    const result = await q(
      `INSERT INTO hr_credential_records (id, record_json)
       SELECT (item->>'id')::bigint, item
       FROM jsonb_array_elements($1::jsonb) AS entries(item)
       ON CONFLICT (id) DO UPDATE
       SET record_json=EXCLUDED.record_json, updated_at=now()
       RETURNING id`,
      [JSON.stringify(parsed.data)]
    );
    const total = await q('SELECT count(*)::int AS count FROM hr_credential_records');
    await audit(req, 'HR_CREDENTIALS_IMPORTED', 'hr_credentials', null, `${result.rowCount} records upserted`);
    ok(res, {
      imported_count: result.rowCount,
      total_count: total.rows[0].count,
      omitted_records_preserved: true,
    }, 'Credential records imported');
  })
);
