import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';

export default function News() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  useEffect(() => {
    document.title = 'News — Adare General Hospital';
    const id = setTimeout(() => {
      get(`/news?page=${page}&per_page=9${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setData).catch(() => setData({ news: [], total: 0 }));
    }, 250);
    return () => clearTimeout(id);
  }, [page, q]);
  const pages = data ? Math.max(1, Math.ceil(data.total / 9)) : 1;
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px' }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / News</nav>
      <div className="sec-head" style={{ marginTop: 10 }}>
        <div><span className="label">Announcements</span><h2>News &amp; Updates</h2></div>
      </div>
      <div className="filter-row">
        <input aria-label="Search news" placeholder="Search news…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} style={{ flex: '1 1 260px' }} />
      </div>
      <div className="card-grid">
        {data === null && [...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}
        {data?.news.map(n => (
          <Link to={`/news/${n.slug}`} className="card" key={n.id} style={{ padding: 0, overflow: 'hidden' }}>
            {n.image_path && (
              <img src={n.image_path} alt="" loading="lazy" decoding="async"
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderBottom: '1px solid var(--line)' }} />
            )}
            <div style={{ padding: 22 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="tag">{n.category || 'News'}</span>
                {n.is_featured && <span className="tag ochre">Featured</span>}
              </div>
              <h3 style={{ marginTop: 10 }}>{n.title}</h3>
              <p className="muted" style={{ fontSize: 14 }}>{n.excerpt}</p>
              <p className="meta" style={{ marginTop: 10 }}>{new Date(n.publish_at || n.created_at).toLocaleDateString()}</p>
            </div>
          </Link>
        ))}
        {data?.news.length === 0 && <p className="muted">No articles found.</p>}
      </div>
      {pages > 1 && (
        <div className="pagination" role="navigation" aria-label="Pagination">
          {[...Array(pages)].map((_, i) => (
            <button key={i} className={page === i + 1 ? 'cur' : ''} onClick={() => setPage(i + 1)}>{i + 1}</button>
          ))}
        </div>
      )}
    </div>
  );
}
