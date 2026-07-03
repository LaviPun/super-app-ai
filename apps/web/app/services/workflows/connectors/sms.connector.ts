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
 * SMS connector (build #7b) — a Twilio-style provider interface, mirroring the
 * EmailConnector pattern.
 *
 * HONEST GATING: the connector CODE ships, but an actual send requires the
 * MERCHANT's provider credentials (account SID + auth token + a from-number). When
 * they're absent, `invoke` returns a `VALIDATION`/`AUTH` error naming the missing
 * config — it NEVER fakes a send. Sendability is centralized in
 * `messagingChannelSendability('sms', env)`.
 *
 * CONSENT: the connector does NOT itself resolve marketing consent — that lives in
 * the runner's per-recipient consent gate (which reads the customer's
 * smsMarketingConsent via the Admin API and skips anyone not SUBSCRIBED). The
 * connector is the transport; it only sends what the consent-gated runner hands it.
 * A `consentVerified` input flag is REQUIRED and must be true, so a caller that
 * forgot to gate consent is refused loudly rather than blasting an un-opted-in phone.
 *
 * Provider shape: Twilio's Messages API (form-encoded POST to
 * /2010-04-01/Accounts/{SID}/Messages.json with Basic auth). `SMS_PROVIDER_API_BASE`
 * overrides the host for a Twilio-compatible gateway or a test double.
 */

const DEFAULT_TWILIO_BASE = 'https://api.twilio.com';

export class SmsConnector implements Connector {
  /** Env seam (injectable for tests). Defaults to process.env. */
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  manifest(): ConnectorManifest {
    return {
      provider: 'sms',
      displayName: 'SMS',
      version: '1.0.0',
      description:
        'Send transactional/marketing SMS via a Twilio-style provider. Requires the merchant provider credentials (account SID, auth token, from-number) and only sends to consent-verified recipients.',
      icon: 'sms',
      auth: {
        // Provider credentials come from the merchant/app config (SID + token), not a
        // per-run OAuth token — matches EmailConnector's api_key/global posture.
        type: 'api_key',
        tokenStore: 'global',
      },
      operations: [
        {
          name: 'send',
          displayName: 'Send SMS',
          description: 'Send one SMS to a consent-verified recipient.',
          inputSchema: {
            type: 'object',
            required: ['to', 'body', 'consentVerified'],
            properties: {
              to: { type: 'string', description: 'Recipient phone number (E.164, e.g. +14155551234)' },
              body: { type: 'string', description: 'Message text', maxLength: 1600 },
              from: { type: 'string', description: 'Sender number (defaults to SMS_PROVIDER_FROM)' },
              consentVerified: {
                type: 'boolean',
                description:
                  'MUST be true — the caller asserts the recipient has opted in to SMS marketing (checked upstream via the Admin API). A false/absent value is refused, never sent.',
              },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
              accepted: { type: 'boolean' },
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
    if (typeof inputs.to !== 'string' || !inputs.to.trim()) {
      errors.push({ path: 'to', message: '"to" (phone number) is required' });
    } else if (!/^\+?[0-9][0-9\s()-]{5,}$/.test(inputs.to)) {
      errors.push({ path: 'to', message: 'Invalid phone number' });
    }
    if (typeof inputs.body !== 'string' || !inputs.body.trim()) {
      errors.push({ path: 'body', message: '"body" is required' });
    }
    if (inputs.consentVerified !== true) {
      errors.push({ path: 'consentVerified', message: 'consentVerified must be true (recipient must have opted in)' });
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    if (req.operation !== 'send') {
      return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }

    // HONEST credentials gate — never fake a send when the provider isn't configured.
    const sendability = messagingChannelSendability('sms', this.env);
    if (sendability.status !== 'ready') {
      return connectorError(
        'AUTH',
        `SMS provider not configured — missing ${sendability.missing.join(', ')}. Set the SMS provider credentials before sending; the connector never fakes a send.`,
      );
    }

    // Consent firewall — refuse a send the caller did not consent-gate.
    if (req.inputs.consentVerified !== true) {
      return connectorError(
        'VALIDATION',
        'Refusing SMS: consentVerified is not true (recipient must be opted in to SMS marketing).',
      );
    }

    const to = typeof req.inputs.to === 'string' ? req.inputs.to.trim() : '';
    const body = typeof req.inputs.body === 'string' ? req.inputs.body : '';
    if (!to || !body) {
      return connectorError('VALIDATION', 'SMS send requires "to" and "body".');
    }

    // Credentials: prefer the auth context's apiKey (auth token) when provided, else env.
    const accountSid = this.env.SMS_PROVIDER_ACCOUNT_SID?.trim() ?? '';
    const authToken =
      (auth.type === 'api_key' && auth.apiKey ? auth.apiKey : undefined) ??
      this.env.SMS_PROVIDER_AUTH_TOKEN?.trim() ??
      '';
    const from =
      (typeof req.inputs.from === 'string' && req.inputs.from.trim() ? req.inputs.from.trim() : undefined) ??
      this.env.SMS_PROVIDER_FROM?.trim() ??
      '';
    if (!accountSid || !authToken || !from) {
      return connectorError('AUTH', 'SMS provider credentials incomplete (accountSid / authToken / from).');
    }

    const base = this.env.SMS_PROVIDER_API_BASE?.trim() || DEFAULT_TWILIO_BASE;
    const url = `${base.replace(/\/+$/, '')}/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

    const form = new URLSearchParams();
    form.set('To', to);
    form.set('From', from);
    form.set('Body', body);

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(req.timeoutMs) && req.timeoutMs > 0 ? req.timeoutMs : 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${base64(`${accountSid}:${authToken}`)}`,
        },
        body: form.toString(),
        signal: controller.signal,
      });

      const responseText = await res.text();

      if (res.status === 429) {
        return connectorError('RATE_LIMIT', 'SMS provider rate limited', {
          retryable: true,
          retryAfterMs: parseRetryAfterMs(res.headers.get('Retry-After')) ?? 5000,
        });
      }
      if (res.status >= 500) {
        return connectorError('UPSTREAM', `SMS provider returned ${res.status}`, { retryable: true });
      }
      if (!res.ok) {
        return connectorError('UPSTREAM', `SMS provider returned ${res.status}: ${responseText.slice(0, 300) || 'unknown error'}`);
      }

      const messageId = parseSid(responseText);
      return connectorSuccess({ messageId, accepted: true }, { statusCode: res.status });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', 'SMS provider timed out', { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

function base64(s: string): string {
  // Node + workers both expose Buffer/btoa; prefer Buffer where available.
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
  return btoa(s);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n * 1000);
}

function parseSid(responseText: string): string {
  if (!responseText) return `sms-${Date.now()}`;
  try {
    const parsed = JSON.parse(responseText) as { sid?: string };
    if (parsed.sid && parsed.sid.trim()) return parsed.sid;
  } catch {
    // Non-JSON provider response — fall back to a synthetic id.
  }
  return `sms-${Date.now()}`;
}
