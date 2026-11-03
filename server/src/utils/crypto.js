import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export const SESSION_TOKEN_BYTES = 32;

export function createSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * Sessions are addressed by a public id plus a secret capability token. Only an
 * HMAC of the token is stored, so a database leak does not grant access.
 */
export function hashSessionToken(token, secret = env.SESSION_SECRET) {
  return createHmac('sha256', secret).update(String(token)).digest('hex');
}

export function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashContent(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function stableId(...parts) {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}
