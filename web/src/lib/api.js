// Typed-style API client: envelope handling, auto token refresh, SSE.
const API = '/api';
let accessToken = null;
let currentUser = null;
let currentPatient = null;

export const auth = {
  get user() { return currentUser; },
  get patient() { return currentPatient; },
  get token() { return accessToken; },
  set({ access_token, user, patient }) {
    accessToken = access_token ?? accessToken;
    currentUser = user ?? currentUser;
    currentPatient = patient !== undefined ? patient : currentPatient;
  },
  clear() { accessToken = null; currentUser = null; currentPatient = null; },
};

async function raw(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(API + path, { ...options, headers, credentials: 'same-origin' });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  return { res, payload };
}

export async function api(path, options = {}) {
  let { res, payload } = await raw(path, options);
  if (res.status === 401 && payload.code === 'TOKEN_EXPIRED') {
    const refreshed = await tryRefresh();
    if (refreshed) ({ res, payload } = await raw(path, options));
  }
  if (!res.ok) {
    const err = new Error(payload.error || payload.message || `HTTP ${res.status}`);
    err.status = res.status; err.code = payload.code;
    throw err;
  }
  return payload.data ?? payload;
}

export async function tryRefresh() {
  try {
    const { res, payload } = await raw('/auth/refresh', { method: 'POST' });
    if (!res.ok) return false;
    auth.set(payload.data);
    return true;
  } catch { return false; }
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
export const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });

// ---- SSE realtime (staff dashboards) ----
export function connectEvents(onEvent) {
  if (!accessToken) return null;
  // EventSource cannot send headers; use fetch-based stream
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${API}/events`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const ev = /^event: (.+)$/m.exec(part)?.[1];
          const data = /^data: (.+)$/m.exec(part)?.[1];
          if (ev && data) { try { onEvent(ev, JSON.parse(data)); } catch {} }
        }
      }
    } catch { /* disconnected */ }
  })();
  return () => controller.abort();
}


/** Avatar initials — prefers the Latin name in parentheses for Ethiopic names.
 *  "ዶ/ር አስበው (Dr. Asbew)" → "A" · "Dr. Sara Tesfaye" → "ST" */
export function initials(name) {
  const latin = /\(([^)]+)\)/.exec(name || '');
  const source = (latin ? latin[1] : name || '').replace(/^Dr\.?\s*/i, '').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return chars || '⚕';
}
