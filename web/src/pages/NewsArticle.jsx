import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get } from '../lib/api.js';

export default function NewsArticle() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    get(`/news/${slug}`).then(d => {
      setArticle(d.article);
      document.title = `${d.article.title} — Adare General Hospital`;
    }).catch(e => setError(e.message));
  }, [slug]);
  if (error) return <div className="wrap" style={{ padding: 60 }}><div className="alert error">{error}</div><Link to="/news" className="btn btn-outline">← All news</Link></div>;
  if (!article) return <div className="wrap" style={{ padding: 60 }}><div className="skeleton" style={{ height: 260 }} /></div>;
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px', maxWidth: 800 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / <Link to="/news">News</Link> / {article.title}</nav>
      <article style={{ marginTop: 18 }}>
        <span className="tag">{article.category || 'News'}</span>
        <h1 style={{ color: 'var(--navy)', fontSize: 'clamp(24px,3.6vw,36px)', margin: '12px 0' }}>{article.title}</h1>
        <p className="meta" style={{ marginBottom: 20 }}>
          {new Date(article.publish_at || article.created_at).toLocaleDateString()} {article.author && `· ${article.author}`}
        </p>
        {article.image_path && (
          <img src={article.image_path} alt={article.title} decoding="async"
            style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)', marginBottom: 22 }} />
        )}
        {/* body_html is sanitized server-side before storage */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: article.body_html || `<p>${article.excerpt || ''}</p>` }} />
      </article>
    </div>
  );
}
