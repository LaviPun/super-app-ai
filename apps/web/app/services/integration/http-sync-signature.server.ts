import crypto from 'node:crypto';

/**
 * HMAC signing for integration.httpSync (build #7a).
 *
 * Both directions of a merchant-authorized sync carry a signature so the OTHER side
 * can verify the message really came from us (outbound) or from a party holding the
 * shared secret (inbound):
 *   - Store → connected service: we sign the outbound body and send the digest in
 *     `X-SuperApp-Signature` (+ `X-SuperApp-Shop`), so the merchant's tool can verify.
 *   - Connected service → store: the inbound endpoint verifies the same header before
 *     recording anything, so a stranger can't inject rows into a merchant's data store.
 *
 * The signing secret is DERIVED per-shop from the app's `ENCRYPTION_KEY` (the same
 * 32-byte base64 key crypto.server.ts uses) via HKDF-like HMAC, so no new env var or
 * per-connector secret provisioning is required, and the secret is stable across
 * restarts. Honest about its backing: it is the app secret scoped to a shop, not a
 * per-merchant credential they rotate — that would be a follow-up (needs a UI to show
 * the secret + a ConnectorSigningSecret row).
 */

export const HTTP_SYNC_SIGNATURE_HEADER = 'X-SuperApp-Signature';
export const HTTP_SYNC_SHOP_HEADER = 'X-SuperApp-Shop';
export const HTTP_SYNC_TIMESTAMP_HEADER = 'X-SuperApp-Timestamp';

/** Per-shop signing secret derived from the app ENCRYPTION_KEY. */
function shopSigningSecret(shopDomain: string): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing ENCRYPTION_KEY (required to sign httpSync requests)');
  const appKey = Buffer.from(raw, 'base64');
  // Domain-separated derivation so this secret can never be confused with the raw key.
  return crypto.createHmac('sha256', appKey).update(`httpsync:${shopDomain}`).digest();
}

/**
 * Compute the hex HMAC-SHA256 signature over `timestamp.body` for a shop. Binding the
 * timestamp into the signed material lets the receiver reject stale/replayed messages.
 */
export function signHttpSyncBody(shopDomain: string, body: string, timestamp: string): string {
  const secret = shopSigningSecret(shopDomain);
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Headers to attach to an outbound httpSync dispatch so the receiver can verify us. */
export function buildHttpSyncSignatureHeaders(shopDomain: string, body: string): Record<string, string> {
  const timestamp = Date.now().toString();
  return {
    [HTTP_SYNC_SIGNATURE_HEADER]: signHttpSyncBody(shopDomain, body, timestamp),
    [HTTP_SYNC_SHOP_HEADER]: shopDomain,
    [HTTP_SYNC_TIMESTAMP_HEADER]: timestamp,
  };
}

/**
 * Verify an inbound signature (constant-time). `maxSkewMs` rejects a timestamp too far
 * from now (replay window). Returns true only when the digest matches AND the timestamp
 * is fresh. Never throws — a malformed header is simply `false`.
 */
export function verifyHttpSyncSignature(opts: {
  shopDomain: string;
  body: string;
  signature: string | null;
  timestamp: string | null;
  maxSkewMs?: number;
}): boolean {
  const { shopDomain, body, signature, timestamp } = opts;
  const maxSkewMs = opts.maxSkewMs ?? 5 * 60_000;
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxSkewMs) return false;

  let expected: string;
  try {
    expected = signHttpSyncBody(shopDomain, body, timestamp);
  } catch {
    return false;
  }
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
