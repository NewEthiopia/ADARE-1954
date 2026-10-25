import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, initials } from '../lib/api.js';

function DoctorPhoto({ doctor }) {
  return (
    <div className="doctor-photo">
      <img src={doctor.photo_path || '/logo-192.webp'} alt="" loading="lazy" decoding="async" />
      <span aria-hidden>{initials(doctor.full_name)}</span>
    </div>
  );
}

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
    <div className="wrap doctor-directory" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Doctors</nav>
      <header className="doctor-hero">
        <div className="doctor-hero-copy">
          <span className="doctor-hero-kicker"><span aria-hidden="true">✦</span> Your care, our commitment</span>
          <h1>Find a Doctor</h1>
          <p>Meet the dedicated professionals caring for Hawassa and the Sidama Region. Search by name, specialty, or department to find the right care for you.</p>
          <a className="btn btn-primary" href="#doctor-search">Find your specialist <span aria-hidden="true">↓</span></a>
        </div>
        <div className="doctor-hero-art" aria-hidden="true">
          <span className="doctor-art-orbit orbit-one" />
          <span className="doctor-art-orbit orbit-two" />
          <div className="doctor-art-icon">
            <svg viewBox="0 0 120 120" fill="none">
              <path d="M60 102s-35-21-35-49a21 21 0 0 1 35-15 21 21 0 0 1 35 15c0 28-35 49-35 49Z" fill="currentColor" opacity=".14" />
              <path d="M25 60h19l9-18 15 37 10-19h17" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M60 9v17M9 60h17M94 60h17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".65" />
            </svg>
          </div>
          <span className="doctor-art-spark spark-one">✦</span>
          <span className="doctor-art-spark spark-two">+</span>
          <span className="doctor-art-caption">Care begins<br />with connection</span>
        </div>
      </header>
      <div className="doctor-search-panel" id="doctor-search">
        <div className="doctor-search-heading">
          <span className="doctor-search-icon" aria-hidden="true">⌕</span>
          <div><h2>Let’s find the right doctor</h2><p>Search our team or browse by department</p></div>
        </div>
        <div className="doctor-search-controls">
          <label className="doctor-search-input">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search doctors" placeholder="Name, specialty, or qualification…" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <label className="doctor-department-select">
            <span className="sr-only">Filter by department</span>
            <select aria-label="Filter by department" value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d.id} value={d.slug}>{d.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      <section className="doctor-results" aria-live="polite">
        <div className="doctor-results-heading">
          <div><span className="label">Our team</span><h2>Doctors &amp; Health Professionals</h2></div>
          {doctors && <span className="doctor-count">{doctors.length} {doctors.length === 1 ? 'professional' : 'professionals'}</span>}
        </div>
        <div className="card-grid doctor-card-grid">
          {doctors === null && [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 230 }} />)}
          {doctors?.map((d, i) => (
            <article className="card doctor-directory-card" key={d.id} style={{ '--doctor-index': i }}>
              <div className="doc-card">
                <DoctorPhoto doctor={d} />
                <div className="doctor-card-heading">
                  <h3>{d.full_name}</h3>
                  {d.title && <p className="muted">{d.title}</p>}
                  {d.department && <span className="tag">{d.department}</span>}
                </div>
              </div>
              {d.biography && <p className="doctor-biography">{d.biography}</p>}
              {d.qualifications && <p className="doctor-meta"><span aria-hidden="true">✧</span> {d.qualifications}</p>}
              {(d.languages || d.working_days || d.working_hours) && (
                <p className="doctor-meta"><span aria-hidden="true">◷</span> {[d.languages, d.working_days, d.working_hours].filter(Boolean).join(' · ')}</p>
              )}
              {d.accepts_appointments && <Link className="btn btn-outline btn-sm doctor-book-link" to={`/appointments?doctor=${d.id}`}>Book appointment <span aria-hidden="true">→</span></Link>}
            </article>
          ))}
          {doctors?.length === 0 && (
            <div className="doctor-empty-state">
              <span aria-hidden="true">⌕</span>
              <h3>No matching doctors</h3>
              <p>Try another name or specialty, or choose a different department.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
