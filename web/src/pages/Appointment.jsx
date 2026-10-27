// Real appointment booking (spec §9): validate → API → PostgreSQL →
// reference number → PENDING → receptionist dashboard. No fake success.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { ETHIOPIAN_MONTHS, formatEthiopianDate, getEthiopianDate, getEthiopianMonthDays } from '../lib/ethiopianCalendar.js';

const init = {
  patient_name: '', phone: '', email: '', gender: '', date_of_birth: '',
  department_id: '', doctor_id: '', service_id: '', preferred_date: '',
  preferred_time: '', reason: '', is_emergency: false, insurance_type: 'none', notes: '',
};

export default function Appointment() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ ...init, doctor_id: params.get('doctor') || '', service_id: params.get('service') || '' });
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [services, setServices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [ethiopianDate, setEthiopianDate] = useState({ year: '', month: '', day: '' });
  const [status, setStatus] = useState({ reference: '', phone: '', result: null, error: '' });

  useEffect(() => {
    document.title = 'Book an Appointment — Adare General Hospital';
    get('/departments').then(d => setDepartments(d.departments || []));
    get('/doctors').then(d => setDoctors(d.doctors || []));
    get('/services').then(d => setServices((d.services || []).filter(s => s.bookable)));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const body = {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        doctor_id: form.doctor_id ? Number(form.doctor_id) : null,
        service_id: form.service_id ? Number(form.service_id) : null,
        gender: form.gender || undefined,
        insurance_type: form.insurance_type || undefined,
      };
      const d = await post('/appointments', body);
      setResult({ ...d.appointment, email: body.email, email_sent: d.email_sent });
      setForm(init);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const checkStatus = async (e) => {
    e.preventDefault();
    setStatus(s => ({ ...s, error: '', result: null }));
    try {
      const d = await get(`/appointments/status?reference=${encodeURIComponent(status.reference)}&phone=${encodeURIComponent(status.phone)}`);
      setStatus(s => ({ ...s, result: d.appointment }));
    } catch (err) {
      setStatus(s => ({ ...s, error: err.message }));
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const currentEthiopianYear = getEthiopianDate(today).year;
  const availableYears = Array.from({ length: 3 }, (_, index) => currentEthiopianYear + index);
  const ethiopianMonthDays = useMemo(() => (
    ethiopianDate.year && ethiopianDate.month
      ? getEthiopianMonthDays(Number(ethiopianDate.year), Number(ethiopianDate.month), today)
      : []
  ), [ethiopianDate.year, ethiopianDate.month, today]);

  const updateEthiopianDate = (field) => (event) => {
    const next = { ...ethiopianDate, [field]: event.target.value };
    if (field !== 'day') next.day = '';
    setEthiopianDate(next);
    const selectedDay = ethiopianMonthDays.find(({ day }) => String(day) === next.day);
    setForm(current => ({ ...current, preferred_date: selectedDay?.gregorianDate || '' }));
  };

  return (
    <div className="wrap appointment-page" style={{ padding: '34px 20px 60px', maxWidth: 1080 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Appointments</nav>
      <header className="appointment-intro">
        <div className="appointment-intro-copy">
          <span className="appointment-eyebrow">YOUR VISIT STARTS HERE</span>
          <h1>Book an appointment</h1>
          <p>Request a visit with the Adare care team. Choose a department, tell us when works for you, and we’ll be in touch.</p>
        </div>
        <div className="appointment-promise">
          <span className="appointment-promise-icon" aria-hidden="true">✦</span>
          <div><strong>Personal care, made simple</strong><span>Our reception team reviews every request and helps you plan your visit.</span></div>
        </div>
        <div className="appointment-steps" aria-label="How appointment requests work">
          <span><b>01</b> Send your request</span><i aria-hidden="true" />
          <span><b>02</b> Reception reviews</span><i aria-hidden="true" />
          <span><b>03</b> Track your status</span>
        </div>
      </header>

      <div className="appointment-section-heading">
        <span className="appointment-section-icon" aria-hidden="true">01</span>
        <div><span>LET’S GET YOU STARTED</span><h2>Appointment request</h2></div>
      </div>

      {result && (
        <div className="alert success" role="status">
          <strong>✓ Appointment request submitted.</strong><br />
          Your reference number is <strong className="mono">{result.reference}</strong>. Reception reviews every
          request — check your status below any time using this reference and your phone number, or track it in the
          <Link to="/portal" style={{ fontWeight: 700 }}> patient portal</Link>.
          <br />Preferred date: <strong>{formatEthiopianDate(String(result.preferred_date).slice(0, 10))}</strong>
          {' '}({String(result.preferred_date).slice(0, 10)} Gregorian).
          <br />
          {result.email_sent
            ? `A confirmation email was sent to ${result.email}.`
            : 'The request was saved, but the confirmation email could not be sent. Please keep your reference number and contact reception.'}
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}

      <form onSubmit={submit} className="panel appointment-form" aria-label="Appointment form">
        <div className="form-grid">
          <div className="appointment-form-section full"><span className="appointment-section-number">01</span><h3>Your details</h3><span>So our team knows how to reach you</span></div>
          <div className="field"><label htmlFor="ap-name">Full name *</label>
            <input id="ap-name" required maxLength={150} value={form.patient_name} onChange={set('patient_name')} autoComplete="name" /></div>
          <div className="field"><label htmlFor="ap-phone">Phone number *</label>
            <input id="ap-phone" required type="tel" placeholder="09… or +2519…" value={form.phone} onChange={set('phone')} autoComplete="tel" /></div>
          <div className="field"><label htmlFor="ap-email">Email (for your confirmation) *</label>
            <input id="ap-email" required type="email" maxLength={150} value={form.email} onChange={set('email')} autoComplete="email" /></div>
          <div className="field"><label htmlFor="ap-gender">Gender</label>
            <select id="ap-gender" value={form.gender} onChange={set('gender')}>
              <option value="">Prefer not to say</option><option value="female">Female</option>
              <option value="male">Male</option><option value="other">Other</option>
            </select></div>
          <div className="field"><label htmlFor="ap-dob">Date of birth</label>
            <input id="ap-dob" type="date" max={today} value={form.date_of_birth} onChange={set('date_of_birth')} /></div>
          <div className="field"><label htmlFor="ap-ins">Insurance</label>
            <select id="ap-ins" value={form.insurance_type} onChange={set('insurance_type')}>
              <option value="none">None / self-pay</option><option value="cbhi">CBHI</option>
              <option value="private">Private insurance</option><option value="other">Other</option>
            </select></div>
          <div className="appointment-form-section full"><span className="appointment-section-number">02</span><h3>Choose your care</h3><span>Select a service and preferred visit time</span></div>
          <div className="field"><label htmlFor="ap-dept">Department</label>
            <select id="ap-dept" value={form.department_id} onChange={set('department_id')}>
              <option value="">Select department…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ap-doc">Doctor (optional)</label>
            <select id="ap-doc" value={form.doctor_id} onChange={set('doctor_id')}>
              <option value="">Any available doctor</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} — {d.specialty}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ap-svc">Service (optional)</label>
            <select id="ap-svc" value={form.service_id} onChange={set('service_id')}>
              <option value="">General visit</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ap-date-year">Preferred date * (Ethiopian calendar)</label>
            <div className="filter-row" style={{ gap: 8 }}>
              <select id="ap-date-year" required aria-label="Ethiopian year" value={ethiopianDate.year}
                onChange={updateEthiopianDate('year')} style={{ flex: '1 1 100px' }}>
                <option value="">Year</option>
                {availableYears.map(year => <option key={year} value={year}>{year} E.C.</option>)}
              </select>
              <select aria-label="Ethiopian month" required value={ethiopianDate.month}
                onChange={updateEthiopianDate('month')} style={{ flex: '1 1 130px' }}>
                <option value="">Month</option>
                {ETHIOPIAN_MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
              <select id="ap-date" aria-label="Ethiopian day" required value={ethiopianDate.day}
                onChange={updateEthiopianDate('day')} style={{ flex: '1 1 80px' }}>
                <option value="">Day</option>
                {ethiopianMonthDays.map(({ day }) => <option key={day} value={day}>{day}</option>)}
              </select>
            </div>
            <small className="muted">
              {form.preferred_date
                ? `Gregorian date for hospital scheduling: ${form.preferred_date}`
                : 'Choose an Ethiopian year, month, and day. The matching Gregorian date is sent for scheduling.'}
            </small>
          </div>
          <div className="field"><label htmlFor="ap-time">Preferred time</label>
            <select id="ap-time" value={form.preferred_time} onChange={set('preferred_time')}>
              <option value="">Any time</option><option>Morning</option><option>Afternoon</option>
            </select></div>
          <div className="appointment-form-section full"><span className="appointment-section-number">03</span><h3>Tell us a little more</h3><span>Share anything that will help us prepare for your visit</span></div>
          <div className="field full"><label htmlFor="ap-reason">Reason for visit</label>
            <textarea id="ap-reason" rows={3} maxLength={2000} value={form.reason} onChange={set('reason')} /></div>
          <div className="field full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input id="ap-em" type="checkbox" checked={form.is_emergency} onChange={set('is_emergency')} style={{ width: 'auto' }} />
            <label htmlFor="ap-em" style={{ margin: 0, textTransform: 'none', fontSize: 14 }}>
              This is urgent. <strong>For life-threatening emergencies do not wait — come directly to the Emergency Unit or call.</strong>
            </label>
          </div>
        </div>
        <div className="appointment-submit-row">
          <p>Your information is handled securely and shared with our care team.</p>
          <button className="btn btn-primary appointment-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit appointment request'} {!busy && <span aria-hidden="true">→</span>}</button>
        </div>
      </form>

      <div className="panel appointment-status-panel" style={{ marginTop: 26 }}>
        <div className="appointment-status-heading"><span className="appointment-status-icon" aria-hidden="true">✓</span><div><h3>Already booked?</h3><p>Enter your appointment reference and phone number to check the latest update.</p></div></div>
        <form onSubmit={checkStatus} className="filter-row" aria-label="Status checker">
          <input aria-label="Reference" placeholder="AGH-APT-2026-000001" required value={status.reference}
            onChange={e => setStatus(s => ({ ...s, reference: e.target.value }))} style={{ flex: '1 1 220px' }} />
          <input aria-label="Phone" placeholder="Phone used for booking" required value={status.phone}
            onChange={e => setStatus(s => ({ ...s, phone: e.target.value }))} style={{ flex: '1 1 180px' }} />
          <button className="btn btn-outline">Check status</button>
        </form>
        {status.error && <div className="alert error">{status.error}</div>}
        {status.result && (
          <div className="alert info">
            <strong className="mono">{status.result.reference}</strong> — {status.result.department || 'General'} ·
            preferred {formatEthiopianDate(String(status.result.preferred_date).slice(0, 10))}
            {' '}({String(status.result.preferred_date).slice(0, 10)} Gregorian)
            {status.result.scheduled_date && <> · scheduled <strong>{String(status.result.scheduled_date).slice(0, 10)} {status.result.scheduled_time || ''}</strong></>}
            <br />Status: <span className={`status-pill st-${status.result.status}`}>{status.result.status}</span>
            {status.result.status_note && <> — {status.result.status_note}</>}
          </div>
        )}
      </div>
    </div>
  );
}
