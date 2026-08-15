import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';

const CATS = [
  ['', 'All topics'], ['maternal', 'Maternal health'], ['child', 'Child health'], ['nutrition', 'Nutrition'],
  ['diabetes', 'Diabetes'], ['hypertension', 'Hypertension'], ['infectious', 'Infectious diseases'],
  ['medication', 'Medication safety'], ['mental', 'Mental wellbeing'], ['preventive', 'Preventive care'],
];

export default function HealthEducation() {
  const [articles, setArticles] = useState(null);
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    document.title = 'Health Education — Adare General Hospital';
    get(`/health-articles${cat ? `?category=${cat}` : ''}`).then(d => setArticles(d.articles || [])).catch(() => setArticles([]));
  }, [cat]);
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Health Education</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Learn &amp; prevent</span><h2>Health Education Center</h2></div>
      </div>
      <div className="filter-row" role="tablist" aria-label="Categories">
        {CATS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={cat === v}
            className={`btn btn-sm ${cat === v ? 'btn-navy' : 'btn-outline'}`} onClick={() => setCat(v)}>{l}</button>
        ))}
      </div>
      <div className="card-grid">
        {articles === null && [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}
        {articles?.map(a => (
          <div className="card" key={a.id}>
            <span className="tag green">{a.category}</span>
            <h3 style={{ marginTop: 10 }}>{a.title}</h3>
            {open === a.id
              ? <div className="prose" style={{ fontSize: 14.5 }} dangerouslySetInnerHTML={{ __html: a.body_html }} />
              : <p className="muted" style={{ fontSize: 14 }}>{a.body_html?.replace(/<[^>]+>/g, '').slice(0, 120)}…</p>}
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', paddingInlineStart: 0 }}
              onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
              {open === a.id ? 'Show less ↑' : 'Read more ↓'}
            </button>
          </div>
        ))}
      </div>
      <div className="alert info" style={{ marginTop: 24 }}>
        This content is general education, not personal medical advice. For diagnosis or treatment,
        <Link to="/appointments" style={{ fontWeight: 700 }}> book an appointment</Link> or visit the hospital.
      </div>
    </div>
  );
}
