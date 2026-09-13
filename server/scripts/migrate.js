// Apply numbered PostgreSQL migrations in order. Each migration is idempotent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, '..', 'db');
const migrations = fs.readdirSync(dbDir).filter(name => /^\d+_.+\.sql$/.test(name)).sort();

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const migrationState = await pool.query('SELECT filename FROM schema_migrations');
  if (!migrationState.rowCount) {
    const existingCore = await pool.query("SELECT to_regclass('public.users') AS table_name");
    if (existingCore.rows[0].table_name) {
      const legacyMigrations = migrations.filter(name => Number(name.slice(0, 3)) < 7);
      for (const migration of legacyMigrations) {
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [migration]);
      }
    }
  }
  for (const migration of migrations) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [migration]);
    if (applied.rowCount) {
      console.log(`Skipping ${migration} (already applied)`);
      continue;
    }
    process.stdout.write(`Applying ${migration}... `);
    await pool.query(fs.readFileSync(path.join(dbDir, migration), 'utf8'));
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migration]);
    console.log('done');
  }
  console.log(`Applied ${migrations.length} migrations.`);
} finally {
  await pool.end();
}
