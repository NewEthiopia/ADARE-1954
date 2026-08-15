import React, { useEffect, useState, useRef } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { get } from '../lib/api.js';
import { t, getLang, setLang, LANGS } from '../lib/i18n.js';

export function useT() {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force(x => x + 1);
    window.addEventListener('langchange', h);
    return () => window.removeEventListener('langchange', h);
  }, []);
  return t;
}

export function useSettings() {
  const [settings, setSettings] = useState({});
  useEffect(() => { get('/settings').then(d => setSettings(d.settings || {})).catch(() => {}); }, []);
  return settings;
}

function GlobalSearch() {
  const tr = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const boxRef = useRef(null);
  const nav = useNavigate();
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const id = setTimeout(() => {
      get(`/search?q=${encodeURIComponent(q.trim())}`).then(d => setResults(d.results)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setResults(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  const goto = (r) => {
    setResults(null); setQ('');
    const map = { service: '/services', doctor: '/doctors', department: '/departments', news: `/news/${r.slug}`, health: '/health-education' };
    nav(map[r.kind] || '/');
  };
  return (
    <div className="searchbox" ref={boxRef} style={{ flex: '0 1 300px' }}>
      <input aria-label="Global search" placeholder={tr('search')} value={q}
        onChange={e => setQ(e.target.value)}
        style={{ width: '100%', padding: '9px 13px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 14 }} />
      {results && (
        <div className="search-results" role="listbox">
          {results.length === 0 && <a>No results</a>}
          {results.map((r, i) => (
            <a key={i} href="#" onClick={e => { e.preventDefault(); goto(r); }}>
              <span>{r.name}</span><span className="tag">{r.kind}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const tr = useT();
  const settings = useSettings();
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('agh_theme', next);
    setTheme(next);
  };
  const phone = settings.phone_emergency || settings.phone_main || '';
  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="topbar">
        <div className="wrap">
          <span>Hawassa, Sidama Regional State, Ethiopia · <a href={`tel:${phone.replace(/\s/g, '')}`}>{settings.phone_main || ''}</a></span>
          <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span className="em">⚑ {tr('emergencyOpen')}</span>
            <select aria-label="Language" value={getLang()} onChange={e => setLang(e.target.value)}
              style={{ background: 'transparent', color: '#E8EEF3', border: '1px solid rgba(255,255,255,.3)', borderRadius: 5, padding: '2px 6px', fontSize: 12 }}>
              {LANGS.map(l => <option key={l.code} value={l.code} style={{ color: '#111' }}>{l.flag} {l.label}</option>)}
            </select>
            <button className="btn-ghost" onClick={toggleTheme} aria-label="Toggle dark mode"
              style={{ background: 'none', border: 'none', color: '#E8EEF3', fontSize: 15 }}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </span>
        </div>
      </div>

      <header className="header">
        <div className="wrap" style={{ position: 'relative' }}>
          <Link to="/" className="brand" aria-label="Adare General Hospital home">
            <picture><source srcSet="/logo-192.webp" type="image/webp" /><img className="seal" src="/logo-192.png" alt="Adare General Hospital logo" width="46" height="46" /></picture>
            <span>
              <span className="t1">Adare General Hospital</span><br />
              <span className="t2">Hawassa · Sidama · Ethiopia</span>
            </span>
          </Link>
          <GlobalSearch />
          <nav className={`nav ${navOpen ? 'open' : ''}`} aria-label="Main navigation" onClick={() => setNavOpen(false)}>
            <NavLink to="/" end>{tr('home')}</NavLink>
            <NavLink to="/about">{tr('about')}</NavLink>
            <NavLink to="/services">{tr('services')}</NavLink>
            <NavLink to="/departments">{tr('departments')}</NavLink>
            <NavLink to="/doctors">{tr('doctors')}</NavLink>
            <NavLink to="/news">{tr('news')}</NavLink>
            <NavLink to="/contact">{tr('contact')}</NavLink>
            <NavLink to="/portal">{tr('portal')}</NavLink>
          </nav>
          <Link to="/appointments" className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>{tr('bookAppointment')}</Link>
          <button className="nav-toggle" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(o => !o)}>☰</button>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <a className="btn btn-emergency fab-emergency" href={`tel:${phone.replace(/\s/g, '')}`}>
        ✆ {tr('callEmergency')}
      </a>

      <footer className="footer">
        <div className="wrap">
          <div className="cols">
            <div>
              <div className="brand" style={{ marginBottom: 12 }}>
                <picture><source srcSet="/logo-192.webp" type="image/webp" /><img className="seal" src="/logo-192.png" alt="Adare General Hospital logo" width="46" height="46" /></picture>
                <span><span className="t1" style={{ color: '#fff' }}>Adare General Hospital</span><br />
                  <span className="t2" style={{ color: '#8FA5B8' }}>Since 1954 E.C.</span></span>
              </div>
              <p style={{ fontSize: 14 }}>Hawassa City, Sidama Regional State, Ethiopia<br />
                {settings.phone_main} · {settings.working_hours}</p>
            </div>
            <div>
              <h4>{tr('services')}</h4>
              <Link to="/services">{tr('findService')}</Link>
              <Link to="/doctors">{tr('findDoctor')}</Link>
              <Link to="/departments">{tr('departments')}</Link>
              <Link to="/emergency">{tr('emergency')}</Link>
            </div>
            <div>
              <h4>Patients</h4>
              <Link to="/appointments">{tr('bookAppointment')}</Link>
              <Link to="/portal">{tr('portal')}</Link>
              <Link to="/health-education">{tr('healthEducation')}</Link>
              <Link to="/news">{tr('news')}</Link>
            </div>
            <div>
              <h4>Hospital</h4>
              <Link to="/about">{tr('about')}</Link>
              <Link to="/contact">{tr('contact')}</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
              <a href="/staff">Staff sign-in</a>
            </div>
          </div>
          <div className="base">
            <span>© {new Date().getFullYear()} Adare General Hospital. All rights reserved.</span>
            <span>Emergency &amp; trauma: open 24/7</span>
          </div>
        </div>
      </footer>
    </>
  );
}
