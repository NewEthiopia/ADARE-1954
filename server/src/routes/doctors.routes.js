// Staff-only doctor image management.
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { one } from '../db.js';
import { ok, fail, wrap } from '../http.js';
import { requireAuth, requireRole, audit } from '../auth.js';
import { config } from '../config.js';

export const doctorsAdminRouter = Router();
doctorsAdminRouter.use(requireAuth, requireRole('content_manager'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
const signatures = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];
function imageType(buffer) {
  return signatures.find(s => s.bytes.every((value, index) => buffer[index] === value) && (s.ext !== 'webp' || buffer.slice(8, 12).toString() === 'WEBP'))?.ext;
}

doctorsAdminRouter.post('/:id(\\d+)/photo', upload.single('photo'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) throw fail(422, 'VALIDATION', 'Attach a doctor photo using the photo field.');
  const ext = imageType(req.file.buffer);
  if (!ext) throw fail(415, 'UPLOAD_TYPE', 'Doctor photos must be JPEG, PNG, or WebP images.');
  const doctor = await one('SELECT id, full_name FROM doctors WHERE id=$1', [id]);
  if (!doctor) throw fail(404, 'NOT_FOUND', 'Doctor not found.');
  const dir = path.join(config.uploadDir, 'doctors');
  fs.mkdirSync(dir, { recursive: true });
  const name = `doctor-${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), req.file.buffer, { mode: 0o644 });
  const photoPath = `/uploads/doctors/${name}`;
  await one('UPDATE doctors SET photo_path=$1, updated_at=now() WHERE id=$2 RETURNING id, photo_path', [photoPath, id]);
  await audit(req, 'DOCTOR_PHOTO_UPLOADED', 'doctors', id, name);
  ok(res, { photo_path: photoPath }, 'Doctor photo uploaded');
}));
