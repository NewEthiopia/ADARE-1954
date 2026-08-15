import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, initials } from '../lib/api.js';

export default function Doctors() {
  const [doctors, setDoctors] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  useEffect(() => { get('/departments').then(d => setDepartments(d.departments || [])); }, []);
  useEffect(() => {
    document.title = 'Find a Doctor — Adare General Hospital';
    const id = setTimeout(() => {
      const query = new URLSearchParams();
      if (q.trim()) query.set('q', q.trim());
      if (dept) query.set('department', dept);
      get(`/doctors?${query}`).then(d => setDoctors(d.doctors || [])).catch(() => setDoctors([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, dept]);

  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Doctors</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Our team</span><h2>Doctors &amp; Health Professionals</h2></div>
      </div>
      <div className="filter-row">
        <input aria-label="Search doctors" placeholder="Search by name or specialty…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 240px' }} />
        <select aria-label="Filter by department" value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.id} value={d.slug}>{d.name}</option>)}
        </select>
      </div>
      <div className="card-grid">
        {doctors === null && [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}
        {doctors?.map(d => (
          <div className="card" key={d.id}>
            <div className="doc-card">
              <span className="doc-avatar" aria-hidden>{initials(d.full_name)}</span>
              <div style={{ minWidth: 0 }}>
                <h3>{d.full_name}</h3>
                <p className="muted" style={{ fontSize: 13.5 }}>{d.title}</p>
                <span className="tag" style={{ marginTop: 6 }}>{d.department}</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 14, margin: '12px 0 4px' }}>{d.biography}</p>
            <p className="meta">{d.qualifications}</p>
            <p className="meta" style={{ margin: '6px 0 12px' }}>{d.languages} · {d.working_days} {d.working_hours}</p>
            {d.accepts_appointments && <Link className="btn btn-outline btn-sm" to={`/appointments?doctor=${d.id}`}>Book appointment</Link>}
          </div>
        ))}
        {doctors?.length === 0 && <p className="muted">No doctors match your search.</p>}
      </div>
    </div>
  );
}
