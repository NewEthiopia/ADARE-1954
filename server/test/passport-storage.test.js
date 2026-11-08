import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptPassport, encryptPassport } from '../src/passport-storage.js';

const testKey = '1'.repeat(64);

test('passport image encryption round-trips with AES-256-GCM', () => {
  const image = Buffer.from('passport image bytes');
  const encrypted = encryptPassport(image, testKey);

  assert.notDeepEqual(encrypted.encryptedData, image);
  assert.deepEqual(decryptPassport(encrypted, testKey), image);
});

test('passport image encryption rejects a wrong key or modified ciphertext', () => {
  const encrypted = encryptPassport(Buffer.from('passport image bytes'), testKey);

  assert.throws(() => decryptPassport(encrypted, '2'.repeat(64)));
  const modified = { ...encrypted, encryptedData: Buffer.from(encrypted.encryptedData) };
  modified.encryptedData[0] ^= 1;
  assert.throws(() => decryptPassport(modified, testKey));
});

test('passport image encryption requires a 256-bit hexadecimal key', () => {
  assert.throws(() => encryptPassport(Buffer.from('image'), 'short'), /64 hexadecimal characters/);
});
