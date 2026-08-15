// Central notification service + SSE real-time bus (spec §17, §44).
// External channels (SMS/email/push) go through provider interfaces and are
// NEVER simulated: with no provider configured they are recorded as skipped.
import { q } from './db.js';
import { config } from './config.js';

// ---- SSE bus ----
const clients = new Set();   // { res, role, userId }

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  const client = { res, role: req.user?.role ?? null, userId: req.user?.id ?? null };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

export function broadcast(event, payload, { roles = null } = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    if (roles && c.role && !roles.includes(c.role) && !['super_admin', 'hospital_admin'].includes(c.role)) continue;
    try { c.res.write(msg); } catch { clients.delete(c); }
  }
}

// ---- persisted notifications ----
export async function notifyRole(roleCode, type, title, body, reference = null) {
  await q(
    `INSERT INTO notifications (audience, role_code, type, title, body, reference) VALUES ('role',$1,$2,$3,$4,$5)`,
    [roleCode, type, title.slice(0, 150), body.slice(0, 500), reference]
  );
  broadcast('notification', { type, title, body, reference }, { roles: [roleCode] });
}

export async function notifyPatient(patientId, type, title, body, reference = null) {
  await q(
    `INSERT INTO notifications (audience, patient_id, type, title, body, reference) VALUES ('patient',$1,$2,$3,$4,$5)`,
    [patientId, type, title.slice(0, 150), body.slice(0, 500), reference]
  );
}

// ---- provider interfaces (config-dependent; no fake sends) ----
export async function sendSms(phone, message, event, reference) {
  if (!config.smsProvider) {
    console.log(`[sms] provider not configured — skipped ${event} to ${phone}`);
    return { sent: false, reason: 'SMS_PROVIDER_NOT_CONFIGURED' };
  }
  // Implement the configured Ethiopian provider here (server-side key only).
  return { sent: false, reason: 'PROVIDER_IMPLEMENTATION_PENDING' };
}
