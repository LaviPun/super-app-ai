import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvokeRequest } from '@superapp/core';
import { EmailConnector } from '~/services/workflows/connectors/email.connector';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(operation: string, inputs: Record<string, unknown>): InvokeRequest {
  return {
    runId: 'run_1',
    stepId: 'step_1',
    tenantId: 'tenant_1',
    operation,
    inputs,
    timeoutMs: 2000,
  };
}

function mockResponse({
  status,
  text,
  headers = {},
}: {
  status: number;
  text: string;
  headers?: Record<string, string>;
}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
      },
    },
    text: async () => text,
  };
}

describe('EmailConnector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('sends through SendGrid by default', async () => {
    const fetchMock = vi.fn(async () => mockResponse({
      status: 202,
      text: '{}',
      headers: { 'x-message-id': 'sg-msg-123' },
    }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    process.env.EMAIL_CONNECTOR_PROVIDER = 'sendgrid';
    process.env.EMAIL_FROM = 'noreply@example.com';

    const connector = new EmailConnector();
    const result = await connector.invoke(
      { type: 'api_key', apiKey: 'sg_api_key' },
      makeRequest('send', { to: 'user@example.com', subject: 'Welcome', body: '<p>Hello</p>' }),
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    expect(calls[0]?.[0]).toBe('https://api.sendgrid.com/v3/mail/send');

    const init = calls[0]![1];
    const headers = init.headers as Record<string, string>;
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(headers.Authorization).toBe('Bearer sg_api_key');
    expect(payload.from).toEqual({ email: 'noreply@example.com' });
    expect(payload.personalizations).toEqual([{ to: [{ email: 'user@example.com' }] }]);
  });

  it('supports generic HTTP mode with configurable auth header', async () => {
    const fetchMock = vi.fn(async () => mockResponse({
      status: 200,
      text: JSON.stringify({ messageId: 'generic-1' }),
    }));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    process.env.EMAIL_CONNECTOR_PROVIDER = 'generic';
    process.env.EMAIL_API_URL = 'https://mail.example.com/send';
    process.env.EMAIL_API_KEY_HEADER = 'X-API-Key';
    process.env.EMAIL_API_KEY_PREFIX = '';
    process.env.EMAIL_FROM = 'noreply@example.com';

    const connector = new EmailConnector();
    const result = await connector.invoke(
      { type: 'api_key', apiKey: 'raw-key' },
      makeRequest('send', { to: 'user@example.com', subject: 'Welcome', body: '<p>Hello</p>' }),
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    expect(calls[0]?.[0]).toBe('https://mail.example.com/send');

    const init = calls[0]![1];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('raw-key');
  });

  it('returns config error when generic provider has no API URL', async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    process.env.EMAIL_CONNECTOR_PROVIDER = 'generic';
    delete process.env.EMAIL_API_URL;
    process.env.EMAIL_FROM = 'noreply@example.com';

    const connector = new EmailConnector();
    const result = await connector.invoke(
      { type: 'api_key', apiKey: 'k' },
      makeRequest('send', { to: 'user@example.com', subject: 'Welcome', body: '<p>Hello</p>' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AUTH');
      expect(result.message).toContain('EMAIL_API_URL');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips internal notifications when ADMIN_EMAIL is missing', async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    process.env.EMAIL_CONNECTOR_PROVIDER = 'sendgrid';
    process.env.EMAIL_FROM = 'noreply@example.com';
    delete process.env.ADMIN_EMAIL;

    const connector = new EmailConnector();
    const result = await connector.invoke(
      { type: 'api_key', apiKey: 'k' },
      makeRequest('sendInternal', { subject: 'Alert', body: 'Something happened.' }),
    );

    expect(result).toEqual({
      ok: true,
      output: { sent: false },
      statusCode: undefined,
      meta: undefined,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
