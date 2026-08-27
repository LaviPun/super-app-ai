/**
 * At-rest encryption for Shop.accessToken (WS-A).
 *
 * Sealed format: "enc1:" + base64(iv|tag|ciphertext) via crypto.server.ts
 * (AES-256-GCM, ENCRYPTION_KEY). openAccessToken passes legacy plaintext
 * through unchanged so code can deploy before scripts/encrypt-shop-tokens.ts
 * re-encrypts existing rows. Every read/write of Shop.accessToken MUST go
 * through these helpers. (Session.accessToken is the Shopify session-storage
 * adapter's column and is intentionally NOT covered — WS-D follow-up.)
 */
import { decryptJson, encryptJson } from '~/services/security/crypto.server';

const SEAL_PREFIX = 'enc1:';

export function sealAccessToken(token: string): string {
  if (!token) return '';
  if (token.startsWith(SEAL_PREFIX)) return token; // idempotent
  return SEAL_PREFIX + encryptJson(token);
}

export function openAccessToken(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith(SEAL_PREFIX)) return stored; // legacy plaintext
  return decryptJson<string>(stored.slice(SEAL_PREFIX.length));
}
