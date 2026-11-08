// ============================================================
// ADARE GENERAL HOSPITAL DIGITAL PLATFORM — API server
// Express + PostgreSQL · JWT auth · RBAC · SSE realtime · OpenAPI
// ============================================================
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler, ok } from './http.js';
import { hashPassword, requireAuth } from './auth.js';
import { sseHandler } from './notify.js';
import { runMigrations } from '../scripts/migrate.js';
import { authRouter } from './routes/auth.routes.js';
import { demoRouter } from './routes/demo.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { patientsRouter } from './routes/patients.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { leadershipRouter } from './routes/leadership.routes.js';
import { procurementRouter, procurementAdminRouter } from './routes/procurement.routes.js';
import { assistantRouter } from './routes/assistant.routes.js';
import { doctorsAdminRouter } from './routes/doctors.routes.js';
import { hrRouter } from './routes/hr.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],       // SPA inline bootstrap only
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.facebook.com', 'https://web.facebook.com', 'https://staticxx.facebook.com'],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// ---------- health ----------
app.get('/api/health', async (_req, res) => {
  const checks = { server: true, database: false };
  try { await pool.query('SELECT 1'); checks.database = true; } catch {}
  const healthy = Object.values(checks).every(Boolean);
  res.status(200).json({ ok: healthy, data: { status: healthy ? 'healthy' : 'degraded', checks, time: new Date().toISOString() } });
});

app.get('/api/live', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
  res.write(`event: connected\ndata: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);
  const timer = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`), 15000);
  req.on('close', () => clearInterval(timer));
});

// ---------- realtime (SSE) ----------
app.get('/api/events', requireAuth, sseHandler);

// ---------- routes ----------
app.use('/api/auth', authRouter);
app.use('/api/auth', demoRouter);
app.use('/api', publicRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/leadership', leadershipRouter);
app.use('/api/procurement', procurementRouter);
app.use('/api/admin/procurement', procurementAdminRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/admin/doctors', doctorsAdminRouter);
app.use('/api/hr', hrRouter);

// public media (leader photos etc.) — long cache, immutable filenames
app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', immutable: true }));

// ---------- OpenAPI ----------
app.get('/api/docs/openapi.json', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'docs', 'openapi.json'));
});

// ---------- static SPA (production build) ----------
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND', error: `No route ${req.method} ${req.path}` }));
app.use(errorHandler);

async function startServer() {
  if (config.env === 'production' && !/^[a-f0-9]{64}$/i.test(config.passportEncryptionKey)) {
    throw new Error('PASSPORT_ENCRYPTION_KEY must be set to 64 hexadecimal characters in production.');
  }
  try {
    await runMigrations(false);
    await bootstrapInitialAdmin();
  } catch (error) {
    console.error('[adare-platform] startup initialization failed:', error.message);
    throw error;
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[adare-platform] API listening on 0.0.0.0:${config.port} (${config.env})`);
  });
}

async function bootstrapInitialAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME || '';
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME || '';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (![username, fullName, password].some(Boolean)) return;
  if (config.env !== 'production') {
    throw new Error('Initial administrator bootstrap is only available in production.');
  }
  if (!username || !fullName || !password || username.length > 60 || fullName.length > 150 || password.length < 16) {
    throw new Error('Set a valid BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_NAME, and password of at least 16 characters.');
  }

  const existing = await pool.query(
    `SELECT u.id, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.username=$1`,
    [username]
  );
  if (existing.rowCount) {
    if (existing.rows[0].role_code !== 'super_admin') {
      throw new Error('The configured bootstrap username already belongs to a non-administrator account.');
    }
    console.info('[adare-platform] Initial administrator bootstrap already completed; remove BOOTSTRAP_ADMIN_* variables.');
    return;
  }

  const administrators = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='super_admin' LIMIT 1`
  );
  if (administrators.rowCount) {
    throw new Error('A super administrator already exists; refusing to create another bootstrap account.');
  }

  await pool.query(
    `INSERT INTO users (username, full_name, password_hash, role_id)
     VALUES ($1,$2,$3,(SELECT id FROM roles WHERE code='super_admin'))`,
    [username, fullName, await hashPassword(password)]
  );
  console.info('[adare-platform] Initial super administrator created; remove BOOTSTRAP_ADMIN_* variables.');
}

startServer();
