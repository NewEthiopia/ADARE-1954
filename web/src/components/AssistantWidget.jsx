import React, { useEffect, useRef, useState } from 'react';
import { post } from '../lib/api.js';

const welcome = {
  from: 'bot',
  text: 'Hello! I can help you explore hospital services and share general health education. I cannot diagnose you or replace a clinician. If you may be having an emergency, call 046 221 1661 or go to the Emergency & Trauma Unit.',
};

const suggestions = [
  'How can I prepare for an appointment?',
  'What services does the hospital offer?',
  'When should I seek urgent care?',
];

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([welcome]);
  const [provider, setProvider] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

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
      if (typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The assistant returned an empty response.');
      }
      setProvider(data.provider || '');
      setNotice(data.notice || '');
      setMessages(items => [...items, { from: 'bot', text: data.reply, links: data.links }]);
    } catch (error) {
      setNotice(error.message || 'The assistant could not connect. Please try again.');
      setMessages(items => [...items, { from: 'bot', text: 'I could not get a response just now. Please try again, or call 046 221 1661 for hospital information.' }]);
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
    <button className="assistant-launcher" aria-label={open ? 'Close Adare assistant' : 'Open Adare assistant'} aria-expanded={open} aria-controls="assistant-panel" onClick={() => setOpen(value => !value)}>
      <span className="assistant-launcher-icon" aria-hidden="true">✦</span><span>Ask Adare AI</span>
    </button>
    {open && <section className="assistant-panel" id="assistant-panel" aria-label="Adare AI assistant">
      <header className="assistant-header">
        <div className="assistant-avatar" aria-hidden="true">✦</div>
        <div className="assistant-heading"><strong>Adare AI</strong><span>Hospital & general health information</span></div>
        <span className="assistant-online" aria-label="Available"><i /></span>
        <button aria-label="Close assistant" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="assistant-safety"><span aria-hidden="true">ⓘ</span> Not a clinician or emergency service. Never share personal health details.</div>
      <div className="assistant-messages" ref={messagesRef} aria-live="polite" aria-relevant="additions text">
        {messages.map((item, index) => <div className={`assistant-message ${item.from}`} key={index}>
          {item.from === 'bot' && <span className="assistant-message-avatar" aria-hidden="true">✦</span>}
          <div className="assistant-message-content"><p>{item.text}</p>{item.links?.map(link => <a href={link.href} key={link.href}>{link.label} <span aria-hidden="true">→</span></a>)}</div>
        </div>)}
        {messages.length === 1 && <div className="assistant-suggestions" aria-label="Suggested questions">
          <span>Try asking</span>
          {suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => { setMessage(suggestion); inputRef.current?.focus(); }}>{suggestion}</button>)}
        </div>}
        {busy && <div className="assistant-message bot" role="status"><span className="assistant-message-avatar" aria-hidden="true">✦</span><div className="assistant-message-content assistant-typing"><i /><i /><i /><span className="sr-only">Adare AI is preparing a reply</span></div></div>}
      </div>
      {notice && <p className="assistant-notice" role="status">{notice}</p>}
      <form className="assistant-compose" onSubmit={send}>
        <input ref={inputRef} aria-label="Ask Adare AI" placeholder="Ask a question…" value={message} onChange={event => setMessage(event.target.value)} onKeyDown={handleKeyDown} maxLength={1200} />
        <button aria-label="Send message" disabled={busy || !message.trim()}>{busy ? '…' : <span aria-hidden="true">↑</span>}</button>
      </form>
      <p className="assistant-disclaimer">{provider === 'gemini' ? 'AI can make mistakes. General information only—not diagnosis, treatment, or a substitute for a healthcare professional. Messages may be processed by Google Gemini.' : 'AI health education is unavailable until configured. For personal medical concerns, contact a qualified healthcare professional.'}</p>
    </section>}
  </>;
}
