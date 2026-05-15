import 'server-only';
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('SETTINGS_ENCRYPTION_KEY env var is not set');
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < 28) {
    throw new Error('Ciphertext too short to contain IV+tag');
  }
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function lastFour(plaintext: string): string {
  return plaintext.length <= 4 ? plaintext : plaintext.slice(-4);
}
