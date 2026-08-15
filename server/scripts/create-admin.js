// Production: create the first super administrator.
// Usage: node scripts/create-admin.js <username> "<full name>" [password]
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from '../src/db.js';

const [username, fullName, passwordArg] = process.argv.slice(2);
if (!username || !fullName) {
  console.error('Usage: node scripts/create-admin.js <username> "<full name>" [password]');
  process.exit(1);
}
const password = passwordArg || crypto.randomBytes(9).toString('hex');
if (password.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }

const exists = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
if (exists.rowCount) { console.error(`User ${username} already exists.`); process.exit(1); }
await pool.query(
  `INSERT INTO users (username, full_name, password_hash, role_id)
   VALUES ($1,$2,$3,(SELECT id FROM roles WHERE code='super_admin'))`,
  [username, fullName, await bcrypt.hash(password, 11)]);
console.log(`Super administrator created.\n  username: ${username}\n  password: ${password}\nStore this securely — it is not shown again.`);
await pool.end();
