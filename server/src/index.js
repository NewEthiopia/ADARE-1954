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
import { requireAuth } from './auth.js';
import { sseHandler } from './notify.js';
import { authRouter } from './routes/auth.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { patientsRouter } from './routes/patients.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { leadershipRouter } from './routes/leadership.routes.js';

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
  res.status(healthy ? 200 : 503).json({ ok: healthy, data: { status: healthy ? 'healthy' : 'degraded', checks, time: new Date().toISOString() } });
});

// ---------- realtime (SSE) ----------
app.get('/api/events', requireAuth, sseHandler);

// ---------- routes ----------
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/leadership', leadershipRouter);

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

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[adare-platform] API listening on 0.0.0.0:${config.port} (${config.env})`);
});
