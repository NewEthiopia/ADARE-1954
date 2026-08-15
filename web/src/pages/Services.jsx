import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api.js';

export default function Services() {
  const [params] = useSearchParams();
  const [services, setServices] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState(params.get('department') || '');
  const [sort, setSort] = useState('az');

  useEffect(() => { get('/departments').then(d => setDepartments(d.departments || [])); }, []);
  useEffect(() => {
    document.title = 'Medical Services — Adare General Hospital';
    const id = setTimeout(() => {
      const query = new URLSearchParams();
      if (q.trim()) query.set('q', q.trim());
      if (dept) query.set('department', dept);
      get(`/services?${query}`).then(d => setServices(d.services || [])).catch(() => setServices([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, dept]);

  const sorted = services ? [...services].sort((a, b) =>
    sort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)) : null;

  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Services</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Directory</span><h2>Medical Services</h2></div>
      </div>
      <div className="filter-row">
        <input aria-label="Search services" placeholder="Search services…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 240px' }} />
        <select aria-label="Filter by department" value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.id} value={d.slug}>{d.name}</option>)}
        </select>
        <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="az">A–Z</option><option value="za">Z–A</option>
        </select>
      </div>
      <div className="card-grid">
        {sorted === null && [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
        {sorted?.map(s => (
          <div className="card" key={s.id}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="tag">{s.department || 'General'}</span>
              {s.emergency && <span className="tag red">24/7</span>}
              {s.bookable && <span className="tag green">Bookable</span>}
            </div>
            <h3 style={{ marginTop: 10 }}>{s.name}</h3>
            <p className="muted" style={{ fontSize: 14 }}>{s.description}</p>
            <p className="meta" style={{ margin: '10px 0' }}>
              {s.available_days} · {s.working_hours}{s.location ? ` · ${s.location}` : ''}
            </p>
            {s.bookable && <Link className="btn btn-outline btn-sm" to={`/appointments?service=${s.id}`}>Book appointment</Link>}
          </div>
        ))}
        {sorted?.length === 0 && <p className="muted">No services match your search.</p>}
      </div>
    </div>
  );
}
