// ============================================================
// ADARE GENERAL HOSPITAL — Leadership Heritage Carousel
// Premium 3-up coverflow: center manager dominant, neighbours
// faded/scaled. Infinite loop (modular offsets — no rewind jump),
// autoplay w/ pause-on-interaction, drag/swipe, keyboard nav,
// dots + historical timeline, aria-live, reduced-motion aware.
// Data comes from GET /api/leadership (CMS-managed, real photos).
// ============================================================
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { get } from '../lib/api.js';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const AUTOPLAY_MS = 5000;
const RESUME_MS = 5000;
const DRAG_THRESHOLD = 60; // px before a drag commits to a slide change

const fallbackLeaders = [
  ['Fikru Tesfaye', '1st', 'fikru-tesfaye'],
  ['Muntash Birhanu', '2nd', 'muntash-birhanu'],
  ['Firew Hanke', '3rd', 'firew-hanke'],
  ['Maradona Zeleke', '4th', 'maradona-zeleke'],
  ['Zenebe Turiche', '5th', 'zenebe-turiche'],
  ['Yirdachew Anato', '6th', 'yirdachew-anato'],
].map(([full_name, manager_number, photo]) => ({
  id: `fallback-${manager_number}`,
  full_name,
  manager_number,
  position: 'Hospital Manager',
  period: 'Adare General Hospital',
  active: true,
  is_current: manager_number === '6th',
  photo_url: `/uploads/leaders/${photo}.jpg`,
}));

/** Shortest signed distance from active index to i on a ring of n. */
function ringOffset(i, active, n) {
  let d = (i - active) % n;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

export default function LeadershipCarousel() {
  const [leaders, setLeaders] = useState(null);
  const [active, setActive] = useState(0);
  const [textKey, setTextKey] = useState(0);        // retriggers text fade
  const [reduced, setReduced] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const dragStart = useRef(0);
  const pausedUntil = useRef(0);
  const regionRef = useRef(null);
  const hoverRef = useRef(false);

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const h = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, []);

  useEffect(() => {
    get('/leadership')
      .then(d => setLeaders((d.leadership || []).filter(l => l.active !== false)))
      .catch(() => setLeaders(fallbackLeaders));
  }, []);

  const goTo = useCallback((idx, userAction = true) => {
    setActive(a => {
      const n = leaders?.length || 1;
      const next = ((idx % n) + n) % n;
      if (next !== a) setTextKey(k => k + 1);
      return next;
    });
    if (userAction) pausedUntil.current = Date.now() + RESUME_MS;
  }, [leaders]);

  const next = useCallback((u = true) => leaders && goTo(active + 1, u), [leaders, active, goTo]);
  const prev = useCallback((u = true) => leaders && goTo(active - 1, u), [leaders, active, goTo]);

  // ---- autoplay (pauses on hover/touch/focus/interaction) ----
  useEffect(() => {
    if (!leaders || leaders.length < 2 || reduced) return;
    const id = setInterval(() => {
      if (hoverRef.current) return;
      if (Date.now() < pausedUntil.current) return;
      if (document.hidden) return;
      goTo(active + 1, false);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [leaders, active, goTo, reduced]);

  // ---- keyboard ----
  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo((leaders?.length || 1) - 1); }
  };

  // ---- drag / swipe (pointer events cover touch + mouse) ----
  const onPointerDown = (e) => {
    dragging.current = true;
    dragStart.current = e.clientX;
    pausedUntil.current = Date.now() + RESUME_MS;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    setDragX(e.clientX - dragStart.current);
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setDragX(x => {
      if (x <= -DRAG_THRESHOLD) next();
      else if (x >= DRAG_THRESHOLD) prev();
      return 0;
    });
  };

  if (leaders === null) {
    return (
      <section className="lh-section" aria-busy="true">
        <div className="wrap"><div className="skeleton" style={{ height: 380, borderRadius: 14 }} /></div>
      </section>
    );
  }
  if (!leaders.length) return null;

  const n = leaders.length;
  const current = leaders[active];
  const dragNudge = dragging.current || dragX !== 0 ? dragX * 0.35 : 0;

  return (
    <section className="lh-section" aria-label="Hospital leadership history">
      <div className="wrap">
        {/* ---------- heading ---------- */}
        <header className="lh-head">
          <p className="lh-eyebrow">Our History</p>
          <h2 className="lh-title">
            From Adare Primary Hospital<br />
            <span>to Adare General Hospital</span>
          </h2>
          <p className="lh-sub">The managers who led the hospital's growth</p>
          <p className="lh-desc">
            Since opening its doors, Adare Hospital has grown from a primary hospital into today's
            Adare General Hospital, a journey guided by successive leaders, each building on the
            work of those before them.
          </p>
          <p className="lh-desc am" lang="am">
            ከአዳሬ የመጀመሪያ ደረጃ ሆስፒታል እስከ አዳሬ አጠቃላይ ሆስፒታል ድረስ ተቋሙን በመምራት አስተዋፅኦ ያደረጉ የቀድሞ እና የአሁን ሥራ አስኪያጆች።
          </p>
        </header>

        {/* ---------- carousel ---------- */}
        <div
          className="lh-carousel"
          ref={regionRef}
          role="region"
          aria-roledescription="carousel"
          aria-label={`Hospital managers, slide ${active + 1} of ${n}: ${current.full_name}`}
          tabIndex={0}
          onKeyDown={onKey}
          onMouseEnter={() => { hoverRef.current = true; }}
          onMouseLeave={() => { hoverRef.current = false; endDrag(); }}
          onFocus={() => { pausedUntil.current = Date.now() + RESUME_MS; }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={() => { pausedUntil.current = Date.now() + RESUME_MS; }}
          style={{ touchAction: 'pan-y' }}
        >
          <div className="lh-stage">
            {leaders.map((l, i) => {
              const off = ringOffset(i, active, n);
              const abs = Math.abs(off);
              const visible = abs <= 2;
              // coverflow geometry: centre 0 → dominant; ±1 flank; ±2 peek
              const x = off * 46;                          // % of slot width
              const scale = abs === 0 ? 1.05 : abs === 1 ? 0.82 : 0.66;
              const opacity = abs === 0 ? 1 : abs === 1 ? 0.65 : 0.28;
              const z = 30 - abs * 10;
              const isCurrentBadge = l.is_current;
              const base = (l.photo_url || '').replace(/\.jpg$/, '');
              return (
                <figure
                  key={l.id}
                  className={`lh-slide ${abs === 0 ? 'is-active' : ''}`}
                  aria-hidden={abs !== 0}
                  style={{
                    transform: `translate(-50%, 0) translateX(calc(${x}% + ${abs === 0 ? dragNudge : dragNudge * 0.5}px)) scale(${scale})`,
                    opacity: visible ? opacity : 0,
                    zIndex: z,
                    pointerEvents: visible && abs !== 0 ? 'auto' : abs === 0 ? 'auto' : 'none',
                    transition: dragging.current
                      ? 'none'
                      : reduced
                        ? 'opacity .3s ease'
                        : `transform .65s ${EASE}, opacity .55s ${EASE}`,
                  }}
                  onClick={() => abs !== 0 && goTo(i)}
                >
                  <div className="lh-ring">
                    <picture>
                      {base && <source srcSet={`${base}.webp`} type="image/webp" />}
                      {l.photo_url ? (
                        <img
                          src={l.photo_url}
                          alt={`${l.full_name}, ${l.manager_number || ''} Manager`}
                          loading={abs === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          draggable={false}
                          width={260}
                          height={325}
                        />
                      ) : (
                        <span className="lh-ph" aria-hidden>⚕</span>
                      )}
                    </picture>
                    {isCurrentBadge && abs === 0 && <span className="lh-now">Current Manager</span>}
                  </div>
                  <figcaption className="lh-slide-cap">
                    <span className="lh-ordinal">{l.manager_number}</span> {l.full_name}
                  </figcaption>
                </figure>
              );
            })}
          </div>

          {/* nav arrows */}
          <button className="lh-arrow lh-prev" aria-label="Previous manager" onClick={() => prev()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="lh-arrow lh-next" aria-label="Next manager" onClick={() => next()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* ---------- active manager card ---------- */}
        <div className="lh-card" aria-live="polite">
          <div key={textKey} className={reduced ? '' : 'lh-card-anim'}>
            <span className="lh-card-num">{current.manager_number}</span>
            <h3 className="lh-card-name">{current.full_name}</h3>
            <p className="lh-card-pos">{current.manager_number} Manager · {current.position}</p>
            {current.period && <p className="lh-card-era">{current.period}</p>}
            {current.is_current && <span className="lh-card-badge">★ Current Manager</span>}
            {current.description && <p className="lh-card-desc">{current.description}</p>}
          </div>
        </div>

        {/* ---------- dots ---------- */}
        <div className="lh-dots" role="tablist" aria-label="Choose manager">
          {leaders.map((l, i) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={i === active}
              aria-label={`${l.manager_number} Manager, ${l.full_name}`}
              className={`lh-dot ${i === active ? 'on' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        {/* ---------- historical timeline ---------- */}
        <div className="lh-timeline" aria-label="Hospital history timeline">
          <div className="lh-tl-track" aria-hidden="true" />
          {[
            ['1954 E.C.', 'Beginning'],
            ['', 'Adare Primary Hospital'],
            ['', 'Successive managers'],
            ['', 'Hospital expansion'],
            ['', 'Adare General Hospital'],
            ['', 'Current leadership'],
          ].map(([year, label], i, arr) => (
            <div className={`lh-tl-node ${i === arr.length - 1 ? 'end' : ''} ${i === 0 ? 'start' : ''}`} key={label}>
              <span className="lh-tl-dot" aria-hidden="true" />
              {year && <span className="lh-tl-year">{year}</span>}
              <span className="lh-tl-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
