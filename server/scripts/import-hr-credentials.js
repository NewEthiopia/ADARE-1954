import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialsSchema } from '../src/routes/hr.routes.js';
import { pool, q, tx } from '../src/db.js';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'data', 'hospital-educational-credentials.json');

try {
  const input = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Credential data is invalid at ${issue.path.join('.') || 'input'}: ${issue.message}`);
  }

  await runMigrations(false);
  await tx(client => client.query(
    `INSERT INTO hr_credential_records (id, record_json)
     SELECT (item->>'id')::bigint, item
     FROM jsonb_array_elements($1::jsonb) AS entries(item)
     ON CONFLICT (id) DO UPDATE
     SET record_json=EXCLUDED.record_json, updated_at=now()`,
    [JSON.stringify(parsed.data)]
  ));

  const result = await q('SELECT count(*)::int AS count FROM hr_credential_records');
  console.log(`Imported ${parsed.data.length} local HR credential records. Database total: ${result.rows[0].count}.`);
} catch (error) {
  console.error(`[hr-credentials] Import failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
