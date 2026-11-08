// Staff application: receptionist queue (real-time SSE), patients, payments,
// news CMS, users, audit, reports — role-aware navigation, server-enforced RBAC.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, get, post, patch, auth, connectEvents, tryRefresh } from '../lib/api.js';
import HRCredentialsView from '../components/HRCredentialsView.jsx';

const NAV = [
  ['dashboard', '▦ Dashboard', ['receptionist', 'doctor', 'nurse', 'finance', 'content_manager', 'pharmacy', 'laboratory']],
  ['appointments', '🗓 Appointments', ['receptionist', 'doctor', 'nurse']],
  ['yellow-fever-appointments', '💉 Yellow Fever appointments', []],
  ['nursing-daily-report', '📝 Nursing daily report', []],
  ['patients', '👥 Patients', ['receptionist', 'doctor', 'nurse']],
  ['vaccine-stock', '💉 Vaccine stock', ['pharmacy']],
  ['vaccine-stock-report', '📋 Vaccine stock report', ['pharmacy', 'finance']],
  ['payments', '₵ Payments', ['finance', 'receptionist']],
  ['news', '📰 News CMS', ['content_manager']],
  ['procurement', '📄 Tenders', ['content_manager']],
  ['doctors', '🩺 Doctor images', ['content_manager']],
  ['messages', '✉ Messages', ['content_manager']],
  ['leadership', '🏛 Leadership', ['content_manager']],
  ['users', '♟ Staff users', []],
  ['credentials', '🎓 Staff credentials', ['hr_admin', 'hospital_admin', 'super_admin']],
  ['settings', '⚙ Site settings', []],
  ['audit', '≡ Audit log', []],
  ['reports', '📈 Reports', ['finance', 'receptionist']],
];

const canSee = (role, roles) => roles === null || ['super_admin', 'hospital_admin'].includes(role) || roles.includes(role);

function Toasts({ items }) {
  return <div className="toast-stack" aria-live="polite">{items.map(t => <div className="toast" key={t.id}>{t.text}</div>)}</div>;
}

function Login({ onDone }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [state, setState] = useState({ busy: false, error: '' });
  const [demoRoles, setDemoRoles] = useState([]);
  const [demoBusy, setDemoBusy] = useState('');

  useEffect(() => {
    // demo roles exist only while DEMO_MODE is enabled on the server
    get('/auth/demo-roles').then(d => setDemoRoles(d.roles || [])).catch(() => setDemoRoles([]));
  }, []);

  const finish = (d) => {
    auth.set(d);
    if (d.user.role === 'patient') { window.location.href = '/portal'; return; }
    onDone();
  };
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try { finish(await post('/auth/login', f)); }
    catch (err) { setState({ busy: false, error: err.message }); }
  };
  const demoLogin = async (key) => {
    setDemoBusy(key); setState(s => ({ ...s, error: '' }));
    try { finish(await post('/auth/demo-login', { key })); }
    catch (err) { setState(s => ({ ...s, error: err.message })); setDemoBusy(''); }
  };

  const ICONS = { super_admin: '🛡', director: '📊', surgeon: '🩺', internist: '🩻',
    reception: '🗓', pharmacist: '💊', labtech: '🔬', cashier: '₵', patient: '👤' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--navy-deep), var(--navy))', padding: '34px 18px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', color: '#fff', marginBottom: 26 }}>
          <img src="/logo-192.png" alt="Adare General Hospital logo" width="64" height="64"
            style={{ borderRadius: '50%', background: '#fff', border: '3px solid var(--ochre)', margin: '0 auto 12px', display: 'block' }} />
          <h1 style={{ fontSize: 'clamp(22px,3.4vw,30px)' }}>Adare General Hospital Portal</h1>
          <p style={{ color: '#C9D6E2', fontSize: 15, marginTop: 4 }}>Role Authentication &amp; Staff Workplace Access</p>
        </div>

        {state.error && <div className="alert error" role="alert" style={{ maxWidth: 640, margin: '0 auto 16px' }}>{state.error}</div>}

        {demoRoles.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 14, padding: '20px 20px 14px', marginBottom: 24 }}>
            <p className="mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ochre)', fontWeight: 700 }}>
              ⚡ Instant One-Click Demo Role Login (Testing Suite)
            </p>
            <p style={{ color: '#9FB2C1', fontSize: 12.5, margin: '4px 0 14px' }}>
              Demo mode is for evaluation only — disabled automatically in production. Every demo session is audited.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {demoRoles.map(r => (
                <button key={r.key} onClick={() => demoLogin(r.key)} disabled={!!demoBusy}
                  style={{
                    textAlign: 'start', padding: '13px 14px', borderRadius: 10, cursor: 'pointer',
                    background: demoBusy === r.key ? 'rgba(201,138,40,.25)' : 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.22)', color: '#fff',
                    opacity: demoBusy && demoBusy !== r.key ? .5 : 1, transition: 'background .15s',
                  }}>
                  <span style={{ fontSize: 18 }}>{ICONS[r.key] || '⚕'}</span>
                  <strong style={{ display: 'block', fontSize: 14.5, margin: '4px 0 2px' }}>
                    {demoBusy === r.key ? 'Signing in…' : r.label}
                  </strong>
                  <span style={{ fontSize: 12, color: '#B9C8D6' }}>{r.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 18, maxWidth: 760, margin: '0 auto' }}>
          <form onSubmit={submit} style={{ background: 'var(--surface)', borderRadius: 12, padding: '26px 24px', borderTop: '5px solid var(--red)' }}>
            <h2 style={{ fontSize: 18, color: 'var(--navy)', marginBottom: 4 }}>Custom Login</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Staff username or patient phone/email. Every action is recorded in the audit log.</p>
            <div className="field"><label htmlFor="s-user">Username / Phone / Email</label>
              <input id="s-user" required autoComplete="username" value={f.username} onChange={e => setF(v => ({ ...v, username: e.target.value }))} /></div>
            <div className="field"><label htmlFor="s-pass">Password</label>
              <input id="s-pass" required type="password" autoComplete="current-password" value={f.password} onChange={e => setF(v => ({ ...v, password: e.target.value }))} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={state.busy}>{state.busy ? 'Signing in…' : 'Sign in securely'}</button>
          </form>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '26px 24px', borderTop: '5px solid var(--ochre)' }}>
            <h2 style={{ fontSize: 18, color: 'var(--navy)', marginBottom: 4 }}>Register Patient Account</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Patients create a free account with phone number, email address and password — then book appointments,
              see prescriptions status and payment history in the portal.
            </p>
            <a className="btn btn-navy" style={{ width: '100%' }} href="/portal">Open patient registration →</a>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              Staff accounts are created by administrators only (Staff users view).
            </p>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/" style={{ color: '#C9D6E2', textDecoration: 'underline', fontSize: 13.5 }}>← Public website</a>
        </p>
      </div>
    </div>
  );
}

/* -------------------- Dashboard -------------------- */
function Bars({ rows, labelKey, valueKey, blue }) {
  const max = Math.max(...rows.map(r => Number(r[valueKey]) || 0), 1);
  if (!rows.length) return <p className="muted">No data yet</p>;
  return (
    <div className="bars">
      {rows.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        return (
          <div className="bar-i" key={i}>
            <span className="bar-v">{v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}</span>
            <div className={`bar ${blue ? 'blue' : ''}`} style={{ height: `${Math.max(3, v / max * 100)}%` }} />
            <span className="bar-l">{String(r[labelKey]).slice(5, 10)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardView({ go, toast }) {
  const [d, setD] = useState(null);
  const [systems, setSystems] = useState([]);
  const [fullankeUrl, setFullankeUrl] = useState('http://192.168.1.250/iemrs/');
  const [fullankeBusy, setFullankeBusy] = useState(false);
  const [fullankeError, setFullankeError] = useState('');
  useEffect(() => {
    get('/admin/dashboard').then(setD).catch(() => {});
    get('/admin/internal-systems').then(x => {
      const loadedSystems = x.systems || [];
      setSystems(loadedSystems);
      setFullankeUrl(loadedSystems.find(system => system.name === 'Fullanke')?.url || 'http://192.168.1.250/iemrs/');
    }).catch(err => setFullankeError(err.message));
  }, []);
  if (!d) return <div className="skeleton" style={{ height: 300 }} />;
  const k = d.kpi;
  const role = auth.user?.role;
  const isAdmin = ['super_admin', 'hospital_admin'].includes(role);
  const saveFullankeUrl = async event => {
    event.preventDefault();
    if (fullankeBusy) return;
    setFullankeBusy(true);
    setFullankeError('');
    try {
      const url = fullankeUrl.trim();
      await patch('/admin/settings', { key: 'internal_fullanke_url', value: url });
      setSystems(current => {
        const found = current.some(system => system.name === 'Fullanke');
        if (found) return current.map(system => system.name === 'Fullanke' ? { ...system, url } : system);
        return [...current, { name: 'Fullanke', url, note: 'Integrated electronic medical records system' }];
      });
      setFullankeUrl(url);
      toast('Fullanke address updated');
    } catch (err) {
      setFullankeError(err.message);
    } finally {
      setFullankeBusy(false);
    }
  };
  return (
    <>
      {/* quick actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {(isAdmin || ['receptionist', 'nurse', 'doctor'].includes(role)) &&
          <button className="btn btn-primary btn-sm" onClick={() => go('patients')}>＋ Register Patient</button>}
        {isAdmin &&
          <button className="btn btn-navy btn-sm" onClick={() => go('users')}>＋ Register Staff</button>}
        {(isAdmin || role === 'content_manager') &&
          <button className="btn btn-outline btn-sm" onClick={() => go('news')}>📰 CMS News &amp; Tenders</button>}
        {(isAdmin || ['receptionist', 'doctor', 'nurse'].includes(role)) &&
          <button className="btn btn-outline btn-sm" onClick={() => go('appointments')}>🗓 Appointment Queue</button>}
      </div>

      {/* internal hospital systems — LAN links (open only inside the hospital network) */}
      {(systems.length > 0 || isAdmin) && (
        <div className="panel" style={{ borderTop: '4px solid var(--ochre)' }}>
          <h3>Internal Systems <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>hospital network (LAN) only</span></h3>
          {fullankeError && <div className="alert error" role="alert" style={{ marginBottom: 14 }}>{fullankeError}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {systems.map(s => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                className="btn btn-outline btn-sm" title={`${s.note} — ${s.url}`}>
                🔗 {s.name}
              </a>
            ))}
          </div>
          {isAdmin && (
            <form className="internal-system-editor" onSubmit={saveFullankeUrl}>
              <div className="field">
                <label htmlFor="dashboard-fullanke-url">Fullanke address</label>
                <input
                  id="dashboard-fullanke-url"
                  type="url"
                  required
                  maxLength={4000}
                  value={fullankeUrl}
                  onChange={event => setFullankeUrl(event.target.value)}
                  disabled={fullankeBusy}
                />
                <small className="muted">Admins can update this staff-only link. Use a private hospital-network IPv4 address.</small>
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={fullankeBusy}>
                {fullankeBusy ? 'Saving…' : 'Save Fullanke address'}
              </button>
            </form>
          )}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            These systems run on the hospital's private network (192.168.x.x) and only open from computers
            connected to the hospital LAN/Wi-Fi.
          </p>
        </div>
      )}
      <div className="kpi-row">
        <div className="kpi"><div className="v">{k.total_patients}</div><div className="l">Total patients</div></div>
        <div className="kpi ochre"><div className="v">{k.todays_appointments}</div><div className="l">Today's appointments</div></div>
        <div className="kpi red"><div className="v">{k.pending_appointments}</div><div className="l">Pending appointments</div></div>
        <div className="kpi green"><div className="v">{Number(k.today_revenue).toLocaleString()}</div><div className="l">Today's revenue (ETB)</div></div>
        <div className="kpi red"><div className="v">{k.pending_payments}</div><div className="l">Pending payments</div></div>
        <div className="kpi"><div className="v">{k.active_staff}</div><div className="l">Active staff</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
        <div className="panel"><h3>Appointments · 14 days</h3><Bars rows={d.appointments_by_day} labelKey="day" valueKey="c" /></div>
        <div className="panel"><h3>Revenue · 14 days</h3><Bars rows={d.revenue_by_day} labelKey="day" valueKey="v" blue /></div>
        <div className="panel"><h3>Patient registrations</h3><Bars rows={d.registrations_by_day} labelKey="day" valueKey="c" /></div>
        <div className="panel"><h3>Appointment status</h3>
          {d.appointment_status.map(s => (
            <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
              <span className={`status-pill st-${s.status}`}>{s.status}</span><strong>{s.c}</strong>
            </div>
          ))}
          {!d.appointment_status.length && <p className="muted">No appointments yet</p>}
        </div>
      </div>
      <div className="panel">
        <h3>Recent activity</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Reference</th><th>Patient</th><th>Department</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {d.recent.map(r => (
              <tr key={r.reference}><td className="mono">{r.reference}</td><td>{r.patient_name}</td>
                <td>{r.department || '—'}</td><td>{String(r.preferred_date).slice(0, 10)}</td>
                <td><span className={`status-pill st-${r.status}`}>{r.status}</span></td></tr>
            ))}
            {!d.recent.length && <tr><td colSpan={5} className="muted">No activity yet.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

/* -------------------- Appointments -------------------- */
const ACTIONS = {
  PENDING: [['confirm', 'Confirm', 'btn-navy'], ['reject', 'Reject', 'btn-outline'], ['reschedule', 'Reschedule', 'btn-outline']],
  RESCHEDULED: [['confirm', 'Confirm', 'btn-navy'], ['checkin', 'Check-in', 'btn-navy'], ['cancel', 'Cancel', 'btn-outline'], ['noshow', 'No-show', 'btn-outline']],
  CONFIRMED: [['checkin', 'Check-in', 'btn-navy'], ['reschedule', 'Reschedule', 'btn-outline'], ['cancel', 'Cancel', 'btn-outline'], ['noshow', 'No-show', 'btn-outline']],
  CHECKED_IN: [['start', 'Start consult', 'btn-navy'], ['complete', 'Complete', 'btn-navy']],
  IN_CONSULTATION: [['complete', 'Complete', 'btn-navy']],
};

function AppointmentsView({ toast, yellowOnly = false, canVaccinate = false }) {
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ status: '', date: '', q: '' });
  const [confirmBox, setConfirmBox] = useState(null); // {reference, action}
  const [receipt, setReceipt] = useState(null);
  const [vaccination, setVaccination] = useState(null);
  const [vaccineStock, setVaccineStock] = useState([]);
  const [vaccinationForm, setVaccinationForm] = useState({ stock_receipt_id: '', unit_name: '', yellow_card_certificate_issued: 'yes' });
  const [passportImage, setPassportImage] = useState(null);
  useEffect(() => {
    if (!receipt) return undefined;
    document.body.classList.add('printing-appointment-receipt');
    return () => document.body.classList.remove('printing-appointment-receipt');
  }, [receipt]);
  const load = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    if (yellowOnly) p.set('yellow_fever', 'true');
    get(`/appointments?${p}`).then(d => setRows(d.appointments)).catch(e => toast(e.message));
  }, [filters, toast, yellowOnly]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  useEffect(() => {
    const stop = connectEvents((ev) => { if (ev === 'appointment') load(); });
    return () => stop && stop();
  }, [load]);

  const run = async (reference, action) => {
    let body = { action };
    if (action === 'reject' || action === 'cancel') {
      const note = prompt('Note for the patient (required):');
      if (note === null) return;
      if (!note) { toast('A note is required.'); return; }
      body.note = note;
    }
    if (action === 'reschedule') {
      const date = prompt('New date (YYYY-MM-DD):');
      if (!date) return;
      body.scheduled_date = date;
      const time = prompt('Time HH:MM (optional):') || undefined;
      if (time) body.scheduled_time = time;
    }
    try {
      await patch(`/appointments/${reference}`, body);
      toast(`${reference} → ${action}`);
      load();
    } catch (e) { toast(e.message); }
  };
  const beginVaccination = async (appointment) => {
    try {
      const data = await get('/appointments/vaccine-stock');
      setVaccineStock(data.stock || []);
      if (!data.stock?.length) {
        toast('No non-expired vaccine doses are available in a pharmacy unit.');
        return;
      }
      setVaccination(appointment);
      setVaccinationForm({
        stock_receipt_id: String(data.stock[0].stock_receipt_id),
        unit_name: data.stock[0].unit_name,
        yellow_card_certificate_issued: 'yes',
      });
    } catch (e) { toast(e.message); }
  };
  const recordVaccination = async (event) => {
    event.preventDefault();
    try {
      await post(`/appointments/${vaccination.reference}/vaccination`, {
        stock_receipt_id: Number(vaccinationForm.stock_receipt_id),
        unit_name: vaccinationForm.unit_name,
        yellow_card_certificate_issued: vaccinationForm.yellow_card_certificate_issued === 'yes',
      });
      toast(`${vaccination.reference}: vaccine recorded and stock deducted`);
      setVaccination(null);
      load();
    } catch (e) { toast(e.message); }
  };
  const viewPassport = async (appointment) => {
    try {
      const response = await fetch(`/api/appointments/${appointment.reference}/passport`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const payload = response.ok ? null : await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Passport image could not be loaded.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPassportImage(current => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { reference: appointment.reference, url };
      });
    } catch (e) { toast(e.message); }
  };

  return (
    <>
      <div className="filter-row">
        <select aria-label="Status" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {['PENDING', 'CONFIRMED', 'RESCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].map(s => <option key={s}>{s}</option>)}
        </select>
        <input aria-label="Date" type="date" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
        <input aria-label="Search" placeholder="Name / phone / reference…" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} style={{ flex: '1 1 200px' }} />
        <button className="btn btn-outline btn-sm" onClick={load}>Refresh</button>
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}>Print</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Reference</th><th>Patient</th><th>Department / Doctor</th><th>Date</th><th>Status</th><th>Actions</th><th>Receipt</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={7}><div className="skeleton" style={{ height: 60 }} /></td></tr>}
            {rows?.map(a => (
              <tr key={a.reference} style={a.is_emergency ? { background: 'rgba(200,37,44,.05)' } : undefined}>
                <td className="mono">{a.reference}{a.yellow_fever_vaccination && <><br /><span className="tag" style={{ background: 'rgba(201,138,40,.16)', color: 'var(--navy)' }}>YELLOW FEVER</span></>}{a.is_emergency && <><br /><span className="tag red">URGENT</span></>}</td>
                <td><strong>{a.patient_name}</strong><br /><span className="muted mono" style={{ fontSize: 12 }}>{a.phone}</span></td>
                <td>{a.department || '—'}{a.doctor && <><br /><span className="muted" style={{ fontSize: 13 }}>{a.doctor}</span></>}</td>
                <td>{String(a.scheduled_date || a.preferred_date).slice(0, 10)}<br /><span className="muted" style={{ fontSize: 12 }}>{a.scheduled_time || a.preferred_time || ''}</span></td>
                <td><span className={`status-pill st-${a.status}`}>{a.status}</span>{a.status_note && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.status_note}</p>}</td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(ACTIONS[a.status] || []).map(([act, label, cls]) => (
                    <button key={act} className={`btn btn-sm ${cls}`} onClick={() => run(a.reference, act)}>{label}</button>
                  ))}
                  {a.yellow_fever_vaccination && a.passport_document_name && (
                    <button className="btn btn-outline btn-sm" onClick={() => viewPassport(a)}>Passport image</button>
                  )}
                  {canVaccinate && a.yellow_fever_vaccination && ['CHECKED_IN', 'IN_CONSULTATION'].includes(a.status)
                    && !a.vaccination_administered_at
                    && <button className="btn btn-navy btn-sm" onClick={() => beginVaccination(a)}>Record vaccine</button>}
                  {a.yellow_fever_vaccination && a.vaccination_administered_at && (
                    <span className="status-pill st-COMPLETED">{a.yellow_card_certificate_issued ? 'Yellow card issued' : 'Vaccinated · card pending'}</span>
                  )}
                </div></td>
                <td><button className="btn btn-outline btn-sm no-print" onClick={() => setReceipt(a)}>View / print</button></td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={7} className="muted">No appointments match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {receipt && (
        <div className="appointment-receipt-backdrop no-print" onMouseDown={event => {
          if (event.target === event.currentTarget) setReceipt(null);
        }}>
          <article className="appointment-receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="appointment-receipt-actions no-print">
              <button className="btn btn-outline btn-sm" onClick={() => setReceipt(null)}>Close</button>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print receipt</button>
            </div>
            <header className="appointment-receipt-header">
              <img src="/logo-192.png" alt="" width="58" height="58" />
              <div><strong>Adare General Hospital</strong><span>Hawassa · Sidama · Ethiopia</span></div>
            </header>
            <p className="appointment-receipt-kicker">PATIENT APPOINTMENT</p>
            <h2 id="receipt-title">Appointment receipt</h2>
            <p className="appointment-receipt-reference">{receipt.reference}</p>
            <div className="appointment-receipt-status">
              <span className={`status-pill st-${receipt.status}`}>{receipt.status}</span>
              {receipt.is_emergency && <span className="tag red">Urgent</span>}
            </div>
            <dl className="appointment-receipt-details">
              <div><dt>Patient</dt><dd>{receipt.patient_name}</dd></div>
              <div><dt>Phone</dt><dd>{receipt.phone}</dd></div>
              {receipt.email && <div><dt>Email</dt><dd>{receipt.email}</dd></div>}
              <div><dt>Department</dt><dd>{receipt.department || 'General visit'}</dd></div>
              {receipt.doctor && <div><dt>Doctor</dt><dd>{receipt.doctor}</dd></div>}
              {receipt.service && <div><dt>Service</dt><dd>{receipt.service}</dd></div>}
              <div><dt>Visit date</dt><dd>{receipt.scheduled_date || receipt.preferred_date ? String(receipt.scheduled_date || receipt.preferred_date).slice(0, 10) : 'To be scheduled'}</dd></div>
              <div><dt>Preferred time</dt><dd>{receipt.scheduled_time || receipt.preferred_time || 'Any time'}</dd></div>
              <div><dt>Request received</dt><dd>{new Date(receipt.created_at).toLocaleString()}</dd></div>
            </dl>
            <p className="appointment-receipt-note">
              {receipt.status === 'PENDING'
                ? 'This document confirms receipt of your request. Your appointment is pending and is not confirmed until the hospital contacts you.'
                : receipt.status === 'REJECTED'
                  ? 'This appointment request was declined. Please contact the hospital if you need assistance.'
                  : receipt.status === 'CANCELLED'
                    ? 'This appointment has been cancelled. Please contact the hospital if you need to book another visit.'
                    : receipt.status === 'NO_SHOW'
                      ? 'Hospital records indicate that this appointment was missed. Please contact the hospital to arrange another visit.'
                      : 'Please bring this receipt when you visit the hospital.'}
            </p>
            <footer>Adare General Hospital · 046 221 1661 · Emergency services available 24/7</footer>
          </article>
        </div>
      )}
      {vaccination && (
        <div className="modal-back" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setVaccination(null);
        }}>
          <form className="modal" onSubmit={recordVaccination} aria-labelledby="vaccination-dialog-title">
            <h3 id="vaccination-dialog-title">Record Yellow Fever vaccination</h3>
            <p className="muted" style={{ marginBottom: 16 }}>{vaccination.reference} · {vaccination.patient_name}</p>
            <div className="field"><label htmlFor="vaccination-stock-batch">Vaccine batch *</label>
              <select id="vaccination-stock-batch" required value={vaccinationForm.stock_receipt_id}
                onChange={event => {
                  const [receiptId, unitName] = event.target.value.split('|');
                  setVaccinationForm(current => ({ ...current, stock_receipt_id: receiptId, unit_name: unitName }));
                }}>
                {vaccineStock.map(batch => <option key={`${batch.stock_receipt_id}-${batch.unit_name}`} value={`${batch.stock_receipt_id}|${batch.unit_name}`}>
                  {batch.vaccine_name} · {batch.batch_number} · {batch.unit_name} · {batch.available} doses
                </option>)}
              </select></div>
            <div className="field"><label htmlFor="yellow-card-issued">Yellow card certificate issued? *</label>
              <select id="yellow-card-issued" required value={vaccinationForm.yellow_card_certificate_issued}
                onChange={event => setVaccinationForm(current => ({ ...current, yellow_card_certificate_issued: event.target.value }))}>
                <option value="yes">Yes</option><option value="no">No — issue later</option>
              </select></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => setVaccination(null)}>Cancel</button>
              <button className="btn btn-primary">Confirm vaccination and deduct one dose</button>
            </div>
          </form>
        </div>
      )}
      {passportImage && (
        <div className="modal-back" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) {
            URL.revokeObjectURL(passportImage.url);
            setPassportImage(null);
          }
        }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="passport-dialog-title">
            <h3 id="passport-dialog-title">Passport image · {passportImage.reference}</h3>
            <img src={passportImage.url} alt="Uploaded passport for Yellow Fever appointment"
              style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', margin: '0 auto 16px' }} />
            <button className="btn btn-outline" onClick={() => {
              URL.revokeObjectURL(passportImage.url);
              setPassportImage(null);
            }}>Close passport image</button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------- Patients -------------------- */
function PatientsView({ toast }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', gender: '', date_of_birth: '', insurance_type: 'none' });
  const search = async () => {
    if (q.trim().length < 2) return toast('Enter at least 2 characters');
    try { const d = await get(`/patients?q=${encodeURIComponent(q.trim())}`); setRows(d.patients); }
    catch (e) { toast(e.message); }
  };
  const create = async (e) => {
    e.preventDefault();
    try {
      const d = await post('/patients', { ...form, gender: form.gender || undefined, date_of_birth: form.date_of_birth || undefined });
      toast(`Registered ${d.patient.patient_number}`);
      setForm({ full_name: '', phone: '', gender: '', date_of_birth: '', insurance_type: 'none' });
    } catch (err) { toast(err.message); }
  };
  const open = async (pn) => {
    try { setProfile(await get(`/patients/${pn}`)); } catch (e) { toast(e.message); }
  };
  return (
    <>
      <div className="panel">
        <h3>Register patient</h3>
        <form onSubmit={create} className="form-grid">
          <div className="field"><label>Full name *</label><input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
          <div className="field"><label>Phone *</label><input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div className="field"><label>Gender</label><select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
            <option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div>
          <div className="field"><label>Date of birth</label><input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} /></div>
          <div className="full"><button className="btn btn-primary btn-sm">Register patient</button></div>
        </form>
      </div>
      <div className="panel">
        <h3>Patient search</h3>
        <div className="filter-row">
          <input placeholder="Name, number, phone or appointment reference…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} style={{ flex: 1 }} />
          <button className="btn btn-navy btn-sm" onClick={search}>Search</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Number</th><th>Name</th><th>Phone</th><th>DOB</th><th>Insurance</th><th></th></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.patient_number}><td className="mono">{p.patient_number}</td><td>{p.full_name}</td>
                <td className="mono">{p.phone}</td><td>{p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '—'}</td>
                <td>{p.insurance_type || '—'}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => open(p.patient_number)}>Profile</button></td></tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">Search to find patients.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {profile && (
        <div className="panel">
          <h3>{profile.patient.full_name} <span className="mono muted" style={{ fontSize: 13 }}>{profile.patient.patient_number}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setProfile(null)}>✕ Close</button></h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 16 }}>
            <div><h4 style={{ marginBottom: 8 }}>Appointments</h4>
              <div className="table-wrap"><table><tbody>
                {profile.appointments.map(a => <tr key={a.reference}><td className="mono">{a.reference}</td><td>{a.department || '—'}</td><td><span className={`status-pill st-${a.status}`}>{a.status}</span></td></tr>)}
                {!profile.appointments.length && <tr><td className="muted">None</td></tr>}
              </tbody></table></div></div>
            <div><h4 style={{ marginBottom: 8 }}>Payments</h4>
              <div className="table-wrap"><table><tbody>
                {profile.payments.map(p => <tr key={p.reference}><td className="mono">{p.reference}</td><td>{Number(p.amount).toFixed(2)} ETB</td><td><span className={`status-pill st-${p.status}`}>{p.status}</span></td></tr>)}
                {!profile.payments.length && <tr><td className="muted">None</td></tr>}
              </tbody></table></div></div>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------- Payments -------------------- */
function PaymentsView({ toast }) {
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ status: '', method: '', q: '' });
  const load = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    get(`/payments?${p}`).then(d => setRows(d.payments)).catch(e => toast(e.message));
    get('/payments/summary').then(setSummary).catch(() => {});
  }, [filters, toast]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  useEffect(() => { const stop = connectEvents((ev) => { if (ev === 'payment') load(); }); return () => stop && stop(); }, [load]);
  const act = async (reference, status) => {
    const note = prompt(`${status} note${['FAILED', 'CANCELLED'].includes(status) ? ' (required)' : ' (optional)'}:`);
    if (note === null) return;
    try { await patch(`/payments/${reference}`, { status, note }); toast(`${reference} → ${status}`); load(); }
    catch (e) { toast(e.message); }
  };
  return (
    <>
      {summary && (
        <div className="kpi-row">
          <div className="kpi green"><div className="v">{Number(summary.today_revenue).toLocaleString()}</div><div className="l">Today (ETB)</div></div>
          <div className="kpi"><div className="v">{Number(summary.month_revenue).toLocaleString()}</div><div className="l">This month (ETB)</div></div>
          <div className="kpi red"><div className="v">{summary.counts.PENDING || 0}</div><div className="l">Pending</div></div>
          <div className="kpi green"><div className="v">{summary.counts.SUCCESSFUL || 0}</div><div className="l">Successful</div></div>
          <div className="kpi ochre"><div className="v">{summary.counts.FAILED || 0}</div><div className="l">Failed</div></div>
        </div>
      )}
      <div className="filter-row">
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} aria-label="Status">
          <option value="">All statuses</option>
          {['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.method} onChange={e => setFilters(f => ({ ...f, method: e.target.value }))} aria-label="Method">
          <option value="">All methods</option>
          {['telebirr', 'bank_transfer', 'card', 'cash', 'cbhi', 'other'].map(m => <option key={m}>{m}</option>)}
        </select>
        <input placeholder="Payer / reference…" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} style={{ flex: '1 1 200px' }} />
        <a className="btn btn-outline btn-sm" href="/api/payments/export/csv" onClick={(e) => {
          e.preventDefault();
          fetch('/api/payments/export/csv', { headers: { Authorization: `Bearer ${auth.token}` } })
            .then(r => r.blob()).then(b => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(b); a.download = 'adare-payments.csv'; a.click();
            });
        }}>Export CSV</a>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Reference</th><th>Payer</th><th>Amount</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={6}><div className="skeleton" style={{ height: 50 }} /></td></tr>}
          {rows?.map(p => (
            <tr key={p.reference}>
              <td className="mono">{p.reference}<br /><span className="muted" style={{ fontSize: 11 }}>{p.provider_ref || ''}</span></td>
              <td><strong>{p.payer_name}</strong><br /><span className="muted mono" style={{ fontSize: 12 }}>{p.phone}</span></td>
              <td><strong>{Number(p.amount).toFixed(2)}</strong> {p.currency}</td>
              <td>{p.method}</td>
              <td><span className={`status-pill st-${p.status}`}>{p.status}</span>{p.status_note && <p className="muted" style={{ fontSize: 12 }}>{p.status_note}</p>}</td>
              <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.status === 'PENDING' && <>
                  <button className="btn btn-navy btn-sm" onClick={() => act(p.reference, 'SUCCESSFUL')}>Verify</button>
                  <button className="btn btn-outline btn-sm" onClick={() => act(p.reference, 'FAILED')}>Fail</button>
                </>}
                {p.status === 'SUCCESSFUL' && <button className="btn btn-outline btn-sm" onClick={() => act(p.reference, 'REFUNDED')}>Refund</button>}
              </div></td>
            </tr>
          ))}
          {rows?.length === 0 && <tr><td colSpan={6} className="muted">No payments match.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

/* -------------------- News CMS -------------------- */
function NewsView({ toast }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ title: '', excerpt: '', body_html: '', category_id: '', status: 'DRAFT' });
  const load = useCallback(() => get('/admin/news').then(setData).catch(e => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  const create = async (e) => {
    e.preventDefault();
    try {
      await post('/admin/news', { ...form, category_id: form.category_id ? Number(form.category_id) : null });
      toast('Article created'); setForm({ title: '', excerpt: '', body_html: '', category_id: '', status: 'DRAFT' }); load();
    } catch (err) { toast(err.message); }
  };
  const action = async (id, act) => {
    if (act === 'delete' && !confirm('Delete this article? This cannot be undone.')) return;
    try { await patch(`/admin/news/${id}`, { action: act }); toast(`Article ${act}ed`); load(); }
    catch (e) { toast(e.message); }
  };
  return (
    <>
      <div className="panel">
        <h3>Create article</h3>
        <form onSubmit={create}>
          <div className="form-grid">
            <div className="field"><label>Title *</label><input required maxLength={200} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="field"><label>Category</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">—</option>
                {data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field full"><label>Excerpt</label><input maxLength={500} value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} /></div>
            <div className="field full"><label>Body (basic HTML allowed — sanitized on save)</label>
              <textarea rows={6} value={form.body_html} onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))} /></div>
          </div>
          <button className="btn btn-primary btn-sm">Save draft</button>
        </form>
      </div>
      <div className="panel">
        <h3>Articles</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Author</th><th>Actions</th></tr></thead>
          <tbody>
            {data?.news.map(n => (
              <tr key={n.id}>
                <td><strong>{n.title}</strong><br /><span className="muted" style={{ fontSize: 12.5 }}>{n.excerpt}</span></td>
                <td>{n.category || '—'}</td>
                <td><span className={`status-pill st-${n.status}`}>{n.status}</span></td>
                <td className="muted">{n.author || '—'}</td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {n.status !== 'PUBLISHED' && <button className="btn btn-navy btn-sm" onClick={() => action(n.id, 'publish')}>Publish</button>}
                  {n.status === 'PUBLISHED' && <button className="btn btn-outline btn-sm" onClick={() => action(n.id, 'unpublish')}>Unpublish</button>}
                  <button className="btn btn-outline btn-sm" onClick={() => action(n.id, 'delete')}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

/* -------------------- Messages -------------------- */
function MessagesView({ toast }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => get('/admin/contact-messages').then(d => setRows(d.messages)).catch(e => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="panel">
      <h3>Contact messages</h3>
      {rows.map(m => (
        <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', opacity: m.is_read ? .65 : 1 }}>
          <strong>{m.name}</strong> <span className="muted" style={{ fontSize: 13 }}>{m.email || m.phone || ''} · {new Date(m.created_at).toLocaleString()}</span>
          {m.subject && <p style={{ fontWeight: 600, fontSize: 14 }}>{m.subject}</p>}
          <p style={{ fontSize: 14.5 }}>{m.message}</p>
          {!m.is_read && <button className="btn btn-outline btn-sm" onClick={async () => { await post(`/admin/contact-messages/${m.id}/read`, {}); load(); }}>Mark read</button>}
        </div>
      ))}
      {!rows.length && <p className="muted">No messages.</p>}
    </div>
  );
}


/* -------------------- Leadership CMS -------------------- */
function LeadershipView({ toast }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ full_name: '', position: 'Hospital Manager', manager_number: '', period: '', description: '', display_order: 100 });
  const load = useCallback(() => get('/leadership?all=1').then(d => setRows(d.leadership)).catch(e => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await post('/leadership', { ...form, display_order: Number(form.display_order) || 100 });
      toast('Leader added');
      setForm({ full_name: '', position: 'Hospital Manager', manager_number: '', period: '', description: '', display_order: 100 });
      load();
    } catch (err) { toast(err.message); }
  };
  const update = async (id, body, msg) => {
    try { await patch(`/leadership/${id}`, body); toast(msg); load(); } catch (e) { toast(e.message); }
  };
  const hide = async (l) => {
    if (!confirm(`Hide ${l.full_name} from the public carousel?`)) return;
    try {
      await api(`/leadership/${l.id}`, { method: 'DELETE' });
      toast('Leader hidden'); load();
    } catch (e) { toast(e.message); }
  };
  const uploadPhoto = async (l, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await api(`/leadership/${l.id}/photo`, { method: 'POST', body: fd });
      toast('Photo uploaded'); load();
    } catch (e) { toast(e.message); }
  };
  const editText = async (l) => {
    const description = prompt('Description / era note:', l.description || '');
    if (description === null) return;
    const period = prompt('Period label (e.g. Adare Primary Hospital era):', l.period || '');
    if (period === null) return;
    update(l.id, { description, period }, 'Leader updated');
  };

  return (
    <>
      <div className="panel">
        <h3>Add leader</h3>
        <form onSubmit={create} className="form-grid">
          <div className="field"><label>Full name *</label><input required maxLength={150} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
          <div className="field"><label>Position *</label><input required maxLength={150} value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} /></div>
          <div className="field"><label>Manager number (e.g. 7th)</label><input maxLength={20} value={form.manager_number} onChange={e => setForm(f => ({ ...f, manager_number: e.target.value }))} /></div>
          <div className="field"><label>Period / era</label><input maxLength={80} value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
          <div className="field"><label>Display order</label><input type="number" min="0" max="1000" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: e.target.value }))} /></div>
          <div className="field full"><label>Description</label><input maxLength={4000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="full"><button className="btn btn-primary btn-sm">Add leader</button></div>
        </form>
      </div>
      <div className="panel">
        <h3>Leadership timeline <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>drives the homepage carousel</span></h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Photo</th><th>#</th><th>Name</th><th>Period</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map(l => (
              <tr key={l.id} style={!l.active ? { opacity: .5 } : undefined}>
                <td>{l.photo_url
                  ? <img src={l.photo_url} alt="" width={44} height={55} style={{ objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ochre)' }} />
                  : <span className="muted">—</span>}</td>
                <td className="mono">{l.manager_number}</td>
                <td><strong>{l.full_name}</strong><br /><span className="muted" style={{ fontSize: 12.5 }}>{l.position}</span>
                  {l.is_current && <span className="tag red" style={{ marginInlineStart: 6 }}>Current</span>}</td>
                <td className="muted" style={{ fontSize: 13 }}>{l.period || '—'}</td>
                <td className="mono">{l.display_order}</td>
                <td><span className={`status-pill ${l.active ? 'st-CONFIRMED' : 'st-REJECTED'}`}>{l.active ? 'visible' : 'hidden'}</span></td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                    Photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden
                      onChange={e => uploadPhoto(l, e.target.files?.[0])} />
                  </label>
                  <button className="btn btn-outline btn-sm" onClick={() => editText(l)}>Edit</button>
                  {!l.is_current && <button className="btn btn-navy btn-sm" onClick={() => update(l.id, { is_current: true }, 'Marked current')}>Mark current</button>}
                  {l.active
                    ? <button className="btn btn-outline btn-sm" onClick={() => hide(l)}>Hide</button>
                    : <button className="btn btn-outline btn-sm" onClick={() => update(l.id, { active: true }, 'Leader shown')}>Show</button>}
                </div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted">No leaders yet.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

/* -------------------- Users -------------------- */
function UsersView({ toast }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ username: '', full_name: '', role: 'receptionist', password: '' });
  const load = useCallback(() => get('/admin/users').then(d => setRows(d.users)).catch(e => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  const create = async (e) => {
    e.preventDefault();
    try { await post('/admin/users', form); toast('User created'); setForm({ username: '', full_name: '', role: 'receptionist', password: '' }); load(); }
    catch (err) { toast(err.message); }
  };
  const act = async (u, action) => {
    if (action === 'disable' && !confirm(`Disable ${u.username}?`)) return;
    let body = { action };
    if (action === 'reset_password') {
      const pw = prompt('New temporary password (min 10 chars):');
      if (!pw) return;
      body.password = pw;
    }
    try { await patch(`/admin/users/${u.id}`, body); toast('User updated'); load(); }
    catch (e) { toast(e.message); }
  };
  const setPermission = async (user, permission) => {
    const body = {
      yellow_fever_manager: Boolean(user.can_manage_yellow_fever),
      nursing_daily_report: Boolean(user.can_submit_nursing_daily_report),
    };
    body[permission] = !body[permission];
    try {
      await patch(`/admin/users/${user.id}/permissions`, body);
      toast('Staff permissions updated');
      load();
    } catch (e) { toast(e.message); }
  };
  return (
    <>
      <div className="panel">
        <h3>Create staff user</h3>
        <form onSubmit={create} className="form-grid">
          <div className="field"><label>Username *</label><input required pattern="[a-z0-9._-]{3,60}" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div className="field"><label>Full name *</label><input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
          <div className="field"><label>Role *</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {['receptionist', 'doctor', 'nurse', 'pharmacy', 'laboratory', 'finance', 'content_manager', 'hr_admin', 'hospital_admin'].map(r => <option key={r}>{r}</option>)}
            </select></div>
          <div className="field"><label>Temp password * (min 10)</label><input required minLength={10} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="full"><button className="btn btn-primary btn-sm">Create user</button></div>
        </form>
      </div>
      <div className="panel">
        <h3>Staff accounts</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Last login</th><th>Status</th><th>Actions / assigned access</th></tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id}>
                <td className="mono">{u.username}</td><td>{u.full_name}</td><td>{u.role}</td>
                <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'never'}</td>
                <td><span className={`status-pill ${u.is_active ? 'st-CONFIRMED' : 'st-REJECTED'}`}>{u.is_active ? 'active' : 'disabled'}</span></td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => act(u, 'reset_password')}>Reset pw</button>
                  <button className="btn btn-outline btn-sm" onClick={() => act(u, u.is_active ? 'disable' : 'enable')}>{u.is_active ? 'Disable' : 'Enable'}</button>
                  <button className={`btn btn-sm ${u.can_manage_yellow_fever ? 'btn-navy' : 'btn-outline'}`}
                    aria-pressed={u.can_manage_yellow_fever}
                    onClick={() => setPermission(u, 'yellow_fever_manager')}>
                    {u.can_manage_yellow_fever ? 'Revoke Yellow Fever access' : 'Grant Yellow Fever access'}
                  </button>
                  <button className={`btn btn-sm ${u.can_submit_nursing_daily_report ? 'btn-navy' : 'btn-outline'}`}
                    aria-pressed={u.can_submit_nursing_daily_report}
                    onClick={() => setPermission(u, 'nursing_daily_report')}>
                    {u.can_submit_nursing_daily_report ? 'Revoke nursing report access' : 'Grant nursing report access'}
                  </button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

/* -------------------- Audit -------------------- */
function AuditView({ toast }) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ action: '', user: '' });
  useEffect(() => {
    const id = setTimeout(() => {
      const p = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
      get(`/admin/audit?${p}`).then(d => setRows(d.logs)).catch(e => toast(e.message));
    }, 250);
    return () => clearTimeout(id);
  }, [filters, toast]);
  return (
    <div className="panel">
      <h3>Audit log</h3>
      <div className="filter-row">
        <input placeholder="Action e.g. LOGIN" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} />
        <input placeholder="Actor" value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} />
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Detail</th><th>IP</th></tr></thead>
        <tbody>
          {rows.map(l => (
            <tr key={l.id}><td className="mono" style={{ fontSize: 12 }}>{new Date(l.created_at).toLocaleString()}</td>
              <td>{l.actor}</td><td className="muted">{l.role_code || '—'}</td><td className="mono" style={{ fontSize: 12 }}>{l.action}</td>
              <td className="mono" style={{ fontSize: 12 }}>{l.entity}{l.entity_id ? `#${l.entity_id}` : ''}</td>
              <td className="muted" style={{ fontSize: 13 }}>{l.detail || ''}</td><td className="mono" style={{ fontSize: 11 }}>{l.ip || ''}</td></tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="muted">No entries.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

/* -------------------- Procurement -------------------- */
function ProcurementView({ toast }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', price: '', deadline: '', document: null });
  const load = useCallback(() => get('/admin/procurement').then(d => setRows(d.tenders)).catch(e => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  const upload = async (event) => {
    event.preventDefault();
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => { if (value !== null && value !== '') body.append(key, value); });
    try {
      const response = await fetch('/api/admin/procurement', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Upload failed.');
      toast('Tender uploaded'); setForm({ title: '', description: '', price: '', deadline: '', document: null }); event.target.reset(); load();
    } catch (e) { toast(e.message); }
  };
  const release = async (row) => { try { await patch(`/admin/procurement/${row.id}/release`, {}); toast(`${row.reference} released`); load(); } catch (e) { toast(e.message); } };
  return <>
    <form className="panel" onSubmit={upload}>
      <h3>Upload tender / procurement document</h3>
      <p className="muted" style={{ marginBottom: 14 }}>Buyers must submit payment. Finance verifies it, then an administrator releases the file.</p>
      <div className="form-grid"><div className="field"><label htmlFor="td-title">Title</label><input id="td-title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div><div className="field"><label htmlFor="td-price">Price (ETB, optional)</label><input id="td-price" type="number" min="0.01" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div><div className="field"><label htmlFor="td-deadline">Deadline</label><input id="td-deadline" type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></div><div className="field"><label htmlFor="td-file">Tender file</label><input id="td-file" required type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={e => setForm({ ...form, document: e.target.files?.[0] || null })} /></div></div>
      <div className="field"><label htmlFor="td-description">Description</label><textarea id="td-description" rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
      <button className="btn btn-primary">Upload and publish</button>
    </form>
    <div className="panel"><h3>Tender documents</h3><div className="table-wrap"><table><thead><tr><th>Reference</th><th>Title</th><th>Price</th><th>Payments</th><th>Release</th><th>Action</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="mono">{row.reference}</td><td>{row.title}</td><td>{row.price ? `${row.price} ${row.currency}` : 'Not set'}</td><td>{row.payment_count} total · {row.pending_payments} pending</td><td>{row.released_at ? new Date(row.released_at).toLocaleString() : 'Locked'}</td><td>{row.released_at ? <span className="status-pill st-CONFIRMED">released</span> : <button className="btn btn-outline btn-sm" onClick={() => release(row)}>Release file</button>}</td></tr>)}{!rows.length && <tr><td colSpan="6" className="muted">No tender documents.</td></tr>}</tbody></table></div></div>
  </>;
}

function DoctorImagesView({ toast }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => get('/doctors').then(d => setRows(d.doctors || [])).catch(e => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  const upload = async (doctor, file) => {
    if (!file) return;
    const body = new FormData(); body.append('photo', file);
    try {
      const response = await fetch(`/api/admin/doctors/${doctor.id}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Upload failed.');
      toast(`Photo uploaded for ${doctor.full_name}`); load();
    } catch (e) { toast(e.message); }
  };
  return <div className="panel"><h3>Doctor images</h3><p className="muted" style={{ marginBottom: 14 }}>Upload the hospital-approved portrait for each doctor. JPEG, PNG and WebP up to 5 MB.</p><div className="table-wrap"><table><thead><tr><th>Doctor</th><th>Current image</th><th>Upload</th></tr></thead><tbody>{rows.map(doctor => <tr key={doctor.id}><td><strong>{doctor.full_name}</strong><br /><span className="muted">{doctor.title}</span></td><td>{doctor.photo_path ? <img src={doctor.photo_path} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: '50%' }} /> : <span className="muted">No photo</span>}</td><td><input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload photo for ${doctor.full_name}`} onChange={e => upload(doctor, e.target.files?.[0])} /></td></tr>)}</tbody></table></div></div>;
}

function VaccineStockView({ toast }) {
  const [stock, setStock] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transferForm, setTransferForm] = useState({ stock_receipt_id: '', unit_name: '', quantity: '', notes: '' });
  const [form, setForm] = useState({
    vaccine_name: '', batch_number: '', manufacturer: '', quantity: '',
    expiry_date: '', received_on: new Date().toISOString().slice(0, 10), notes: '',
  });
  const load = useCallback(async () => {
    try {
      const [data, transferData] = await Promise.all([
        get('/admin/vaccine-stock'),
        get('/admin/vaccine-stock/transfers'),
      ]);
      setStock(data.stock || []);
      setTransfers(transferData.transfers || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/admin/vaccine-stock', { ...form, quantity: Number(form.quantity) });
      setForm({
        vaccine_name: '', batch_number: '', manufacturer: '', quantity: '',
        expiry_date: '', received_on: new Date().toISOString().slice(0, 10), notes: '',
      });
      toast('Vaccine stock received');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const transferStock = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/admin/vaccine-stock/transfers', {
        ...transferForm,
        stock_receipt_id: Number(transferForm.stock_receipt_id),
        quantity: Number(transferForm.quantity),
      });
      setTransferForm({ stock_receipt_id: '', unit_name: '', quantity: '', notes: '' });
      toast('Vaccine stock issued to pharmacy unit');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const availableBatches = stock.filter(batch => Number(batch.central_on_hand) > 0
    && String(batch.expiry_date).slice(0, 10) >= new Date().toISOString().slice(0, 10));

  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}
      <form className="panel" onSubmit={submit}>
        <h3>Receive vaccine stock</h3>
        <p className="muted" style={{ marginBottom: 16 }}>Record vaccine deliveries by product and batch. Stock entries are included in the separate vaccine stock report.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="vaccine-name">Vaccine name *</label>
            <input id="vaccine-name" required maxLength={150} value={form.vaccine_name} onChange={e => setForm(f => ({ ...f, vaccine_name: e.target.value }))} /></div>
          <div className="field"><label htmlFor="vaccine-batch">Batch / lot number *</label>
            <input id="vaccine-batch" required maxLength={80} value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} /></div>
          <div className="field"><label htmlFor="vaccine-manufacturer">Manufacturer</label>
            <input id="vaccine-manufacturer" maxLength={150} value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
          <div className="field"><label htmlFor="vaccine-quantity">Quantity received *</label>
            <input id="vaccine-quantity" required type="number" min="1" max="1000000" step="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
          <div className="field"><label htmlFor="vaccine-expiry">Expiry date *</label>
            <input id="vaccine-expiry" required type="date" min={form.received_on} value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
          <div className="field"><label htmlFor="vaccine-received">Received date *</label>
            <input id="vaccine-received" required type="date" max={new Date().toISOString().slice(0, 10)} value={form.received_on} onChange={e => setForm(f => ({ ...f, received_on: e.target.value }))} /></div>
          <div className="field full"><label htmlFor="vaccine-notes">Notes</label>
            <textarea id="vaccine-notes" rows="2" maxLength={500} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add vaccine stock'}</button>
      </form>

      <form className="panel" onSubmit={transferStock} style={{ marginTop: 18 }}>
        <h3>Issue doses to pharmacy unit</h3>
        <p className="muted" style={{ marginBottom: 16 }}>Transfers reduce central store balance and add the doses to the selected unit.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="transfer-batch">Vaccine batch *</label>
            <select id="transfer-batch" required value={transferForm.stock_receipt_id}
              onChange={e => setTransferForm(f => ({ ...f, stock_receipt_id: e.target.value }))}>
              <option value="">Select available batch…</option>
              {availableBatches.map(batch => <option key={batch.id} value={batch.id}>
                {batch.vaccine_name} · {batch.batch_number} · {Number(batch.central_on_hand)} at central store
              </option>)}
            </select></div>
          <div className="field"><label htmlFor="transfer-unit">Pharmacy unit *</label>
            <input id="transfer-unit" required minLength={2} maxLength={150} value={transferForm.unit_name}
              onChange={e => setTransferForm(f => ({ ...f, unit_name: e.target.value }))} placeholder="e.g. OPD Vaccination Unit" /></div>
          <div className="field"><label htmlFor="transfer-quantity">Quantity issued *</label>
            <input id="transfer-quantity" required type="number" min="1" step="1" value={transferForm.quantity}
              onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} /></div>
          <div className="field"><label htmlFor="transfer-notes">Notes</label>
            <input id="transfer-notes" maxLength={500} value={transferForm.notes}
              onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <button className="btn btn-primary" disabled={busy || !availableBatches.length}>{busy ? 'Saving…' : 'Issue to unit'}</button>
      </form>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Central pharmacy store batches</h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table><thead><tr><th>Vaccine</th><th>Batch</th><th>Manufacturer</th><th>Received</th><th>Central on hand</th><th>Expires</th></tr></thead>
            <tbody>{stock.map(row => <tr key={row.id}><td>{row.vaccine_name}</td><td className="mono">{row.batch_number}</td><td>{row.manufacturer || '—'}</td><td>{Number(row.quantity).toLocaleString()}</td><td>{Number(row.central_on_hand).toLocaleString()}</td><td>{String(row.expiry_date).slice(0, 10)}</td></tr>)}
              {!stock.length && <tr><td colSpan="6" className="muted">{error ? 'Unable to load vaccine stock.' : 'No vaccine stock has been recorded yet.'}</td></tr>}</tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Pharmacy unit issue history</h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table><thead><tr><th>Date</th><th>Vaccine</th><th>Batch</th><th>Unit</th><th>Issued</th><th>Issued by</th></tr></thead>
            <tbody>{transfers.map(transfer => <tr key={transfer.id}><td>{new Date(transfer.created_at).toLocaleDateString()}</td><td>{transfer.vaccine_name}</td><td className="mono">{transfer.batch_number}</td><td>{transfer.unit_name}</td><td>{Number(transfer.quantity).toLocaleString()}</td><td>{transfer.issued_by_name || '—'}</td></tr>)}
              {!transfers.length && <tr><td colSpan="6" className="muted">No pharmacy-unit transfers recorded.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function VaccineStockReportView({ toast }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setReport(await get('/admin/reports/vaccine-stock'));
    } catch (e) {
      setError(e.message);
      toast(e.message);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const downloadCsv = () => {
    if (!report) return;
    const rows = [
      ['Vaccine stock report', `Generated ${new Date(report.generated_at).toLocaleString()}`],
      [],
      ['Stock summary'],
      ['Vaccine', 'Received', 'Central on hand', 'Issued to units', 'Administered', 'Wasted', 'Batches', 'Expired', 'Expiring in 90 days'],
      ...report.summary.map(row => [row.vaccine_name, row.total_received, row.central_on_hand, row.total_issued_to_units,
        row.doses_administered, row.doses_wasted, row.batch_count, row.expired_batches, row.expiring_batches]),
      [],
      ['Stock by unit'],
      ['Unit', 'Vaccine', 'Issued', 'On hand', 'Administered', 'Wasted'],
      ...report.by_unit.map(row => [row.unit_name, row.vaccine_name, row.issued, row.on_hand, row.doses_administered, row.doses_wasted]),
      [],
      ['Batch details'],
      ['Vaccine', 'Batch', 'Manufacturer', 'Received quantity', 'Central on hand', 'Issued to units', 'Administered', 'Wasted', 'Received', 'Expiry', 'Status'],
      ...report.batches.map(row => [row.vaccine_name, row.batch_number, row.manufacturer || '', row.total_received,
        row.central_on_hand, row.total_issued_to_units, row.doses_administered, row.doses_wasted,
        String(row.received_on).slice(0, 10), String(row.expiry_date).slice(0, 10), row.status]),
    ];
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? '');
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `adare-vaccine-stock-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="panel report-panel">
      <div className="report-toolbar no-print">
        <div><h3>Vaccine stock report</h3><p className="muted">Central store and pharmacy-unit balances, vaccine doses used or wasted, and batch expiry alerts.</p></div>
        <div className="report-actions">
          <button className="btn btn-outline btn-sm" disabled={!report} onClick={downloadCsv}>Download CSV</button>
          <button className="btn btn-outline btn-sm" disabled={!report} onClick={() => window.print()}>Print / Save PDF</button>
          <button className="btn btn-primary btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>
      {error && <div className="alert error no-print" role="alert">{error}</div>}
      {report && (
        <div className="report-print-area">
          <p className="muted">Report generated: {new Date(report.generated_at).toLocaleString()}</p>
          <h4 style={{ margin: '18px 0 8px' }}>Stock by vaccine</h4>
          <div className="table-wrap"><table><thead><tr><th>Vaccine</th><th>Received</th><th>Central on hand</th><th>Issued to units</th><th>Administered</th><th>Wasted</th><th>Batches</th><th>Expired</th><th>Expiring in 90 days</th></tr></thead>
            <tbody>{report.summary.map(row => <tr key={row.vaccine_name}><td>{row.vaccine_name}</td><td>{Number(row.total_received).toLocaleString()}</td><td>{Number(row.central_on_hand).toLocaleString()}</td><td>{Number(row.total_issued_to_units).toLocaleString()}</td><td>{Number(row.doses_administered).toLocaleString()}</td><td>{Number(row.doses_wasted).toLocaleString()}</td><td>{row.batch_count}</td><td>{row.expired_batches}</td><td>{row.expiring_batches}</td></tr>)}
              {!report.summary.length && <tr><td colSpan="9" className="muted">No vaccine stock has been recorded.</td></tr>}</tbody>
          </table></div>
          <h4 style={{ margin: '22px 0 8px' }}>Stock by pharmacy unit</h4>
          <div className="table-wrap"><table><thead><tr><th>Unit</th><th>Vaccine</th><th>Issued</th><th>On hand</th><th>Administered</th><th>Wasted</th></tr></thead>
            <tbody>{report.by_unit.map((row, index) => <tr key={`${row.unit_name}-${row.vaccine_name}-${index}`}><td>{row.unit_name}</td><td>{row.vaccine_name}</td><td>{Number(row.issued).toLocaleString()}</td><td>{Number(row.on_hand).toLocaleString()}</td><td>{Number(row.doses_administered).toLocaleString()}</td><td>{Number(row.doses_wasted).toLocaleString()}</td></tr>)}
              {!report.by_unit.length && <tr><td colSpan="6" className="muted">No vaccines have been issued to units.</td></tr>}</tbody>
          </table></div>
          <h4 style={{ margin: '22px 0 8px' }}>Batch details</h4>
          <div className="table-wrap"><table><thead><tr><th>Vaccine</th><th>Batch</th><th>Manufacturer</th><th>Received</th><th>Central on hand</th><th>Issued</th><th>Administered</th><th>Wasted</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>{report.batches.map(row => <tr key={row.stock_receipt_id}><td>{row.vaccine_name}</td><td className="mono">{row.batch_number}</td><td>{row.manufacturer || '—'}</td><td>{Number(row.total_received).toLocaleString()}</td><td>{Number(row.central_on_hand).toLocaleString()}</td><td>{Number(row.total_issued_to_units).toLocaleString()}</td><td>{Number(row.doses_administered).toLocaleString()}</td><td>{Number(row.doses_wasted).toLocaleString()}</td><td>{String(row.expiry_date).slice(0, 10)}</td><td><span className={`status-pill st-${row.status === 'IN_STOCK' ? 'CONFIRMED' : row.status === 'EXPIRING' ? 'PENDING' : 'REJECTED'}`}>{row.status.replace('_', ' ')}</span></td></tr>)}
              {!report.batches.length && <tr><td colSpan="10" className="muted">No vaccine batches to report.</td></tr>}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function NursingDailyReportView({ toast }) {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reports, setReports] = useState([]);
  const [stock, setStock] = useState([]);
  const [units, setUnits] = useState([]);
  const [dhis2Ready, setDhis2Ready] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    unit_name: '', vaccination_activity: '', adverse_events: '',
    doses_wasted: '0', waste_stock_receipt_id: '', notes: '',
  });
  const load = useCallback(async () => {
    setError('');
    try {
      const [daily, integration] = await Promise.all([
        get(`/admin/nursing/daily-reports?date=${encodeURIComponent(reportDate)}`),
        get('/admin/nursing/dhis2-status'),
      ]);
      setReports(daily.reports || []);
      setStock(daily.stock || []);
      setUnits(daily.units || []);
      setDhis2Ready(integration.configured);
      setForm(current => ({
        ...current,
        unit_name: daily.units?.some(unit => unit.unit_name === current.unit_name)
          ? current.unit_name
          : daily.units?.[0]?.unit_name || '',
      }));
    } catch (e) {
      setError(e.message);
    }
  }, [reportDate]);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/admin/nursing/daily-reports', {
        ...form,
        report_date: reportDate,
        vaccination_activity: form.vaccination_activity === 'yes',
        adverse_events: form.adverse_events === 'yes',
        doses_wasted: Number(form.doses_wasted),
        waste_stock_receipt_id: form.doses_wasted ? Number(form.waste_stock_receipt_id) || null : null,
      });
      toast('Nursing daily report submitted');
      setForm(current => ({ ...current, vaccination_activity: '', adverse_events: '', doses_wasted: '0', waste_stock_receipt_id: '', notes: '' }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const submitToDhis2 = async (report) => {
    setBusy(true);
    setError('');
    try {
      await post(`/admin/nursing/daily-reports/${report.id}/dhis2`, {});
      toast('Daily report submitted to DHIS2');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const existingUnitReport = reports.find(report => report.unit_name === form.unit_name);
  const wasteOptions = stock.filter(batch => batch.unit_name === form.unit_name);
  const setYesNo = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));

  return (
    <>
      <div className="panel">
        <div className="report-toolbar">
          <div><h3>Nursing daily Yellow Fever report</h3><p className="muted">Submit a Yes/No daily activity report. Vaccine wastage is deducted from the selected pharmacy-unit batch.</p></div>
          <label className="field" htmlFor="nursing-report-date">Report date
            <input id="nursing-report-date" type="date" max={new Date().toISOString().slice(0, 10)} value={reportDate} onChange={event => setReportDate(event.target.value)} />
          </label>
        </div>
        <p className={dhis2Ready ? 'alert success' : 'alert info'} role="status">
          {dhis2Ready
            ? 'DHIS2 connection is configured. You can submit saved reports after recording them here.'
            : 'Reports are saved locally. Live DHIS2 submission is disabled until administrators configure the authorized account and required dataset/data-element UIDs.'}
        </p>
        {error && <div className="alert error" role="alert">{error}</div>}
        {existingUnitReport && (
          <div className="alert info" role="status">A report for {existingUnitReport.unit_name} has already been submitted for {reportDate} by {existingUnitReport.submitted_by_name}. Select another unit to report.</div>
        )}
        <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label htmlFor="nursing-report-unit">Pharmacy / vaccination unit *</label>
                <select id="nursing-report-unit" required value={form.unit_name}
                  onChange={event => setForm(current => ({ ...current, unit_name: event.target.value, waste_stock_receipt_id: '' }))}>
                  <option value="">Select a unit…</option>
                  {units.map(unit => <option key={unit.unit_name} value={unit.unit_name}>{unit.unit_name}</option>)}
                </select>
              </div>
              <fieldset className="field report-yes-no"><legend>Yellow Fever vaccination activity today? *</legend>
                <label><input type="radio" name="vaccination-activity" value="yes" required checked={form.vaccination_activity === 'yes'} onChange={setYesNo('vaccination_activity')} /> Yes</label>
                <label><input type="radio" name="vaccination-activity" value="no" required checked={form.vaccination_activity === 'no'} onChange={setYesNo('vaccination_activity')} /> No</label>
              </fieldset>
              <fieldset className="field report-yes-no"><legend>Any adverse events reported? *</legend>
                <label><input type="radio" name="adverse-events" value="yes" required checked={form.adverse_events === 'yes'} onChange={setYesNo('adverse_events')} /> Yes</label>
                <label><input type="radio" name="adverse-events" value="no" required checked={form.adverse_events === 'no'} onChange={setYesNo('adverse_events')} /> No</label>
              </fieldset>
              <div className="field"><label htmlFor="nursing-wasted-doses">Doses wasted</label>
                <input id="nursing-wasted-doses" type="number" min="0" max="10000" step="1" value={form.doses_wasted}
                  onChange={event => setForm(current => ({ ...current, doses_wasted: event.target.value, waste_stock_receipt_id: event.target.value ? current.waste_stock_receipt_id : '' }))} /></div>
              {Number(form.doses_wasted) > 0 && (
                <div className="field"><label htmlFor="nursing-waste-batch">Wasted vaccine batch *</label>
                  <select id="nursing-waste-batch" required value={form.waste_stock_receipt_id}
                    onChange={event => setForm(current => ({ ...current, waste_stock_receipt_id: event.target.value }))}>
                    <option value="">Select unit batch…</option>
                    {wasteOptions.map(batch => <option key={batch.stock_receipt_id} value={batch.stock_receipt_id}>
                      {batch.vaccine_name} · {batch.batch_number} · {batch.available} doses
                    </option>)}
                  </select></div>
              )}
              <div className="field full"><label htmlFor="nursing-report-notes">Notes</label>
                <textarea id="nursing-report-notes" rows="3" maxLength={1000} value={form.notes}
                  onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></div>
            </div>
          <button className="btn btn-primary" disabled={busy || Boolean(existingUnitReport)}>{busy ? 'Saving…' : 'Submit daily report'}</button>
        </form>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Daily reports · {reportDate}</h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table><thead><tr><th>Unit</th><th>Vaccination activity</th><th>Adverse events</th><th>Doses administered</th><th>Doses wasted</th><th>Submitted by</th><th>DHIS2</th><th>Action</th></tr></thead>
            <tbody>{reports.map(report => <tr key={report.id}><td>{report.unit_name}</td><td>{report.vaccination_activity ? 'Yes' : 'No'}</td><td>{report.adverse_events ? 'Yes' : 'No'}</td><td>{Number(report.doses_administered).toLocaleString()}</td><td>{Number(report.doses_wasted).toLocaleString()}{report.batch_number ? ` · ${report.batch_number}` : ''}</td><td>{report.submitted_by_name}</td><td>{report.dhis2_status === 'SUBMITTED' ? 'Submitted' : 'Not submitted'}</td>
              <td><button className="btn btn-outline btn-sm" disabled={!dhis2Ready || busy || report.dhis2_status === 'SUBMITTED'} onClick={() => submitToDhis2(report)}>{report.dhis2_status === 'SUBMITTED' ? 'Sent' : 'Submit to DHIS2'}</button></td></tr>)}
              {!reports.length && <tr><td colSpan="8" className="muted">No nursing reports for this date yet.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* -------------------- Reports -------------------- */
function ReportsView({ toast }) {
  const [report, setReport] = useState(null);
  const [range, setRange] = useState(() => {
    const to = new Date().toISOString().slice(0, 10);
    return { from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), to };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (range.from && range.to && range.from > range.to) {
      setError('Start date must be on or before the end date.');
      return;
    }
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    setBusy(true);
    setError('');
    try {
      setReport(await get(`/admin/reports/appointments?${p}`));
    } catch (e) {
      setError(e.message);
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }, [range, toast]);
  useEffect(() => { load(); }, []);
  const downloadCsv = () => {
    if (!report) return;
    const rows = [
      ['Adare General Hospital — Appointment Report'],
      ['From', report.from, 'To', report.to],
      [],
      ['Appointments by day'],
      ['Date', 'Appointments'],
      ...report.by_day.map(row => [String(row.day).slice(0, 10), row.c]),
      [],
      ['Appointments by department'],
      ['Department', 'Appointments'],
      ...report.by_department.map(row => [row.department, row.c]),
      [],
      ['Appointments by status'],
      ['Status', 'Appointments'],
      ...report.by_status.map(row => [row.status, row.c]),
      [],
      ['Cancellations and no-shows', report.cancellations],
    ];
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? '');
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `adare-appointment-report-${report.from}-to-${report.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="panel report-panel">
      <div className="report-toolbar no-print">
        <div><h3>Appointment report</h3><p className="muted">Generate a report for the selected date range.</p></div>
        <div className="report-actions">
          <button className="btn btn-outline btn-sm" disabled={!report || busy} onClick={downloadCsv}>Download CSV</button>
          <button className="btn btn-outline btn-sm" disabled={!report || busy} onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>
      <div className="filter-row report-filters no-print">
        <label>From <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></label>
        <label>To <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></label>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={load}>{busy ? 'Generating…' : 'Generate report'}</button>
      </div>
      {error && <div className="alert error no-print" role="alert">{error}</div>}
      {report && (
        <section className="report-print-area" aria-label="Generated appointment report">
          <header className="report-print-header"><h2>Adare General Hospital</h2><p>Appointment activity report · {report.from} to {report.to}</p></header>
          <div className="report-summary">
            <div><strong>{report.by_day.reduce((sum, row) => sum + Number(row.c), 0)}</strong><span>Total requests</span></div>
            <div><strong>{report.cancellations}</strong><span>Cancellations / no-shows</span></div>
          </div>
          <div className="report-data-grid">
            <div><h4>By department</h4>
              <div className="table-wrap"><table><thead><tr><th>Department</th><th>Requests</th></tr></thead><tbody>
                {report.by_department.map(r => <tr key={r.department}><td>{r.department}</td><td><strong>{r.c}</strong></td></tr>)}
                {!report.by_department.length && <tr><td colSpan={2} className="muted">No appointments in this period.</td></tr>}
              </tbody></table></div></div>
            <div><h4>By status</h4>
              <div className="table-wrap"><table><thead><tr><th>Status</th><th>Appointments</th></tr></thead><tbody>
                {report.by_status.map(r => <tr key={r.status}><td><span className={`status-pill st-${r.status}`}>{r.status}</span></td><td><strong>{r.c}</strong></td></tr>)}
                {!report.by_status.length && <tr><td colSpan={2} className="muted">No appointments in this period.</td></tr>}
              </tbody></table></div></div>
          </div>
          <div className="report-daily"><h4>Daily appointment requests</h4>
            <div className="table-wrap"><table><thead><tr><th>Date</th><th>Requests</th></tr></thead><tbody>
              {report.by_day.map(r => <tr key={String(r.day)}><td>{String(r.day).slice(0, 10)}</td><td><strong>{r.c}</strong></td></tr>)}
              {!report.by_day.length && <tr><td colSpan={2} className="muted">No appointments in this period.</td></tr>}
            </tbody></table></div>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsView({ toast }) {
  const [heartbeat, setHeartbeat] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/settings').then(data => {
      setHeartbeat(data.settings?.site_heartbeat === 'true');
    }).catch(err => setError(err.message));
  }, []);

  const toggleHeartbeat = async () => {
    if (heartbeat === null || busy) return;
    const next = !heartbeat;
    setBusy(true);
    setError('');
    try {
      await patch('/admin/settings', { key: 'site_heartbeat', value: String(next) });
      setHeartbeat(next);
      window.dispatchEvent(new CustomEvent('site-heartbeat-change', { detail: { enabled: next } }));
      toast(`Website heartbeat ${next ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Website appearance</h3>
      <p className="muted" style={{ marginBottom: 16 }}>
        Control the animated heartbeat effect shown across the public hospital website.
      </p>
      {error && <div className="alert error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="site-setting-row">
        <div>
          <strong>Heartbeat animation</strong>
          <p className="muted" style={{ fontSize: 13 }}>
            {heartbeat === null ? 'Loading setting…' : heartbeat ? 'Currently visible to website visitors.' : 'Currently hidden from website visitors.'}
          </p>
        </div>
        <button type="button" className={`site-setting-toggle ${heartbeat ? 'on' : ''}`}
          role="switch" aria-checked={heartbeat === true} aria-label="Heartbeat animation"
          disabled={heartbeat === null || busy} onClick={toggleHeartbeat}>
          <span />
          {busy ? 'Saving…' : heartbeat ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  );
}

/* -------------------- Shell -------------------- */
export default function Staff() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [view, setView] = useState('dashboard');
  const [sideOpen, setSideOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [staffPermissions, setStaffPermissions] = useState({
    can_manage_yellow_fever: false,
    can_submit_nursing_daily_report: false,
  });
  const [notif, setNotif] = useState({ list: [], unread: 0, open: false });
  const idRef = useRef(0);

  const toast = useCallback((text) => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  useEffect(() => {
    document.title = 'HMS Staff — Adare General Hospital';
    tryRefresh().then(() => {
      setSignedIn(!!auth.user && auth.user.role !== 'patient');
      setReady(true);
    });
  }, []);

  const loadNotif = useCallback(() => {
    get('/admin/notifications').then(d => setNotif(n => ({ ...n, list: d.notifications, unread: d.unread_count }))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    loadNotif();
    const stop = connectEvents((ev, data) => {
      if (ev === 'notification') { toast(`${data.title}: ${data.body}`); loadNotif(); }
    });
    const poll = setInterval(loadNotif, 30000); // fallback alongside SSE
    return () => { stop && stop(); clearInterval(poll); };
  }, [signedIn, loadNotif, toast]);
  useEffect(() => {
    if (!signedIn) {
      setStaffPermissions({ can_manage_yellow_fever: false, can_submit_nursing_daily_report: false });
      return;
    }
    get('/admin/my-permissions')
      .then(setStaffPermissions)
      .catch(error => toast(`Could not load staff permissions: ${error.message}`));
  }, [signedIn, toast]);

  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }} className="muted">Loading…</div>;
  if (!signedIn) return <Login onDone={() => setSignedIn(true)} />;

  const role = auth.user.role;
  const items = NAV.filter(([key, , roles]) => {
    if (key === 'yellow-fever-appointments') return staffPermissions.can_manage_yellow_fever;
    if (key === 'nursing-daily-report') return staffPermissions.can_submit_nursing_daily_report;
    return canSee(role, roles);
  });
  const canVaccinate = ['nurse', 'super_admin', 'hospital_admin'].includes(role)
    || staffPermissions.can_submit_nursing_daily_report;
  const signOut = async () => { try { await post('/auth/logout', {}); } catch {} auth.clear(); setSignedIn(false); };

  const views = {
    dashboard: <DashboardView go={setView} toast={toast} />,
    appointments: <AppointmentsView toast={toast} canVaccinate={canVaccinate} />,
    'yellow-fever-appointments': <AppointmentsView toast={toast} yellowOnly canVaccinate={canVaccinate} />,
    'nursing-daily-report': <NursingDailyReportView toast={toast} />,
    patients: <PatientsView toast={toast} />, payments: <PaymentsView toast={toast} />,
    'vaccine-stock': <VaccineStockView toast={toast} />,
    'vaccine-stock-report': <VaccineStockReportView toast={toast} />,
    news: <NewsView toast={toast} />, messages: <MessagesView toast={toast} />,
    leadership: <LeadershipView toast={toast} />,
    procurement: <ProcurementView toast={toast} />,
    credentials: <HRCredentialsView />,
    doctors: <DoctorImagesView toast={toast} />,
    users: <UsersView toast={toast} />, settings: <SettingsView toast={toast} />,
    audit: <AuditView toast={toast} />, reports: <ReportsView toast={toast} />,
  };
  const activeView = items.some(([key]) => key === view) ? view : items[0]?.[0] || 'dashboard';

  return (
    <div className="dash">
      <aside className={`dash-side ${sideOpen ? 'open' : ''}`}>
        <div className="who">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <img src="/logo-192.png" alt="" width="34" height="34" style={{ borderRadius: '50%', background: '#fff', border: '2px solid var(--ochre)' }} />
            <p className="mono" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ochre)' }}>Adare General Hospital</p>
          </div>
          <p className="n">{auth.user.name}</p>
          <p className="r">{role}</p>
        </div>
        <nav className="dash-nav" aria-label="Staff navigation">
          {items.map(([v, label]) => (
            <button key={v} className={activeView === v ? 'active' : ''} onClick={() => { setView(v); setSideOpen(false); }}>{label}</button>
          ))}
          <button onClick={signOut} style={{ marginTop: 12, color: '#FFB3B6' }}>⎋ Sign out</button>
          <a href="/" style={{ display: 'block', padding: '12px 18px', fontSize: 13.5, color: '#8FA5B8' }}>← Public website</a>
        </nav>
      </aside>
      <div className="dash-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" style={{ display: 'inline-flex' }} onClick={() => setSideOpen(o => !o)} aria-label="Toggle menu">☰</button>
          <h2 style={{ color: 'var(--navy)', fontSize: 20, marginRight: 'auto', textTransform: 'capitalize' }}>{activeView}</h2>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-outline btn-sm" aria-label={`Notifications, ${notif.unread} unread`}
              onClick={() => setNotif(n => ({ ...n, open: !n.open }))}>
              🔔 {notif.unread > 0 && <span className="tag red">{notif.unread}</span>}
            </button>
            {notif.open && (
              <div style={{ position: 'absolute', insetInlineEnd: 0, top: '110%', width: 340, maxHeight: 400, overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 100 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                  <strong>Notifications</strong>
                  <button className="btn btn-ghost btn-sm" onClick={async () => { await post('/admin/notifications/read', { all: true }); loadNotif(); }}>Mark all read</button>
                </div>
                {notif.list.map(n => (
                  <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: n.is_read ? 'transparent' : 'color-mix(in srgb, var(--ochre) 8%, transparent)' }}>
                    <strong style={{ fontSize: 14 }}>{n.title}</strong>
                    <p className="muted" style={{ fontSize: 13 }}>{n.body}</p>
                    <p className="meta">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {!notif.list.length && <p className="muted" style={{ padding: 14 }}>No notifications.</p>}
              </div>
            )}
          </div>
        </div>
        {views[activeView]}
      </div>
      <Toasts items={toasts} />
    </div>
  );
}
