import React, { useState } from 'react';
import { post } from '../lib/api.js';

const welcome = {
  from: 'bot',
  text: 'Hello. I am Adare AI, the hospital information assistant. I can help you find appointments, doctors, services, and hospital contacts. I cannot diagnose or recommend treatment. Please do not share private health information in this chat.',
};

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([welcome]);
  const [provider, setProvider] = useState('');
  const [notice, setNotice] = useState('');
  const send = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const history = messages.slice(1).slice(-10).map(item => ({
      role: item.from === 'user' ? 'user' : 'model',
      text: item.text,
    }));
    setMessage('');
    setMessages(items => [...items, { from: 'user', text }]);
    setNotice('');
    setBusy(true);
    try {
      const data = await post('/assistant/chat', { message: text, history });
      setProvider(data.provider || '');
      setNotice(data.notice || '');
      setMessages(items => [...items, { from: 'bot', text: data.reply, links: data.links }]);
    } catch {
      setNotice('');
      setMessages(items => [...items, { from: 'bot', text: 'I am temporarily unavailable. Please call 046 221 1661 or use the Contact page.' }]);
    }
    finally { setBusy(false); }
  };
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  return <>
    <button className="assistant-launcher" aria-label="Open Adare AI assistant" onClick={() => setOpen(value => !value)}>✦ <span>Adare AI</span></button>
    {open && <section className="assistant-panel" aria-label="Adare AI assistant">
      <header><div><strong>Adare AI Assistant</strong><span>{provider === 'gemini' ? 'Powered by Gemini · Hospital information' : 'Hospital information assistant'}</span></div><button aria-label="Close assistant" onClick={() => setOpen(false)}>×</button></header>
      <div className="assistant-messages" aria-live="polite">{messages.map((item, index) => <div className={`assistant-message ${item.from}`} key={index}><p>{item.text}</p>{item.links?.map(link => <a href={link.href} key={link.href}>{link.label} →</a>)}</div>)}{busy && <div className="assistant-message bot" role="status"><p>Adare AI is preparing a reply…</p></div>}</div>
      {notice && <p className="assistant-notice" role="status">{notice}</p>}
      <form onSubmit={send}><input aria-label="Ask Adare AI" placeholder="Ask about the hospital…" value={message} onChange={event => setMessage(event.target.value)} onKeyDown={handleKeyDown} maxLength={1200} /><button disabled={busy || !message.trim()}>{busy ? '…' : 'Send'}</button></form>
      <p className="assistant-disclaimer">Messages may be processed by Google Gemini. For general information only—not diagnosis or treatment advice. Do not share personal or medical information.</p>
    </section>}
  </>;
}
