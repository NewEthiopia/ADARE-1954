import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../lib/api.js';

export default function Procurement() {
  const [tenders, setTenders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ payer_name: '', phone: '', method: 'bank_transfer', provider_ref: '' });
  const [payment, setPayment] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Tenders & Procurement — Adare General Hospital'; get('/procurement').then(d => setTenders(d.tenders)).catch(e => setMessage(e.message)); }, []);
  const choose = (tender) => { setSelected(tender); setPayment(null); setMessage(''); };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const data = await post(`/procurement/${selected.id}/payments`, form);
      setPayment(data.payment); setMessage('Payment submitted. Finance must verify it and an administrator must release the document before download.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const downloadUrl = payment && selected && payment.status === 'SUCCESSFUL'
    ? `/api/procurement/${selected.id}/download?payment_reference=${encodeURIComponent(payment.reference)}&phone=${encodeURIComponent(form.phone)}` : '';

  return <div className="wrap" style={{ padding: '34px 20px 60px' }}>
    <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / Tenders &amp; Procurement</nav>
    <div className="sec-head" style={{ marginTop: 10 }}><div><span className="label">Public procurement</span><h2>Tenders &amp; Procurement</h2></div></div>
    <p className="muted" style={{ maxWidth: 720, marginBottom: 24 }}>Tender documents are protected. Submit payment for the listed fee; finance verifies the payment and an administrator releases the document before it can be downloaded.</p>
    {message && <div className="alert info" role="status" style={{ marginBottom: 18 }}>{message}</div>}
    <div className="card-grid">
      {tenders.map(tender => <article className="card" key={tender.id}>
        <span className="tag">{tender.reference}</span>
        <h3 style={{ marginTop: 10 }}>{tender.title}</h3>
        <p className="muted">{tender.description || 'Tender document available for purchase.'}</p>
        <p style={{ marginTop: 12 }}><strong>{Number(tender.price).toFixed(2)} {tender.currency}</strong></p>
        {tender.deadline && <p className="meta">Deadline: {new Date(tender.deadline).toLocaleString()}</p>}
        <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => choose(tender)}>Pay &amp; request document</button>
      </article>)}
    </div>
    {!tenders.length && <div className="panel"><p className="muted">No open tenders are available.</p></div>}
    {selected && <div className="modal-back" role="presentation" onClick={event => event.target === event.currentTarget && setSelected(null)}>
      <form className="modal" onSubmit={submit}>
        <h3>Pay for {selected.reference}</h3>
        <p className="muted" style={{ marginBottom: 14 }}>{selected.title} · {Number(selected.price).toFixed(2)} {selected.currency}</p>
        <div className="field"><label htmlFor="buyer-name">Buyer name</label><input id="buyer-name" required value={form.payer_name} onChange={e => setForm({ ...form, payer_name: e.target.value })} /></div>
        <div className="field"><label htmlFor="buyer-phone">Phone number</label><input id="buyer-phone" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="field"><label htmlFor="buyer-method">Payment method</label><select id="buyer-method" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option value="bank_transfer">Bank transfer</option><option value="telebirr">Telebirr</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></div>
        {form.method !== 'cash' && <div className="field"><label htmlFor="provider-ref">Transaction reference</label><input id="provider-ref" required value={form.provider_ref} onChange={e => setForm({ ...form, provider_ref: e.target.value })} /></div>}
        {payment && <div className="alert info">Payment reference: <strong className="mono">{payment.reference}</strong><br />Keep this reference and your phone number. The download link appears after verification and release.</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit payment'}</button>{downloadUrl && <a className="btn btn-outline" href={downloadUrl}>Download document</a>}<button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button></div>
      </form>
    </div>}
  </div>;
}
