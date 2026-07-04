import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvokeRequest } from '@superapp/core';
import { SmsConnector } from '~/services/workflows/connectors/sms.connector';
import {
  WebPushConnector,
  webPushServiceWorker,
  webPushClientRegistration,
} from '~/services/workflows/connectors/webpush.connector';

/**
 * SMS (Twilio-style) + web-push (VAPID) connectors, build #7b. Both refuse to send
 * when their provider credentials are absent (honest, never a fake send); with creds
 * they perform the real provider call. All network is fetch-mocked.
 */

function makeRequest(operation: string, inputs: Record<string, unknown>): InvokeRequest {
  return { runId: 'run_1', stepId: 'step_1', tenantId: 'tenant_1', operation, inputs, timeoutMs: 2000 };
}

function mockResponse({ status, text = '', headers = {} }: { status: number; text?: string; headers?: Record<string, string> }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
    text: async () => text,
  };
}

const SMS_CREDS = {
  SMS_PROVIDER_ACCOUNT_SID: 'AC123',
  SMS_PROVIDER_AUTH_TOKEN: 'token_secret',
  SMS_PROVIDER_FROM: '+15550000000',
};

describe('SmsConnector', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses to send without provider credentials (never fakes a send)', async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const connector = new SmsConnector({}); // no creds
    const result = await connector.invoke(
      { type: 'none' },
      makeRequest('send', { to: '+15551234567', body: 'hi', consentVerified: true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AUTH');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to send when consent is not verified (consent firewall)', async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const connector = new SmsConnector(SMS_CREDS);
    const result = await connector.invoke(
      { type: 'none' },
      makeRequest('send', { to: '+15551234567', body: 'hi', consentVerified: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends via the Twilio-style Messages endpoint with credentials + consent', async () => {
    const fetchMock = vi.fn(async () => mockResponse({ status: 201, text: JSON.stringify({ sid: 'SM123' }) }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const connector = new SmsConnector(SMS_CREDS);
    const result = await connector.invoke(
      { type: 'api_key', apiKey: 'token_secret' },
      makeRequest('send', { to: '+15551234567', body: 'Flash sale!', consentVerified: true }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.messageId).toBe('SM123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]!;
    expect(url).toContain('/2010-04-01/Accounts/AC123/Messages.json');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(String(init.body)).toContain('To=%2B15551234567'); // form-encoded
  });

  it('validate rejects a missing consent flag', () => {
    const connector = new SmsConnector(SMS_CREDS);
    const v = connector.validate('send', { to: '+15551234567', body: 'x' });
    expect(v.ok).toBe(false);
  });
});

const VAPID_CREDS = {
  // A real P-256 key pair (base64url) so encryption/JWT signing actually runs.
  // Generated deterministically for the test via node:crypto (see below setup).
  VAPID_SUBJECT: 'mailto:ops@shop.com',
} as Record<string, string>;

// Generate a valid VAPID key pair once for the encryption path.
import crypto from 'node:crypto';
function genVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  const pub = ecdh.generateKeys();
  const priv = ecdh.getPrivateKey();
  const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { VAPID_PUBLIC_KEY: b64url(pub), VAPID_PRIVATE_KEY: b64url(priv) };
}

const SUBSCRIPTION = (() => {
  // A valid client subscription: a fresh P-256 public point + a 16-byte auth secret.
  const client = crypto.createECDH('prime256v1');
  const clientPub = client.generateKeys();
  const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {
    endpoint: 'https://push.example.com/send/abc123',
    keys: { p256dh: b64url(clientPub), auth: b64url(crypto.randomBytes(16)) },
  };
})();

describe('WebPushConnector', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses to send without VAPID keys (never fakes a send)', async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const connector = new WebPushConnector({ VAPID_SUBJECT: 'mailto:ops@shop.com' });
    const result = await connector.invoke(
      { type: 'none' },
      makeRequest('send', { subscription: SUBSCRIPTION, payload: { title: 'Hi', body: 'x' } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AUTH');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to send with no subscription (the subscription is the opt-in)', async () => {
    const env = { ...VAPID_CREDS, ...genVapidKeys() };
    const connector = new WebPushConnector(env);
    const result = await connector.invoke(
      { type: 'none' },
      makeRequest('send', { subscription: null, payload: { title: 'Hi' } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION');
  });

  it('encrypts + POSTs a notification to the push endpoint with VAPID + aes128gcm headers', async () => {
    const env = { ...VAPID_CREDS, ...genVapidKeys() };
    const fetchMock = vi.fn(async () => mockResponse({ status: 201 }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const connector = new WebPushConnector(env);
    const result = await connector.invoke(
      { type: 'none' },
      makeRequest('send', { subscription: SUBSCRIPTION, payload: { title: 'Sale', body: '20% off', url: '/collections/sale' } }),
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]!;
    expect(url).toBe(SUBSCRIPTION.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+/);
    expect(headers.TTL).toBeDefined();
  });

  it('reports a gone subscription (410) so the caller can prune it', async () => {
    const env = { ...VAPID_CREDS, ...genVapidKeys() };
    const fetchMock = vi.fn(async () => mockResponse({ status: 410 }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const connector = new WebPushConnector(env);
    const result = await connector.invoke(
      { type: 'none' },
      makeRequest('send', { subscription: SUBSCRIPTION, payload: { title: 'Hi' } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect((result.details as { subscriptionGone?: boolean }).subscriptionGone).toBe(true);
    }
  });

  it('emits a real service-worker + client registration snippet', () => {
    const sw = webPushServiceWorker();
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain('showNotification');
    const reg = webPushClientRegistration('BPublicKey');
    expect(reg).toContain('pushManager.subscribe');
    expect(reg).toContain('BPublicKey');
  });
});

// keep VAPID_CREDS referenced for lint
void VAPID_CREDS;
