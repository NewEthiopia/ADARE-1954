// Adare Platform — server configuration (env-driven; see .env.example)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://agh:AghDevPg2026@127.0.0.1:5432/adare_platform',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-jwt-secret-change-in-production',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'dev-only-refresh-secret-change-me',
  accessTtl: process.env.ACCESS_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 14),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'storage', 'uploads'),
  privateDir: process.env.PRIVATE_DIR || path.join(__dirname, '..', 'storage', 'private'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
  loginMaxFails: Number(process.env.LOGIN_MAX_FAILS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  secureCookies: process.env.SECURE_COOKIES === '1',
  // One-click demo role logins (testing suite). Defaults ON outside production.
  // Set DEMO_MODE=0 to force-disable, DEMO_MODE=1 to force-enable.
  demoMode: process.env.DEMO_MODE !== undefined
    ? process.env.DEMO_MODE === '1'
    : (process.env.NODE_ENV || 'development') !== 'production',
  // Provider integrations — empty means NOT CONFIGURED (never simulated)
  smsProvider: process.env.SMS_PROVIDER || '',
  smsApiKey: process.env.SMS_API_KEY || '',
  smtpHost: process.env.SMTP_HOST || '',
  paymentProvider: process.env.PAYMENT_PROVIDER || '',
  paymentApiKey: process.env.PAYMENT_API_KEY || '',
};
