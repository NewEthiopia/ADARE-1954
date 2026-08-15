import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useSettings } from '../components/Layout.jsx';

export default function About() {
  const settings = useSettings();
  const [leaders, setLeaders] = useState([]);
  useEffect(() => {
    document.title = 'About — Adare General Hospital';
    get('/leaders').then(d => setLeaders(d.leaders || []));
  }, []);
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / About</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Our history</span><h2>About Adare General Hospital</h2></div>
      </div>
      <div className="prose" style={{ maxWidth: 780 }}>
        <p>Adare General Hospital opened in <strong>1954 E.C.</strong> (Ethiopian calendar) to provide preventive and curative health services to
          Hawassa, capital of the Sidama Regional State, roughly 275 km south of Addis Ababa. Its catchment area has
          grown to an estimated population of more than 1.3 million.</p>
        <p>In the latest reporting year the hospital provided <strong>{Number(settings.stat_opd_attendances || 0).toLocaleString()}</strong> outpatient
          (OPD) attendances, <strong>{Number(settings.stat_emergency_visits || 0).toLocaleString()}</strong> emergency visits and{' '}
          <strong>{Number(settings.stat_ipd_admissions || 0).toLocaleString()}</strong> inpatient admissions. Today it employs{' '}
          <strong>{settings.stat_total_staff}</strong> staff, including <strong>{settings.stat_health_professionals}</strong> healthcare
          professionals across medicine, nursing, midwifery and allied health.</p>
        <h2>Laboratory quality &amp; accreditation</h2>
        <p>The hospital laboratory provides clinical, molecular, sputum and GeneXpert MTB/RIF testing, holds EAS
          recognition under Facility Accreditation No. M0093, and maintains an ISO 15189:2022 quality commitment.</p>
        <h2>Leadership through the years</h2>
        <p>From Adare Primary Hospital to today's Adare General Hospital, the institution has been guided by successive
          managers, each building on the work of those before them.</p>
      </div>
      <div className="card-grid" style={{ marginTop: 22 }}>
        {leaders.map(l => (
          <div className="card" key={l.id} style={{ borderTop: `4px solid ${l.is_current ? 'var(--red)' : 'var(--ochre)'}` }}>
            <span className={`tag ${l.is_current ? 'red' : 'ochre'}`}>{l.order_label}{l.is_current ? ' · Current' : ''}</span>
            <h3 style={{ marginTop: 10 }}>{l.full_name}</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>{l.position}</p>
            {l.period && <p className="meta" style={{ marginTop: 6 }}>{l.period}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
