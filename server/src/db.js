import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function q(text, params = []) {
  return pool.query(text, params);
}

export async function one(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows[0] ?? null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Race-safe reference numbers: AGH-APT-2026-000001 */
export async function nextReference(prefix, client = null) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const sql = `INSERT INTO reference_counters (counter_key, current_value) VALUES ($1, 1)
               ON CONFLICT (counter_key) DO UPDATE SET current_value = reference_counters.current_value + 1
               RETURNING current_value`;
  const r = client ? await client.query(sql, [key]) : await pool.query(sql, [key]);
  return `AGH-${prefix}-${year}-${String(r.rows[0].current_value).padStart(6, '0')}`;
}
