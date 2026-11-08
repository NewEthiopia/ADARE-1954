import crypto from 'node:crypto';
import { one } from './db.js';
import { config } from './config.js';

const decodeKey = (key) => {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) {
    throw new Error('PASSPORT_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  }
  return Buffer.from(key, 'hex');
};

export function encryptPassport(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', decodeKey(key), iv);
  const encryptedData = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { encryptedData, iv, authenticationTag: cipher.getAuthTag() };
}

export function decryptPassport({ encryptedData, iv, authenticationTag }, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', decodeKey(key), iv);
  decipher.setAuthTag(authenticationTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

export async function savePassportDocument(client, { appointmentId, filePath, extension, buffer }) {
  const { encryptedData, iv, authenticationTag } = encryptPassport(buffer, config.passportEncryptionKey);
  await client.query(
    `INSERT INTO appointment_passport_documents
      (appointment_id, file_path, extension, encryption_iv, authentication_tag, encrypted_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [appointmentId, filePath, extension, iv, authenticationTag, encryptedData]
  );
}

export async function readPassportDocument(filePath) {
  const document = await one(
    `SELECT extension, encryption_iv, authentication_tag, encrypted_data
     FROM appointment_passport_documents WHERE file_path=$1`,
    [filePath]
  );
  if (!document) return null;
  return {
    extension: document.extension,
    image: decryptPassport({
      encryptedData: document.encrypted_data,
      iv: document.encryption_iv,
      authenticationTag: document.authentication_tag,
    }, config.passportEncryptionKey),
  };
}
