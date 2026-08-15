import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';

export default function Departments() {
  const [departments, setDepartments] = useState(null);
  useEffect(() => {
    document.title = 'Departments — Adare General Hospital';
    get('/departments').then(d => setDepartments(d.departments || [])).catch(() => setDepartments([]));
  }, []);
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Departments</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Clinical structure</span><h2>Hospital Departments</h2></div>
      </div>
      <div className="card-grid">
        {departments === null && [...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}
        {departments?.map((d, i) => (
          <div className="card" key={d.id}>
            <span className="mono muted" style={{ fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</span>
            <h3>{d.name}</h3>
            {d.name_am && <p lang="am" className="muted" style={{ fontSize: 13.5 }}>{d.name_am}</p>}
            <p className="muted" style={{ fontSize: 14, margin: '8px 0' }}>{d.description}</p>
            {d.location && <p className="meta">📍 {d.location}</p>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Link className="btn btn-outline btn-sm" to={`/services?department=${d.slug}`}>Services</Link>
              <Link className="btn btn-outline btn-sm" to={`/doctors?department=${d.slug}`}>Doctors</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
