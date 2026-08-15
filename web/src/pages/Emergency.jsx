import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings, useT } from '../components/Layout.jsx';

export default function Emergency() {
  const settings = useSettings();
  const tr = useT();
  useEffect(() => { document.title = 'Emergency Services — Adare General Hospital'; }, []);
  const phone = (settings.phone_emergency || settings.phone_main || '').replace(/\s/g, '');
  return (
    <>
      <section style={{ background: 'linear-gradient(120deg, var(--red-dark), var(--red))', color: '#fff', padding: '54px 0' }}>
        <div className="wrap">
          <p className="mono" style={{ fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', opacity: .85 }}>Open 24 hours · every day</p>
          <h1 style={{ fontSize: 'clamp(28px,4.4vw,44px)', margin: '10px 0 14px' }}>Emergency &amp; Trauma Unit</h1>
          <p style={{ maxWidth: 560, fontSize: 17 }}>Round-the-clock acute care for injuries, sudden illness and medical emergencies — arriving by referral or walk-in.</p>
          <p style={{ marginTop: 22 }}>
            <a className="btn" style={{ background: '#fff', color: 'var(--red)', fontWeight: 800, fontSize: 18, padding: '15px 30px' }}
              href={`tel:${phone}`}>✆ {tr('callEmergency')}: {settings.phone_emergency}</a>
          </p>
        </div>
      </section>
      <div className="wrap" style={{ padding: '40px 20px 60px' }}>
        <div className="card-grid">
          <div className="card"><h3>When to come immediately</h3>
            <p className="muted" style={{ fontSize: 14.5 }}>Chest pain, severe bleeding, difficulty breathing, loss of consciousness, serious injuries or road accidents, poisoning, severe burns, complicated labour.</p></div>
          <div className="card"><h3>What to bring</h3>
            <p className="muted" style={{ fontSize: 14.5 }}>Any medication the patient takes, previous medical documents if available, and a family member or companion. Treatment starts first — paperwork follows.</p></div>
          <div className="card"><h3>Location</h3>
            <p className="muted" style={{ fontSize: 14.5 }}>Main building, ground floor — follow the red EMERGENCY signs from the main gate. Ambulance access is sign-posted.</p>
            <p style={{ marginTop: 10 }}><Link className="btn btn-outline btn-sm" to="/contact">Directions</Link></p></div>
          <div className="card"><h3>Emergency services</h3>
            <p className="muted" style={{ fontSize: 14.5 }}>Trauma stabilisation · emergency surgery · emergency obstetrics · pediatric emergencies · 24-hour emergency pharmacy and laboratory support.</p></div>
        </div>
        <div className="alert info" style={{ marginTop: 26 }}>
          For non-urgent conditions, please use the <Link to="/appointments" style={{ fontWeight: 700 }}>appointment system</Link> —
          this keeps the emergency team available for critical patients.
        </div>
      </div>
    </>
  );
}
