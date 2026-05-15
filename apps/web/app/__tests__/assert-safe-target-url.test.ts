import { afterEach, describe, expect, it } from 'vitest';
import { assertSafeTargetUrl } from '~/services/ai/internal-assistant.server';

const ORIGINAL_ALLOW_HOSTS = process.env.INTERNAL_AI_ALLOW_HOSTS;

afterEach(() => {
  if (ORIGINAL_ALLOW_HOSTS === undefined) {
    delete process.env.INTERNAL_AI_ALLOW_HOSTS;
  } else {
    process.env.INTERNAL_AI_ALLOW_HOSTS = ORIGINAL_ALLOW_HOSTS;
  }
});

describe('assertSafeTargetUrl', () => {
  it('allows http://127.0.0.1 with port', async () => {
    await expect(assertSafeTargetUrl('http://127.0.0.1:11434')).resolves.toBeInstanceOf(URL);
  });

  it('allows http://localhost with port', async () => {
    await expect(assertSafeTargetUrl('http://localhost:8787')).resolves.toBeInstanceOf(URL);
  });

  it('rejects http hostnames that masquerade as localhost', async () => {
    await expect(assertSafeTargetUrl('http://localhost.attacker.com')).rejects.toThrow(
      /only allowed for localhost hosts/i,
    );
  });

  it('rejects https://169.254.169.254 (AWS metadata IP)', async () => {
    await expect(assertSafeTargetUrl('https://169.254.169.254')).rejects.toThrow(/link-local/i);
  });

  it('rejects https://metadata.google.internal', async () => {
    await expect(assertSafeTargetUrl('https://metadata.google.internal')).rejects.toThrow(/metadata/i);
  });

  it('rejects https://[fe80::1] link-local IPv6', async () => {
    await expect(assertSafeTargetUrl('https://[fe80::1]')).rejects.toThrow(/link-local IPv6/i);
  });

  it('still allows arbitrary https hosts when they resolve to public addresses', async () => {
    await expect(assertSafeTargetUrl('https://api.openai.com')).resolves.toBeInstanceOf(URL);
  });

  it('rejects ftp:// and other non-http(s) protocols', async () => {
    await expect(assertSafeTargetUrl('ftp://example.com')).rejects.toThrow();
  });

  it('supports explicit localhost http override entries', async () => {
    process.env.INTERNAL_AI_ALLOW_HOSTS = 'devbox.localhost';
    await expect(assertSafeTargetUrl('http://devbox.localhost:4010')).resolves.toBeInstanceOf(URL);
  });
});
