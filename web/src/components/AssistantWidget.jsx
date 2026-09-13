import React, { useState } from 'react';
import { post } from '../lib/api.js';

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([{ from: 'bot', text: 'Hello. I am the Adare Hospital assistant. I can help with appointments, doctors, services, procurement, and contact details.' }]);
  const send = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setMessage(''); setMessages(items => [...items, { from: 'user', text }]); setBusy(true);
    try {
      const data = await post('/assistant/chat', { message: text });
      setMessages(items => [...items, { from: 'bot', text: data.reply, links: data.links }]);
    } catch { setMessages(items => [...items, { from: 'bot', text: 'I am temporarily unavailable. Please call 046 221 1661 or use the Contact page.' }]); }
    finally { setBusy(false); }
  };
  return <>
    <button className="assistant-launcher" aria-label="Open Adare AI assistant" onClick={() => setOpen(value => !value)}>✦ <span>Adare AI</span></button>
    {open && <section className="assistant-panel" aria-label="Adare AI assistant">
      <header><div><strong>Adare AI Assistant</strong><span>Hospital support</span></div><button aria-label="Close assistant" onClick={() => setOpen(false)}>×</button></header>
      <div className="assistant-messages" aria-live="polite">{messages.map((item, index) => <div className={`assistant-message ${item.from}`} key={index}><p>{item.text}</p>{item.links?.map(link => <a href={link.href} key={link.href}>{link.label} →</a>)}</div>)}</div>
      <form onSubmit={send}><input aria-label="Ask Adare AI" placeholder="Ask about the hospital…" value={message} onChange={event => setMessage(event.target.value)} /><button disabled={busy}>{busy ? '…' : 'Send'}</button></form>
    </section>}
  </>;
}
