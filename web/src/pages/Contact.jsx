import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useSettings } from '../components/Layout.jsx';

export default function Contact() {
  const settings = useSettings();
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  useEffect(() => { document.title = 'Contact — Adare General Hospital'; }, []);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: '' });
    try {
      await post('/contact', form);
      setState({ busy: false, done: true, error: '' });
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message });
    }
  };
  const lat = settings.map_lat || '7.0621', lng = settings.map_lng || '38.4764';
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Contact</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Get in touch</span><h2>Contact &amp; Directions</h2></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
        <div>
          <div className="panel">
            <h3>Hospital details</h3>
            <p><strong>Address:</strong> {settings.address}</p>
            <p><strong>Phone:</strong> <a href={`tel:${(settings.phone_main || '').replace(/\s/g, '')}`} style={{ color: 'var(--red)', fontWeight: 700 }}>{settings.phone_main}</a></p>
            <p><strong>Emergency:</strong> open 24 hours, 7 days — come directly to the Emergency &amp; Trauma Unit</p>
            <p><strong>Working hours:</strong> {settings.working_hours}</p>
            <p style={{ marginTop: 12 }}>
              <a className="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}>
                Open map / directions ↗
              </a>
            </p>
          </div>
          <div className="panel">
            <h3>Location</h3>
            <p className="muted" style={{ fontSize: 14 }}>Hawassa City, approximately 275 km south of Addis Ababa.
              The hospital is a well-known landmark — ask for “Adare Hospital”.</p>
          </div>
        </div>
        <form className="panel" onSubmit={submit} aria-label="Contact form">
          <h3>Send us a message</h3>
          {state.done && <div className="alert success" role="status">✓ Message received. Our team will get back to you.</div>}
          {state.error && <div className="alert error" role="alert">{state.error}</div>}
          <div className="field"><label htmlFor="c-name">Name *</label><input id="c-name" required maxLength={150} value={form.name} onChange={set('name')} /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="c-email">Email</label><input id="c-email" type="email" value={form.email} onChange={set('email')} /></div>
            <div className="field"><label htmlFor="c-phone">Phone</label><input id="c-phone" type="tel" value={form.phone} onChange={set('phone')} /></div>
          </div>
          <div className="field"><label htmlFor="c-subj">Subject</label><input id="c-subj" maxLength={200} value={form.subject} onChange={set('subject')} /></div>
          <div className="field"><label htmlFor="c-msg">Message *</label><textarea id="c-msg" required rows={5} maxLength={4000} value={form.message} onChange={set('message')} /></div>
          <button className="btn btn-primary" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send message'}</button>
        </form>
      </div>
    </div>
  );
}
