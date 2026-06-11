import { describe, expect, it } from 'vitest';
import { redactHeaders, redactString, redactValue } from '../redact.js';

describe('redactString', () => {
  it('redacts Shopify access tokens and bearer headers', () => {
    const input = 'Bearer shpat_abcdefghijklmnopqrst and shpca_abcdefghij';
    expect(redactString(input)).toBe('Bearer [REDACTED] and [REDACTED_TOKEN]');
  });

  it('redacts email addresses', () => {
    expect(redactString('contact merchant@example.com')).toBe('contact [REDACTED_EMAIL]');
  });
});

describe('redactValue', () => {
  it('redacts sensitive object keys recursively', () => {
    expect(redactValue({
      api_key: 'secret-value',
      nested: { access_token: 'tok' },
      safe: 'ok',
    })).toEqual({
      api_key: '[REDACTED]',
      nested: { access_token: '[REDACTED]' },
      safe: 'ok',
    });
  });
});

describe('redactHeaders', () => {
  it('redacts authorization and shopify token headers', () => {
    expect(redactHeaders({
      Authorization: 'Bearer abc.def.ghi',
      'X-Shopify-Access-Token': 'shpat_1234567890',
      Accept: 'application/json',
    })).toEqual({
      Authorization: '[REDACTED]',
      'X-Shopify-Access-Token': '[REDACTED]',
      Accept: 'application/json',
    });
  });
});
