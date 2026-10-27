import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { get, initials } from '../lib/api.js';
import { useT, useSettings } from '../components/Layout.jsx';
import LeadershipCarousel from '../components/LeadershipCarousel.jsx';

const hospitalPhotos = [
  { src: 'hospital-exterior-aerial.jpg', alt: 'Aerial view of Adare General Hospital and its grounds', caption: 'Adare General Hospital' },
  { src: 'hospital-inauguration-team.jpg', alt: 'Hospital team gathered outside the main entrance', caption: 'Our hospital team' },
  { src: 'clinical-team-gathering.jpg', alt: 'Hospital leaders visiting with healthcare professionals inside the hospital', caption: 'Leaders visiting our hospital' },
  { src: 'clinical-laboratory.jpg', alt: 'Clinical laboratory with diagnostic equipment and workstations', caption: 'Clinical laboratory' },
  { src: 'consultation-room.jpg', alt: 'Patient consultation room with examination bed and desk', caption: 'Patient consultation room' },
  { src: 'pharmacy-counter.jpg', alt: 'Hospital pharmacy counter and medicine shelves', caption: 'Hospital pharmacy' },
  { src: 'laboratory-equipment.jpg', alt: 'Laboratory workstations and diagnostic equipment', caption: 'Laboratory services' },
  { src: 'patient-reception.jpg', alt: 'Reception team at the hospital welcome desk', caption: 'Patient reception' },
  { src: 'hospital-opening-ceremony.jpg', alt: 'Hospital staff and guests at an outdoor hospital ceremony', caption: 'A hospital celebration' },
  { src: 'pharmacy-interior.jpg', alt: 'Wide view of the hospital pharmacy and service counter', caption: 'Pharmacy services' },
  { src: 'operating-theatre.jpg', alt: 'Operating theatre prepared with surgical equipment', caption: 'Operating theatre' },
];

const hospitalStatistics = [
  { value: 65, label: 'Years of service since 1954 E.C.' },
  { value: 12, label: 'Medical departments' },
  { value: 461, label: 'Healthcare professionals' },
  { value: 183759, label: 'OPD attendances in the latest year' },
  { value: 39253, label: 'Emergency visits in the same year' },
  { value: '24/7', label: 'Emergency availability' },
];

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

function DoctorPhoto({ doctor }) {
  return (
    <div className="doctor-photo">
      <img src={doctor.photo_path || '/logo-192.webp'} alt="" loading="lazy" decoding="async" />
      <span aria-hidden>{initials(doctor.full_name)}</span>
    </div>
  );
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', alignItems: 'center' }}>
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
  const [statsVisible, setStatsVisible] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const statsRef = useRef(null);
  const galleryHovering = useRef(false);
  const galleryFocus = useRef(false);
  const galleryPointerStart = useRef(null);
  const galleryPauseUntil = useRef(0);
  useEffect(() => {
    get('/services').then(d => setServices((d.services || []).slice(0, 6))).catch(() => {});
    get('/doctors').then(d => setDoctors((d.doctors || []).slice(0, 3))).catch(() => {});
    get('/news?per_page=3').then(d => setNews(d.news || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const section = statsRef.current;
    if (!section) return undefined;
    if (!('IntersectionObserver' in window)) {
      setStatsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setStatsVisible(true);
      observer.disconnect();
    }, { threshold: 0.15 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(preference.matches);
    const handleChange = event => setReducedMotion(event.matches);
    preference.addEventListener?.('change', handleChange);
    return () => preference.removeEventListener?.('change', handleChange);
  }, []);
  useEffect(() => {
    if (reducedMotion || slideshowPaused) return undefined;
    const timer = setInterval(() => {
      if (galleryHovering.current || galleryFocus.current || document.hidden || Date.now() < galleryPauseUntil.current) return;
      setActivePhoto(current => (current + 1) % hospitalPhotos.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [reducedMotion, slideshowPaused]);
  const goToPhoto = index => {
    setActivePhoto((index + hospitalPhotos.length) % hospitalPhotos.length);
    galleryPauseUntil.current = Date.now() + 5000;
  };
  const handleGalleryKeyDown = event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); goToPhoto(activePhoto + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goToPhoto(activePhoto - 1); }
    if (event.key === 'Home') { event.preventDefault(); goToPhoto(0); }
    if (event.key === 'End') { event.preventDefault(); goToPhoto(hospitalPhotos.length - 1); }
  };
  const handleGalleryPointerUp = event => {
    if (galleryPointerStart.current === null) return;
    const distance = event.clientX - galleryPointerStart.current;
    galleryPointerStart.current = null;
    if (Math.abs(distance) > 55) goToPhoto(activePhoto + (distance < 0 ? 1 : -1));
  };
  const phone = (settings.phone_emergency || '').replace(/\s/g, '');

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">Public general hospital · Hawassa · Since 1954 E.C.</div>
          <h1>Welcome to<br />Adare General Hospital<br /><em>{tr('tagline')}</em></h1>
          <p className="hero-welcome-am" lang="am">እንኳን ወደ አዳሬ አጠቃላይ ሆስፒታል በደህና መጡ</p>
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
          <Link to="/services?department=pharmacy" className="quick-card green"><span className="ico">💊</span><h3>{tr('pharmacy')}</h3><p>OPD, emergency, inpatient and community pharmacies.</p><span className="go">Details →</span></Link>
          <Link to="/services?department=laboratory" className="quick-card"><span className="ico">🔬</span><h3>{tr('laboratory')}</h3><p>EAS-accredited laboratory with GeneXpert testing.</p><span className="go">Details →</span></Link>
        </div>
      </div>

      <FeaturedCampaign />

      <section className="block stats-band" style={{ marginTop: 46 }} aria-label="Hospital statistics" ref={statsRef}>
        <div className="wrap">
          <div className="stats-heading">
            <span className="stats-kicker">Our impact</span>
            <h2>Care that makes a difference</h2>
            <p>Serving Hawassa and the Sidama Region since 1954 E.C.</p>
          </div>
          <div className={`stats-grid${statsVisible ? ' is-visible' : ''}`}>
            {hospitalStatistics.map(({ value, label }, index) => (
              <article className="stat-cell" key={label} style={{ '--stat-index': index }}>
                <span className="stat-mark" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div className="n">{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
                <div className="l">{label}</div>
              </article>
            ))}
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

      <section className="block alt doctor-preview" aria-label="Find a doctor">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="label">Our team</span><h2>{tr('findDoctor')}</h2></div>
            <Link className="doctor-directory-link" to="/doctors">Full directory <span aria-hidden="true">→</span></Link>
          </div>
          <div className="card-grid">
            {doctors.map((d, i) => (
              <article className="card doc-card doctor-preview-card" key={d.id} style={{ '--doctor-index': i }}>
                <DoctorPhoto doctor={d} />
                <div className="doctor-preview-info">
                  <h3>{d.full_name}</h3>
                  <p className="muted" style={{ fontSize: 13.5 }}>{d.title} · {d.department}</p>
                  <p className="meta" style={{ margin: '6px 0 10px' }}>{d.working_days} · {d.working_hours}</p>
                  <Link className="btn btn-outline btn-sm doctor-preview-book" to={`/appointments?doctor=${d.id}`}>
                    {tr('bookAppointment')} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block" aria-label="About the hospital">
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 30, alignItems: 'center' }}>
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

      <section className="block alt hospital-gallery" aria-labelledby="hospital-gallery-title">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="label">Inside Adare</span><h2 id="hospital-gallery-title">Our hospital</h2></div>
          </div>
          <div
            className="hospital-showcase"
            role="region"
            aria-roledescription="carousel"
            aria-label={`Hospital photo gallery, slide ${activePhoto + 1} of ${hospitalPhotos.length}: ${hospitalPhotos[activePhoto].caption}`}
            tabIndex={0}
            onKeyDown={handleGalleryKeyDown}
            onMouseEnter={() => { galleryHovering.current = true; }}
            onMouseLeave={() => { galleryHovering.current = false; galleryPointerStart.current = null; }}
            onFocusCapture={() => { galleryFocus.current = true; }}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) galleryFocus.current = false;
            }}
          >
            <div
              className="hospital-showcase-stage"
              onPointerDown={event => {
                if (event.target.closest('button')) return;
                galleryPointerStart.current = event.clientX;
              }}
              onPointerUp={handleGalleryPointerUp}
              onPointerCancel={() => { galleryPointerStart.current = null; }}
            >
              <figure className="hospital-showcase-slide" key={hospitalPhotos[activePhoto].src} aria-live="polite">
                <img
                  src={`/hospital-images/${hospitalPhotos[activePhoto].src}`}
                  alt={hospitalPhotos[activePhoto].alt}
                  loading="eager"
                  decoding="async"
                  draggable="false"
                />
                <div className="hospital-showcase-shade" />
                <figcaption>
                  <span className="hospital-showcase-count">{String(activePhoto + 1).padStart(2, '0')} <span>/ {String(hospitalPhotos.length).padStart(2, '0')}</span></span>
                  <strong>{hospitalPhotos[activePhoto].caption}</strong>
                </figcaption>
              </figure>
              <button className="hospital-gallery-arrow previous" type="button" aria-label="Previous hospital photo" onClick={() => goToPhoto(activePhoto - 1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
              </button>
              <button className="hospital-gallery-arrow next" type="button" aria-label="Next hospital photo" onClick={() => goToPhoto(activePhoto + 1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            </div>
            <div className="hospital-showcase-controls">
              <div className="hospital-showcase-dots" role="group" aria-label="Choose a hospital photo">
                {hospitalPhotos.map((photo, index) => (
                  <button
                    className={`hospital-showcase-dot${index === activePhoto ? ' is-active' : ''}`}
                    type="button"
                    key={photo.src}
                    aria-label={`Show photo ${index + 1}: ${photo.caption}`}
                    aria-current={index === activePhoto ? 'true' : undefined}
                    onClick={() => goToPhoto(index)}
                  />
                ))}
              </div>
              {!reducedMotion && (
                <button
                  className="hospital-showcase-toggle"
                  type="button"
                  aria-label={slideshowPaused ? 'Play slideshow' : 'Pause slideshow'}
                  aria-pressed={slideshowPaused}
                  onClick={() => setSlideshowPaused(paused => !paused)}
                >
                  <span aria-hidden="true">{slideshowPaused ? '▶' : 'Ⅱ'}</span>
                  {slideshowPaused ? 'Play' : 'Pause'}
                </button>
              )}
            </div>
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
