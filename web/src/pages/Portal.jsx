// Patient portal (spec §11): register/login, dashboard, appointments,
// payments, notifications, profile — all from PostgreSQL via the API.
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { get, post, patch, auth } from '../lib/api.js';

function AuthView({ onDone }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', full_name: '', phone: '', email: '', date_of_birth: '' });
  const [state, setState] = useState({ busy: false, error: '' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const d = mode === 'login'
        ? await post('/auth/login', { username: form.username, password: form.password })
        : await post('/auth/register', {
            full_name: form.full_name, phone: form.phone, email: form.email,
            password: form.password, date_of_birth: form.date_of_birth || undefined,
          });
      auth.set(d);
      if (d.user.role !== 'patient') {
        window.location.href = '/staff';
        return;
      }
      onDone();
    } catch (err) {
      setState({ busy: false, error: err.message });
      return;
    }
    setState({ busy: false, error: '' });
  };
  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="filter-row" role="tablist" aria-label="Portal access">
        <button role="tab" aria-selected={mode === 'login'} className={`btn ${mode === 'login' ? 'btn-navy' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setMode('login')}>Sign in</button>
        <button role="tab" aria-selected={mode === 'register'} className={`btn ${mode === 'register' ? 'btn-navy' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setMode('register')}>Create account</button>
      </div>
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      <form onSubmit={submit} className="panel">
        {mode === 'login' ? (
          <>
            <div className="field"><label htmlFor="p-user">Phone number or Email address</label>
              <input id="p-user" required value={form.username} onChange={set('username')} autoComplete="username" placeholder="09… / +2519… / you@email.com" /></div>
            <div className="field"><label htmlFor="p-pass">Password</label>
              <input id="p-pass" required type="password" value={form.password} onChange={set('password')} autoComplete="current-password" /></div>
          </>
        ) : (
          <>
            <div className="field"><label htmlFor="r-name">Full name *</label>
              <input id="r-name" required maxLength={150} value={form.full_name} onChange={set('full_name')} autoComplete="name" /></div>
            <div className="form-grid">
              <div className="field"><label htmlFor="r-phone">Phone *</label>
                <input id="r-phone" required type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></div>
              <div className="field"><label htmlFor="r-dob">Date of birth</label>
                <input id="r-dob" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></div>
            </div>
            <div className="field"><label htmlFor="r-email">Email</label>
              <input id="r-email" type="email" value={form.email} onChange={set('email')} /></div>
            <div className="field"><label htmlFor="r-pass">Password * (min 8 characters)</label>
              <input id="r-pass" required minLength={8} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></div>
          </>
        )}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={state.busy}>
          {state.busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create patient account'}
        </button>
      </form>
      <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
        Your account is stored securely on hospital servers. Staff sign in <a href="/staff" style={{ color: 'var(--red)', fontWeight: 700 }}>here</a>.
      </p>
    </div>
  );
}

function Dashboard({ onSignOut }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('appointments');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    get('/patients/me').then(setData).catch(() => onSignOut());
  }, [onSignOut]);
  useEffect(() => { load(); }, [load]);

  const markAll = async () => { await post('/patients/me/notifications/read', { all: true }); load(); };
  const saveProfile = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await patch('/patients/me', {
        full_name: f.get('full_name'), email: f.get('email') || '',
        address: f.get('address') || '', emergency_contact: f.get('emergency_contact') || '',
      });
      setMsg('Profile updated.'); load();
    } catch (err) { setMsg(err.message); }
  };

  if (!data) return <div className="skeleton" style={{ height: 300 }} />;
  const { patient, appointments, payments, notifications } = data;
  const upcoming = appointments.filter(a => ['PENDING', 'CONFIRMED', 'RESCHEDULED'].includes(a.status));
  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div>
          <h2 style={{ color: 'var(--navy)' }}>Welcome, {patient.full_name}</h2>
          <p className="muted mono" style={{ fontSize: 13 }}>{patient.patient_number}</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onSignOut}>Sign out</button>
      </div>
      <div className="kpi-row">
        <div className="kpi"><div className="v">{upcoming.length}</div><div className="l">Upcoming appointments</div></div>
        <div className="kpi ochre"><div className="v">{unread}</div><div className="l">Unread notifications</div></div>
        <div className="kpi green"><div className="v">{payments.filter(p => p.status === 'SUCCESSFUL').length}</div><div className="l">Verified payments</div></div>
        <div className="kpi red"><div className="v">{payments.filter(p => p.status === 'PENDING').length}</div><div className="l">Payments awaiting verification</div></div>
      </div>
      <div className="filter-row" role="tablist" aria-label="Portal sections">
        {[['appointments', `Appointments (${appointments.length})`], ['payments', `Payments (${payments.length})`],
          ['notifications', `Notifications (${unread})`], ['profile', 'My profile']].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v}
            className={`btn btn-sm ${tab === v ? 'btn-navy' : 'btn-outline'}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {tab === 'appointments' && (
        <div className="panel">
          <h3>My appointments <Link className="btn btn-primary btn-sm" to="/appointments">Book new</Link></h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Reference</th><th>Department</th><th>Date</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              {appointments.map(a => (
                <tr key={a.reference}>
                  <td className="mono">{a.reference}</td>
                  <td>{a.department || '—'}{a.doctor ? ` · ${a.doctor}` : ''}</td>
                  <td>{String(a.scheduled_date || a.preferred_date).slice(0, 10)} {a.scheduled_time || a.preferred_time || ''}</td>
                  <td><span className={`status-pill st-${a.status}`}>{a.status}</span></td>
                  <td className="muted">{a.status_note || ''}</td>
                </tr>
              ))}
              {!appointments.length && <tr><td colSpan={5} className="muted">No appointments yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="panel">
          <h3>Payment history</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Reference</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.reference}>
                  <td className="mono">{p.reference}</td>
                  <td><strong>{Number(p.amount).toFixed(2)} {p.currency}</strong></td>
                  <td>{p.method}</td>
                  <td><span className={`status-pill st-${p.status}`}>{p.status}</span></td>
                  <td className="muted">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!payments.length && <tr><td colSpan={5} className="muted">No payments submitted yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="panel">
          <h3>Notifications <button className="btn btn-outline btn-sm" onClick={markAll}>Mark all read</button></h3>
          {notifications.map(n => (
            <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', opacity: n.is_read ? .6 : 1 }}>
              <strong>{n.title}</strong>
              <p className="muted" style={{ fontSize: 14 }}>{n.body}</p>
              <p className="meta">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          ))}
          {!notifications.length && <p className="muted">No notifications.</p>}
        </div>
      )}

      {tab === 'profile' && (
        <form className="panel" onSubmit={saveProfile}>
          <h3>My profile</h3>
          {msg && <div className="alert info">{msg}</div>}
          <div className="form-grid">
            <div className="field"><label htmlFor="pr-name">Full name</label>
              <input id="pr-name" name="full_name" defaultValue={patient.full_name} maxLength={150} /></div>
            <div className="field"><label htmlFor="pr-email">Email</label>
              <input id="pr-email" name="email" type="email" defaultValue={patient.email || ''} /></div>
            <div className="field"><label htmlFor="pr-addr">Address</label>
              <input id="pr-addr" name="address" defaultValue={patient.address || ''} maxLength={255} /></div>
            <div className="field"><label htmlFor="pr-em">Emergency contact</label>
              <input id="pr-em" name="emergency_contact" defaultValue={patient.emergency_contact || ''} maxLength={150} /></div>
          </div>
          <button className="btn btn-primary">Save profile</button>
        </form>
      )}
    </>
  );
}

export default function Portal() {
  const [signedIn, setSignedIn] = useState(auth.user?.role === 'patient');
  useEffect(() => { document.title = 'Patient Portal — Adare General Hospital'; }, []);
  const signOut = async () => {
    try { await post('/auth/logout', {}); } catch {}
    auth.clear();
    setSignedIn(false);
  };
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Patient Portal</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Adare digital hospital</span><h2>Patient Portal</h2></div>
      </div>
      {signedIn ? <Dashboard onSignOut={signOut} /> : <AuthView onDone={() => setSignedIn(true)} />}
    </div>
  );
}
