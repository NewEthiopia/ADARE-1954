// Grounded hospital support assistant. It provides navigation and operational help,
// never diagnosis or emergency treatment instructions.
import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db.js';
import { ok, fail, wrap, validate } from '../http.js';

export const assistantRouter = Router();
const chatSchema = z.object({ message: z.string().trim().min(1).max(800) });

assistantRouter.post('/chat', validate(chatSchema), wrap(async (req, res) => {
  const message = req.body.message.toLowerCase();
  let reply = 'I can help you find services, doctors, appointments, tenders, and hospital contact information. What would you like to do?';
  const links = [];
  if (/emergency|urgent|ambulance|trauma/.test(message)) {
    reply = 'For a medical emergency, come directly to Adare General Hospital Emergency & Trauma Unit, open 24 hours every day. Call 046 221 1661. I cannot assess emergencies or provide diagnosis in chat.';
    links.push({ label: 'Emergency information', href: '/emergency' });
  } else if (/appointment|book|visit/.test(message)) {
    reply = 'You can request an appointment online. Reception confirms the request and provides the next steps.';
    links.push({ label: 'Book an appointment', href: '/appointments' });
  } else if (/doctor|specialist|physician/.test(message)) {
    const doctors = (await q(`SELECT id, full_name, title FROM doctors WHERE is_active ORDER BY full_name LIMIT 5`)).rows;
    reply = doctors.length ? `These doctors are currently listed: ${doctors.map(d => `${d.full_name} (${d.title || 'health professional'})`).join('; ')}.` : 'The doctor directory is temporarily unavailable.';
    links.push({ label: 'Find a doctor', href: '/doctors' });
  } else if (/tender|procurement|chereta|document|bid/.test(message)) {
    reply = 'Tender documents are listed in Procurement. Buyers submit the listed fee; finance verifies payment, then an administrator releases the download.';
    links.push({ label: 'Open procurement', href: '/procurement' });
  } else if (/service|department|clinic|pharmacy|laboratory/.test(message)) {
    reply = 'I can help you browse hospital departments and services. Emergency care is available 24/7.';
    links.push({ label: 'Browse services', href: '/services' }, { label: 'Browse departments', href: '/departments' });
  } else if (/contact|phone|address|location|call/.test(message)) {
    reply = 'Adare General Hospital is in Hawassa, Sidama Regional State, Ethiopia. Emergency and hospital contact: 046 221 1661.';
    links.push({ label: 'Contact the hospital', href: '/contact' });
  } else if (/hello|hi|selam|ሰላም/.test(message)) {
    reply = 'Hello. I am the Adare General Hospital assistant. I can help with appointments, services, doctors, procurement, and contact details.';
  }
  ok(res, { reply, links }, 'Assistant response');
}));
