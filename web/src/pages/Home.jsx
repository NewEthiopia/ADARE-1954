import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { get, initials } from '../lib/api.js';
import { useT, useSettings } from '../components/Layout.jsx';
import LeadershipCarousel from '../components/LeadershipCarousel.jsx';

function CountUp({ value }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const target = Number(value) || 0;
    if (!target) { setN(0); return; }
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min((t - t0) / 1200, 1);
        setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{n.toLocaleString()}</span>;
}

function FeaturedCampaign() {
  const [featured, setFeatured] = useState(null);
  useEffect(() => {
    get('/news?per_page=6').then(d => {
      setFeatured((d.news || []).find(n => n.is_featured && n.image_path) || null);
    }).catch(() => {});
  }, []);
  if (!featured) return null;
  return (
    <section className="block" aria-label="Featured announcement" style={{ paddingBottom: 0 }}>
      <div className="wrap">
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderTop: '5px solid var(--red)', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'center' }}>
            <Link to={`/news/${featured.slug}`} aria-label={featured.title}>
              <img src={featured.image_path} alt={featured.title} decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 240 }} />
            </Link>
            <div style={{ padding: '28px 30px' }}>
              <span className="tag red">ነፃ · Free</span>
              <span className="tag ochre" style={{ marginInlineStart: 8 }}>{featured.category || 'Announcement'}</span>
              <h2 style={{ color: 'var(--navy)', fontSize: 'clamp(20px,2.6vw,28px)', margin: '12px 0 10px', lineHeight: 1.3 }}>
                {featured.title}
              </h2>
              <p className="muted" style={{ fontSize: 15 }}>{featured.excerpt}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <Link className="btn btn-primary" to={`/news/${featured.slug}`}>Full details / ሙሉ መረጃ</Link>
                <Link className="btn btn-outline" to="/contact">Directions</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const tr = useT();
  const settings = useSettings();
  const [services, setServices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [news, setNews] = useState([]);
  useEffect(() => {
    get('/services').then(d => setServices((d.services || []).slice(0, 6))).catch(() => {});
    get('/doctors').then(d => setDoctors((d.doctors || []).slice(0, 3))).catch(() => {});
    get('/news?per_page=3').then(d => setNews(d.news || [])).catch(() => {});
  }, []);
  const phone = (settings.phone_emergency || '').replace(/\s/g, '');

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">Public general hospital · Hawassa · Since 1954 E.C.</div>
          <h1>ADARE GENERAL HOSPITAL<br /><em>{tr('tagline')}</em></h1>
          <p className="sub">{tr('heroSub')}</p>
          <div className="cta-row">
            <Link to="/appointments" className="btn btn-primary">{tr('bookAppointment')}</Link>
            <Link to="/portal" className="btn btn-navy" style={{ background: 'rgba(255,255,255,.14)', border: '1.5px solid rgba(255,255,255,.4)' }}>{tr('portal')}</Link>
            <a href={`tel:${phone}`} className="btn btn-emergency">✆ {tr('emergency')}</a>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="quick-grid">
          <Link to="/appointments" className="quick-card red"><span className="ico">🗓</span><h3>{tr('bookAppointment')}</h3><p>Request a visit online and get a reference number.</p><span className="go">Book now →</span></Link>
          <Link to="/doctors" className="quick-card"><span className="ico">🩺</span><h3>{tr('findDoctor')}</h3><p>Search our healthcare professionals by specialty.</p><span className="go">Search →</span></Link>
          <Link to="/portal" className="quick-card ochre"><span className="ico">👤</span><h3>{tr('portal')}</h3><p>Track appointments, payments and notifications.</p><span className="go">Sign in →</span></Link>
          <Link to="/emergency" className="quick-card red"><span className="ico">🚑</span><h3>{tr('emergency')}</h3><p>Open 24 hours, every day. Come directly or call.</p><span className="go">Emergency info →</span></Link>
          <Link to="/services?department=pharmacy" className="quick-card green"><span className="ico">💊</span><h3>{tr('pharmacy')}</h3><p>Six units: OPD (new building), Emergency 24/7, Inpatient, ART, Community One &amp; Two.</p><span className="go">Details →</span></Link>
          <Link to="/services?department=laboratory" className="quick-card"><span className="ico">🔬</span><h3>{tr('laboratory')}</h3><p>EAS-accredited laboratory with GeneXpert testing.</p><span className="go">Details →</span></Link>
        </div>
      </div>

      <FeaturedCampaign />

      <section className="block stats-band" style={{ marginTop: 46 }} aria-label="Hospital statistics">
        <div className="wrap">
          <div className="stats-grid">
            <div className="stat-cell"><div className="n"><CountUp value={settings.stat_years_of_service} /></div><div className="l">Years of service since 1954 E.C.</div></div>
            <div className="stat-cell"><div className="n"><CountUp value={settings.stat_departments} /></div><div className="l">Medical departments</div></div>
            <div className="stat-cell"><div className="n"><CountUp value={settings.stat_health_professionals} /></div><div className="l">Healthcare professionals</div></div>
            <div className="stat-cell"><div className="n"><CountUp value={settings.stat_opd_attendances} /></div><div className="l">OPD attendances in the latest year</div></div>
            <div className="stat-cell"><div className="n"><CountUp value={settings.stat_emergency_visits} /></div><div className="l">Emergency visits in the same year</div></div>
            <div className="stat-cell"><div className="n">24/7</div><div className="l">Emergency availability</div></div>
          </div>
        </div>
      </section>

      <section className="block" aria-label="Services">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="label">What we offer</span><h2>{tr('services')}</h2></div>
            <Link className="more" to="/services">All services →</Link>
          </div>
          <div className="card-grid">
            {services.map(s => (
              <div className="card" key={s.id}>
                <span className={`tag ${s.emergency ? 'red' : ''}`}>{s.department || 'General'}</span>
                <h3 style={{ marginTop: 10 }}>{s.name}</h3>
                <p className="muted" style={{ fontSize: 14 }}>{s.description}</p>
                <p className="meta" style={{ marginTop: 10 }}>{s.available_days} · {s.working_hours}</p>
              </div>
            ))}
            {!services.length && [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160 }} />)}
          </div>
        </div>
      </section>

      <section className="block alt" aria-label="Find a doctor">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="label">Our team</span><h2>{tr('findDoctor')}</h2></div>
            <Link className="more" to="/doctors">Full directory →</Link>
          </div>
          <div className="card-grid">
            {doctors.map(d => (
              <div className="card doc-card" key={d.id}>
                <span className="doc-avatar" aria-hidden>{initials(d.full_name)}</span>
                <div>
                  <h3>{d.full_name}</h3>
                  <p className="muted" style={{ fontSize: 13.5 }}>{d.title} · {d.department}</p>
                  <p className="meta" style={{ margin: '6px 0 10px' }}>{d.working_days} · {d.working_hours}</p>
                  <Link className="btn btn-outline btn-sm" to={`/appointments?doctor=${d.id}`}>{tr('bookAppointment')}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="block" aria-label="About the hospital">
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 30, alignItems: 'center' }}>
          <div>
            <span className="label" style={{ fontFamily: 'var(--mono)', fontSize: 11.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--red)', fontWeight: 700 }}>Seven decades of service</span>
            <h2 style={{ fontSize: 'clamp(22px,3vw,32px)', color: 'var(--navy)', margin: '8px 0 14px' }}>About Adare General Hospital</h2>
            <p className="muted">Opened in 1954 E.C. (Ethiopian calendar), Adare General Hospital serves Hawassa and a catchment of over 1.3 million people in the Sidama Regional State. In the latest reporting year the hospital provided 183,759 outpatient attendances, 39,253 emergency visits and 4,810 admissions, with 712 staff including 461 healthcare professionals.</p>
            <p style={{ marginTop: 16 }}><Link to="/about" className="btn btn-outline">Read our story</Link></p>
          </div>
          <div className="card" style={{ borderTop: '4px solid var(--ochre)' }}>
            <span className="label" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--red)', fontWeight: 700 }}>Manager's message</span>
            <blockquote style={{ margin: '12px 0', fontSize: 17, fontStyle: 'italic', lineHeight: 1.7 }}>
              “Leadership, for me, is service. To serve, I must stay close to the people we serve. Together we will take this great institution to an even better level.”
            </blockquote>
            <p style={{ fontWeight: 700, color: 'var(--navy)' }}>Yirdachew Anato</p>
            <p className="muted" style={{ fontSize: 13 }}>Hospital Manager / CEO · Adare General Hospital</p>
          </div>
        </div>
      </section>

      <LeadershipCarousel />

      <section className="block" aria-label="Latest news">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="label">Announcements</span><h2>{tr('news')}</h2></div>
            <Link className="more" to="/news">All news →</Link>
          </div>
          <div className="card-grid">
            {news.map(n => (
              <Link to={`/news/${n.slug}`} className="card" key={n.id} style={{ padding: 0, overflow: 'hidden' }}>
                {n.image_path && (
                  <img src={n.image_path} alt="" loading="lazy" decoding="async"
                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderBottom: '1px solid var(--line)' }} />
                )}
                <div style={{ padding: 22 }}>
                  <span className="tag">{n.category || 'News'}</span>
                  <h3 style={{ marginTop: 10 }}>{n.title}</h3>
                  <p className="muted" style={{ fontSize: 14 }}>{n.excerpt}</p>
                  <p className="meta" style={{ marginTop: 10 }}>{new Date(n.publish_at || n.created_at).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
            {!news.length && <p className="muted">No published announcements yet.</p>}
          </div>
        </div>
      </section>

      <section className="block alt" aria-label="Patient portal call to action">
        <div className="wrap" style={{ textAlign: 'center', maxWidth: 640 }}>
          <h2 style={{ color: 'var(--navy)', fontSize: 'clamp(22px,3vw,30px)' }}>Your health, in your hands</h2>
          <p className="muted" style={{ margin: '10px 0 22px' }}>Create a free patient portal account to book and track appointments, see payment status, and receive notifications from the hospital.</p>
          <Link to="/portal" className="btn btn-primary">Open the patient portal</Link>
        </div>
      </section>
    </>
  );
}
