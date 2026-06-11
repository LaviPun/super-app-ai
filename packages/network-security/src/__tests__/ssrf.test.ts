import { describe, expect, it, vi } from 'vitest';
import { promises as dns } from 'node:dns';
import { assertConnectorTargetUrl, assertSafeTargetUrl } from '../index.js';

describe('assertSafeTargetUrl', () => {
  it('rejects https://169.254.169.254 (AWS metadata IP)', async () => {
    await expect(assertSafeTargetUrl('https://169.254.169.254')).rejects.toThrow(/link-local/i);
  });

  it('rejects https://metadata.google.internal', async () => {
    await expect(assertSafeTargetUrl('https://metadata.google.internal')).rejects.toThrow(/metadata/i);
  });

  it('rejects ftp:// and other non-http(s) protocols', async () => {
    await expect(assertSafeTargetUrl('ftp://example.com')).rejects.toThrow();
  });

  it('still allows arbitrary https hosts when they resolve to public addresses', async () => {
    await expect(assertSafeTargetUrl('https://api.openai.com')).resolves.toBeInstanceOf(URL);
  });
});

describe('assertConnectorTargetUrl', () => {
  it('enforces connector hostname allowlists', async () => {
    const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );

    await expect(assertConnectorTargetUrl({
      baseUrl: 'https://api.partner.test',
      path: '/v1/ping',
      allowlistDomains: ['api.partner.test'],
    })).resolves.toBeInstanceOf(URL);

    await expect(assertConnectorTargetUrl({
      baseUrl: 'https://api.partner.test',
      path: '/v1/ping',
      allowlistDomains: ['other.partner.test'],
    })).rejects.toThrow(/allowlisted/i);

    lookup.mockRestore();
  });

  it('rejects non-https connector base URLs', async () => {
    await expect(assertConnectorTargetUrl({
      baseUrl: 'http://api.partner.test',
      path: '/v1/ping',
      allowlistDomains: ['api.partner.test'],
    })).rejects.toThrow(/https/i);
  });
});
