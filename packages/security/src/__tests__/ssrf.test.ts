import { describe, expect, it } from 'vitest';
import { assertSafeTargetUrl, parseAllowlistFromEnv } from '../ssrf.js';

describe('ssrf allowlist', () => {
  it('blocks private IPv4 literals', async () => {
    await expect(assertSafeTargetUrl('https://10.0.0.1/path')).rejects.toThrow(/private/i);
  });

  it('enforces hostname allowlist when provided', async () => {
    await expect(
      assertSafeTargetUrl('https://evil.example/path', {
        allowedHostnames: ['api.example.com'],
      }),
    ).rejects.toThrow(/allowlisted/i);
  });

  it('parses comma-separated allowlist env values', () => {
    expect(parseAllowlistFromEnv(' API.Example.com, hooks.shopify.com ')).toEqual([
      'api.example.com',
      'hooks.shopify.com',
    ]);
  });
});
