import crypto from 'node:crypto';
import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess, messagingChannelSendability } from '@superapp/core';

/**
 * Web-push connector (build #7b) — VAPID + service-worker, mirroring the connector
 * pattern.
 *
 * This is the REAL Web Push Protocol (RFC 8030 delivery, RFC 8291 aes128gcm payload
 * encryption, RFC 8292 VAPID JWT authorization), implemented on `node:crypto` (no new
 * dependency). It POSTs an encrypted notification to the browser push service endpoint
 * carried on the recipient's push subscription.
 *
 * HONEST GATING: the connector CODE ships, but a send requires the app's VAPID key
 * pair + subject. Absent those, `invoke` returns an `AUTH` error naming the missing
 * config — it NEVER fakes a send. Sendability is centralized in
 * `messagingChannelSendability('push', env)`.
 *
 * CONSENT / SUBSCRIPTION: a web-push subscription IS the opt-in — a browser only hands
 * an app a PushSubscription after the user grants notification permission. The
 * connector checks the subscription is present + well-formed (endpoint + p256dh + auth
 * keys) and refuses to send without it. The runner additionally treats a recipient
 * with no/withdrawn subscription as a skip (never a fake send).
 *
 * The service-worker registration piece (the client-side `pushManager.subscribe`
 * that produces the subscription) is emitted by `webPushServiceWorker()` /
 * `webPushClientRegistration()` below — served by the app so a storefront/customer
 * surface can register and capture the subscription into a DataStore list.
 */

type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Optional expiration (ms epoch); an expired subscription is treated as withdrawn. */
  expirationTime?: number | null;
};

const DEFAULT_TTL_SECONDS = 2419200; // 28 days, the RFC 8030 max commonly accepted.

export class WebPushConnector implements Connector {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  manifest(): ConnectorManifest {
    return {
      provider: 'webpush',
      displayName: 'Web Push',
      version: '1.0.0',
      description:
        'Send a browser push notification to a VAPID web-push subscription. Requires the app VAPID key pair + subject; only sends to a present, well-formed subscription (the subscription is the opt-in).',
      icon: 'bell',
      auth: {
        // VAPID keys are app-level config (like EmailConnector's global api_key), not a
        // per-run OAuth token.
        type: 'none',
      },
      operations: [
        {
          name: 'send',
          displayName: 'Send push notification',
          description: 'Send one encrypted web-push notification to a subscription.',
          inputSchema: {
            type: 'object',
            required: ['subscription', 'payload'],
            properties: {
              subscription: {
                type: 'object',
                description: 'The browser PushSubscription (endpoint + keys.p256dh + keys.auth).',
              },
              payload: {
                type: 'object',
                description: 'Notification payload (title, body, url, icon). Serialized + encrypted.',
              },
              ttlSeconds: { type: 'number', description: 'Push service TTL (seconds).' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              accepted: { type: 'boolean' },
              statusCode: { type: 'number' },
              /** True when the push service reports the subscription is gone (410/404) — caller should prune it. */
              subscriptionGone: { type: 'boolean' },
            },
          },
          idempotency: { supported: false },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'], rateLimitStrategy: 'respect-retry-after' },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    if (operation !== 'send') {
      return { ok: false, errors: [{ path: 'operation', message: `Unknown operation: ${operation}` }] };
    }
    const errors: { path: string; message: string }[] = [];
    const sub = asSubscription(inputs.subscription);
    if (!sub) {
      errors.push({ path: 'subscription', message: 'A valid push subscription (endpoint + keys.p256dh + keys.auth) is required' });
    }
    if (inputs.payload == null || typeof inputs.payload !== 'object') {
      errors.push({ path: 'payload', message: 'payload (object) is required' });
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(_auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    if (req.operation !== 'send') {
      return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }

    // HONEST credentials gate — never fake a send when VAPID isn't configured.
    const sendability = messagingChannelSendability('push', this.env);
    if (sendability.status !== 'ready') {
      return connectorError(
        'AUTH',
        `Web-push not configured — missing ${sendability.missing.join(', ')}. Set the VAPID key pair + subject before sending; the connector never fakes a send.`,
      );
    }

    const sub = asSubscription(req.inputs.subscription);
    if (!sub) {
      // No subscription = no opt-in. Refuse loudly rather than pretend to send.
      return connectorError('VALIDATION', 'Refusing push: recipient has no valid push subscription (endpoint + keys).');
    }
    if (typeof sub.expirationTime === 'number' && sub.expirationTime > 0 && sub.expirationTime < Date.now()) {
      return connectorError('VALIDATION', 'Refusing push: subscription is expired (withdrawn).', {
        details: { subscriptionGone: true },
      });
    }

    const payloadObj = (req.inputs.payload as Record<string, unknown>) ?? {};
    const ttl = Number.isFinite(Number(req.inputs.ttlSeconds)) ? Number(req.inputs.ttlSeconds) : DEFAULT_TTL_SECONDS;

    const publicKey = this.env.VAPID_PUBLIC_KEY!.trim();
    const privateKey = this.env.VAPID_PRIVATE_KEY!.trim();
    const subject = this.env.VAPID_SUBJECT!.trim();

    let headers: Record<string, string>;
    let body: Blob;
    try {
      const encrypted = encryptPayload(JSON.stringify(payloadObj), sub);
      const vapid = buildVapidHeaders(sub.endpoint, subject, publicKey, privateKey);
      headers = {
        ...vapid,
        TTL: String(ttl),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      };
      // A Blob is a valid BodyInit under the web fetch types (avoids the
      // Buffer/Uint8Array ArrayBufferLike mismatch). Copy the bytes into it.
      body = new Blob([new Uint8Array(encrypted)], { type: 'application/octet-stream' });
    } catch (err) {
      return connectorError('VALIDATION', `Web-push encryption/VAPID failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(req.timeoutMs) && req.timeoutMs > 0 ? req.timeoutMs : 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      // 404/410 → the subscription is gone; surface it so the runner prunes it.
      if (res.status === 404 || res.status === 410) {
        return connectorError('NOT_FOUND', `Push subscription gone (${res.status})`, {
          details: { subscriptionGone: true },
        });
      }
      if (res.status === 429) {
        return connectorError('RATE_LIMIT', 'Push service rate limited', {
          retryable: true,
          retryAfterMs: parseRetryAfterMs(res.headers.get('Retry-After')) ?? 5000,
        });
      }
      if (res.status >= 500) {
        return connectorError('UPSTREAM', `Push service returned ${res.status}`, { retryable: true });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return connectorError('UPSTREAM', `Push service returned ${res.status}: ${text.slice(0, 200) || 'unknown error'}`);
      }

      return connectorSuccess({ accepted: true, statusCode: res.status, subscriptionGone: false });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', 'Push service timed out', { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Subscription parsing ──────────────────────────────────────────────────────

function asSubscription(raw: unknown): PushSubscription | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const endpoint = typeof s.endpoint === 'string' ? s.endpoint : undefined;
  const keys = s.keys && typeof s.keys === 'object' ? (s.keys as Record<string, unknown>) : undefined;
  const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh : undefined;
  const auth = keys && typeof keys.auth === 'string' ? keys.auth : undefined;
  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !auth) return undefined;
  return {
    endpoint,
    keys: { p256dh, auth },
    expirationTime: typeof s.expirationTime === 'number' ? s.expirationTime : null,
  };
}

// ─── VAPID (RFC 8292) — ES256 JWT signed with the VAPID private key ─────────────

function buildVapidHeaders(
  endpoint: string,
  subject: string,
  publicKeyB64Url: string,
  privateKeyB64Url: string,
): Record<string, string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 3600, // ≤ 24h per spec; 12h is a safe margin.
    sub: subject.startsWith('mailto:') || subject.startsWith('https://') ? subject : `mailto:${subject}`,
  };
  const unsigned = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(claims)))}`;

  // The VAPID private key is a raw 32-byte P-256 scalar (base64url). Rebuild a JWK
  // from the scalar + the uncompressed public point to sign with node:crypto.
  const privKeyObject = privateKeyToKeyObject(privateKeyB64Url, publicKeyB64Url);
  const derSig = crypto.sign('sha256', Buffer.from(unsigned), { key: privKeyObject, dsaEncoding: 'ieee-p1363' });
  const jwt = `${unsigned}.${b64url(derSig)}`;

  return {
    Authorization: `vapid t=${jwt}, k=${publicKeyB64Url}`,
  };
}

function privateKeyToKeyObject(privateKeyB64Url: string, publicKeyB64Url: string): crypto.KeyObject {
  const d = b64urlDecode(privateKeyB64Url);
  const pub = b64urlDecode(publicKeyB64Url); // 65-byte uncompressed point (0x04 || x || y)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  }
  const x = pub.subarray(1, 33);
  const y = pub.subarray(33, 65);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: b64url(d),
    x: b64url(x),
    y: b64url(y),
  };
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

// ─── Payload encryption (RFC 8291 / RFC 8188 aes128gcm) ─────────────────────────

function encryptPayload(plaintext: string, sub: PushSubscription): Buffer {
  const clientPub = b64urlDecode(sub.keys.p256dh); // 65-byte uncompressed point
  const authSecret = b64urlDecode(sub.keys.auth); // 16 bytes

  // Ephemeral server ECDH key pair (P-256).
  const server = crypto.createECDH('prime256v1');
  const serverPub = server.generateKeys(); // uncompressed 65 bytes
  const sharedSecret = server.computeSecret(clientPub);

  const salt = crypto.randomBytes(16);

  // RFC 8291 §3.4: PRK_key = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_pub || as_pub, 32)
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientPub,
    serverPub,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  // Content encryption key + nonce (RFC 8188).
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  // aes128gcm: single record. Plaintext padded with a 0x02 delimiter (last record).
  const record = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final()]);
  const tag = cipher.getAuthTag();

  // aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(as_pub).
  const rs = 4096;
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header.writeUInt8(serverPub.length, 20);

  return Buffer.concat([header, serverPub, ciphertext, tag]);
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const output = crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([0x01])])).digest();
  return output.subarray(0, length);
}

// ─── base64url helpers ──────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n * 1000);
}

// ─── Service-worker registration piece ───────────────────────────────────────────

/**
 * The service-worker script a storefront/customer surface registers to receive web
 * push. Served by the app (e.g. at `/webpush/sw.js`) so the browser can register it
 * and `pushManager.subscribe` against the app's VAPID public key. Pure string — no
 * side effects; the route handler returns it with `Content-Type: application/javascript`.
 */
export function webPushServiceWorker(): string {
  return `/* SuperApp web-push service worker */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  var title = data.title || 'Notification';
  var options = {
    body: data.body || '',
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
`;
}

/**
 * The client registration snippet a surface runs to register the service worker and
 * capture a subscription (POSTed to `captureUrl`, which persists it into a DataStore
 * list the campaign audience resolves against). VAPID public key is the app's.
 */
export function webPushClientRegistration(vapidPublicKey: string, opts: { swUrl?: string; captureUrl?: string } = {}): string {
  const swUrl = opts.swUrl ?? '/webpush/sw.js';
  const captureUrl = opts.captureUrl ?? '/webpush/subscribe';
  return `(async function () {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') return;
  var reg = await navigator.serviceWorker.register(${JSON.stringify(swUrl)});
  function urlB64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  var sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(${JSON.stringify(vapidPublicKey)}),
  });
  await fetch(${JSON.stringify(captureUrl)}, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
})();`;
}
