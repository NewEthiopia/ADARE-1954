import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { requireAuth, requireRole, audit } from '../auth.js';
import { ok, wrap } from '../http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const credentials = JSON.parse(readFileSync(
  path.join(__dirname, '..', '..', 'data', 'hospital-educational-credentials.json'),
  'utf8'
));

export const hrRouter = Router();

hrRouter.get('/credentials', requireAuth, requireRole('hr_admin', 'hospital_admin', 'super_admin'), wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await audit(req, 'HR_CREDENTIALS_VIEWED', 'hr_credentials', null, `${credentials.length} credential records`);
  ok(res, { credentials, record_count: credentials.length }, 'Staff educational credentials');
}));
