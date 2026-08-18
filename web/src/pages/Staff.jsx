// Staff application: receptionist queue (real-time SSE), patients, payments,
// news CMS, users, audit, reports — role-aware navigation, server-enforced RBAC.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, get, post, patch, auth, connectEvents, tryRefresh } from '../lib/api.js';

const NAV = [
  ['dashboard', '▦ Dashboard', null],
  ['appointments', '🗓 Appointments', ['receptionist', 'doctor', 'nurse']],
  ['patients', '👥 Patients', ['receptionist', 'doctor', 'nurse']],
  ['payments', '₵ Payments', ['finance', 'receptionist']],
  ['news', '📰 News CMS', ['content_manager']],
  ['messages', '✉ Messages', ['content_manager']],
  ['leadership', '🏛 Leadership', ['content_manager']],
  ['users', '♟ Staff users', []],
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
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const d = await post('/auth/login', f);
      auth.set(d);
      if (d.user.role === 'patient') { window.location.href = '/portal'; return; }
      onDone();
    } catch (err) { setState({ busy: false, error: err.message }); }
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--navy-deep), var(--navy))', padding: 18 }}>
      <form onSubmit={submit} style={{ background: 'var(--surface)', borderRadius: 12, padding: '34px 30px', width: '100%', maxWidth: 400, borderTop: '5px solid var(--red)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <img src="/logo-192.png" alt="" width="40" height="40" style={{ borderRadius: '50%', background: '#fff', border: '2px solid var(--ochre)' }} />
          <p className="mono" style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--red)', fontWeight: 700 }}>Adare General Hospital · Restricted</p>
        </div>
        <h1 style={{ fontSize: 21, color: 'var(--navy)', margin: '6px 0 4px' }}>HMS Staff Sign-in</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>Every action is recorded in the audit log.</p>
        {state.error && <div className="alert error" role="alert">{state.error}</div>}
        <div className="field"><label htmlFor="s-user">Username</label>
          <input id="s-user" required autoComplete="username" value={f.username} onChange={e => setF(v => ({ ...v, username: e.target.value }))} /></div>
        <div className="field"><label htmlFor="s-pass">Password</label>
          <input id="s-pass" required type="password" autoComplete="current-password" value={f.password} onChange={e => setF(v => ({ ...v, password: e.target.value }))} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={state.busy}>{state.busy ? 'Signing in…' : 'Sign in securely'}</button>
        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}><a href="/" style={{ textDecoration: 'underline' }}>← Public website</a></p>
      </form>
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

function DashboardView({ go }) {
  const [d, setD] = useState(null);
  const [systems, setSystems] = useState([]);
  useEffect(() => {
    get('/admin/dashboard').then(setD).catch(() => {});
    get('/admin/internal-systems').then(x => setSystems(x.systems || [])).catch(() => {});
  }, []);
  if (!d) return <div className="skeleton" style={{ height: 300 }} />;
  const k = d.kpi;
  const role = auth.user?.role;
  const isAdmin = ['super_admin', 'hospital_admin'].includes(role);
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
      {systems.length > 0 && (
        <div className="panel" style={{ borderTop: '4px solid var(--ochre)' }}>
          <h3>Internal Systems <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>hospital network (LAN) only</span></h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {systems.map(s => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                className="btn btn-outline btn-sm" title={`${s.note} — ${s.url}`}>
                🔗 {s.name}
              </a>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            These systems run on the hospital's private network (192.168.x.x) and only open from computers
            connected to the hospital LAN/Wi-Fi. Addresses are editable by administrators under Settings.
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
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

function AppointmentsView({ toast }) {
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ status: '', date: '', q: '' });
  const [confirmBox, setConfirmBox] = useState(null); // {reference, action}
  const load = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    get(`/appointments?${p}`).then(d => setRows(d.appointments)).catch(e => toast(e.message));
  }, [filters, toast]);
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
          <thead><tr><th>Reference</th><th>Patient</th><th>Department / Doctor</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6}><div className="skeleton" style={{ height: 60 }} /></td></tr>}
            {rows?.map(a => (
              <tr key={a.reference} style={a.is_emergency ? { background: 'rgba(200,37,44,.05)' } : undefined}>
                <td className="mono">{a.reference}{a.is_emergency && <><br /><span className="tag red">URGENT</span></>}</td>
                <td><strong>{a.patient_name}</strong><br /><span className="muted mono" style={{ fontSize: 12 }}>{a.phone}</span></td>
                <td>{a.department || '—'}{a.doctor && <><br /><span className="muted" style={{ fontSize: 13 }}>{a.doctor}</span></>}</td>
                <td>{String(a.scheduled_date || a.preferred_date).slice(0, 10)}<br /><span className="muted" style={{ fontSize: 12 }}>{a.scheduled_time || a.preferred_time || ''}</span></td>
                <td><span className={`status-pill st-${a.status}`}>{a.status}</span>{a.status_note && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.status_note}</p>}</td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(ACTIONS[a.status] || []).map(([act, label, cls]) => (
                    <button key={act} className={`btn btn-sm ${cls}`} onClick={() => run(a.reference, act)}>{label}</button>
                  ))}
                </div></td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={6} className="muted">No appointments match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
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
  return (
    <>
      <div className="panel">
        <h3>Create staff user</h3>
        <form onSubmit={create} className="form-grid">
          <div className="field"><label>Username *</label><input required pattern="[a-z0-9._-]{3,60}" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div className="field"><label>Full name *</label><input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
          <div className="field"><label>Role *</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {['receptionist', 'doctor', 'nurse', 'pharmacy', 'laboratory', 'finance', 'content_manager', 'hospital_admin'].map(r => <option key={r}>{r}</option>)}
            </select></div>
          <div className="field"><label>Temp password * (min 10)</label><input required minLength={10} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="full"><button className="btn btn-primary btn-sm">Create user</button></div>
        </form>
      </div>
      <div className="panel">
        <h3>Staff accounts</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id}>
                <td className="mono">{u.username}</td><td>{u.full_name}</td><td>{u.role}</td>
                <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'never'}</td>
                <td><span className={`status-pill ${u.is_active ? 'st-CONFIRMED' : 'st-REJECTED'}`}>{u.is_active ? 'active' : 'disabled'}</span></td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => act(u, 'reset_password')}>Reset pw</button>
                  <button className="btn btn-outline btn-sm" onClick={() => act(u, u.is_active ? 'disable' : 'enable')}>{u.is_active ? 'Disable' : 'Enable'}</button>
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

/* -------------------- Reports -------------------- */
function ReportsView({ toast }) {
  const [report, setReport] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    get(`/admin/reports/appointments?${p}`).then(setReport).catch(e => toast(e.message));
  }, [range, toast]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="panel">
      <h3>Appointment report <button className="btn btn-outline btn-sm" onClick={() => window.print()}>Print / PDF</button></h3>
      <div className="filter-row">
        <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} aria-label="From" />
        <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} aria-label="To" />
      </div>
      {report && (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>Period {report.from} → {report.to} · cancellations/no-shows: <strong>{report.cancellations}</strong></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            <div><h4 style={{ marginBottom: 8 }}>By department</h4>
              <div className="table-wrap"><table><tbody>
                {report.by_department.map(r => <tr key={r.department}><td>{r.department}</td><td><strong>{r.c}</strong></td></tr>)}
              </tbody></table></div></div>
            <div><h4 style={{ marginBottom: 8 }}>By status</h4>
              <div className="table-wrap"><table><tbody>
                {report.by_status.map(r => <tr key={r.status}><td><span className={`status-pill st-${r.status}`}>{r.status}</span></td><td><strong>{r.c}</strong></td></tr>)}
              </tbody></table></div></div>
          </div>
        </>
      )}
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

  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }} className="muted">Loading…</div>;
  if (!signedIn) return <Login onDone={() => setSignedIn(true)} />;

  const role = auth.user.role;
  const items = NAV.filter(([, , roles]) => canSee(role, roles));
  const signOut = async () => { try { await post('/auth/logout', {}); } catch {} auth.clear(); setSignedIn(false); };

  const views = {
    dashboard: <DashboardView go={setView} />, appointments: <AppointmentsView toast={toast} />,
    patients: <PatientsView toast={toast} />, payments: <PaymentsView toast={toast} />,
    news: <NewsView toast={toast} />, messages: <MessagesView toast={toast} />,
    leadership: <LeadershipView toast={toast} />,
    users: <UsersView toast={toast} />, audit: <AuditView toast={toast} />, reports: <ReportsView toast={toast} />,
  };

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
            <button key={v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setSideOpen(false); }}>{label}</button>
          ))}
          <button onClick={signOut} style={{ marginTop: 12, color: '#FFB3B6' }}>⎋ Sign out</button>
          <a href="/" style={{ display: 'block', padding: '12px 18px', fontSize: 13.5, color: '#8FA5B8' }}>← Public website</a>
        </nav>
      </aside>
      <div className="dash-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" style={{ display: 'inline-flex' }} onClick={() => setSideOpen(o => !o)} aria-label="Toggle menu">☰</button>
          <h2 style={{ color: 'var(--navy)', fontSize: 20, marginRight: 'auto', textTransform: 'capitalize' }}>{view}</h2>
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
        {views[view]}
      </div>
      <Toasts items={toasts} />
    </div>
  );
}
