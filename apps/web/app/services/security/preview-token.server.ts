import { encryptJson, decryptJson } from '~/services/security/crypto.server';

const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutes — long enough for the merchant's window.open to load

type PreviewTokenPayload = { shop: string; moduleId: string; exp: number };

/** Opaque, tamper-proof (AES-256-GCM) capability token binding a preview link
 *  to exactly one (shop, moduleId) pair for a short window — replaces trusting
 *  a raw `?shop=` query param (WS-F: preview.$moduleId.tsx had no auth on this path). */
export function mintPreviewToken(input: { shop: string; moduleId: string }, ttlMs = DEFAULT_TTL_MS): string {
  const payload: PreviewTokenPayload = { shop: input.shop, moduleId: input.moduleId, exp: Date.now() + ttlMs };
  return encryptJson(payload);
}

export function verifyPreviewToken(token: string, expected: { moduleId: string }): { shop: string } {
  let payload: PreviewTokenPayload;
  try {
    payload = decryptJson<PreviewTokenPayload>(token);
  } catch {
    throw new Error('Invalid preview token');
  }
  if (payload.moduleId !== expected.moduleId) throw new Error('Preview token does not match this module');
  if (Date.now() > payload.exp) throw new Error('Preview token expired');
  return { shop: payload.shop };
}
