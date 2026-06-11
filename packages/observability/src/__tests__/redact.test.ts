import { describe, expect, it } from 'vitest';
import { redact, redactHeaders, redactString, safeErrorMeta, safeMeta } from '../redact.js';

describe('redact', () => {
  it('redacts sensitive keys and inline secrets', () => {
    const input = {
      accessToken: 'shpat_abcdefghijklmnopqrst',
      nested: { api_key: 'abc123' },
      note: 'contact merchant@example.com',
    };
    expect(redact(input)).toEqual({
      accessToken: '[REDACTED]',
      nested: { api_key: '[REDACTED]' },
      note: 'contact [REDACTED_EMAIL]',
    });
  });

  it('redacts authorization headers', () => {
    expect(
      redactHeaders({
        authorization: 'Bearer secret-token',
        'x-request-id': 'req-1',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      'x-request-id': 'req-1',
    });
  });

  it('builds safe error metadata without leaking secrets', () => {
    const err = new Error('failed for merchant@example.com with shpat_abc123xyz');
    const meta = safeErrorMeta(err);
    expect(meta.message).not.toContain('merchant@example.com');
    expect(meta.stack).toBeDefined();
    expect(meta.message).toContain('[REDACTED_EMAIL]');
  });

  it('wraps primitive safeMeta values', () => {
    expect(safeMeta('Bearer abc')).toEqual({ value: 'Bearer [REDACTED]' });
  });
});

describe('redactString', () => {
  it('redacts bearer tokens in free text', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi')).toBe('Authorization: Bearer [REDACTED]');
  });
});
