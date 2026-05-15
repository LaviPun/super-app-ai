import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as dns } from 'node:dns';
import { assertSafeTargetUrl } from '~/services/security/ssrf.server';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ssrf guard', () => {
  it('allows https targets with public DNS addresses', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '8.8.8.8', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
    await expect(assertSafeTargetUrl('https://api.example.com')).resolves.toBeInstanceOf(URL);
  });

  it('requires https unless localhost http is explicitly enabled', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
    await expect(assertSafeTargetUrl('http://api.example.com')).rejects.toThrow(/must use https/i);
  });

  it('allows localhost http only when explicitly enabled', async () => {
    await expect(
      assertSafeTargetUrl('http://127.0.0.1:3000', { allowHttpLocalhost: true }),
    ).resolves.toBeInstanceOf(URL);
  });

  it('rejects cloud metadata hostnames', async () => {
    await expect(assertSafeTargetUrl('https://metadata.google.internal')).rejects.toThrow(/metadata/i);
  });

  it('rejects private IPv4 from DNS resolution', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '10.10.10.10', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
    await expect(assertSafeTargetUrl('https://internal.example.com')).rejects.toThrow(/private ipv4/i);
  });

  it('rejects when any resolved address is blocked', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [
        { address: '8.8.8.8', family: 4 },
        { address: '192.168.1.8', family: 4 },
      ] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
    await expect(assertSafeTargetUrl('https://mixed.example.com')).rejects.toThrow(/private ipv4/i);
  });

  it('rejects CGNAT and reserved ranges', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '100.64.1.5', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
    await expect(assertSafeTargetUrl('https://cgnat.example.com')).rejects.toThrow(/cgnat/i);
  });

  it('rejects IPv4-mapped IPv6 addresses', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '::ffff:127.0.0.1', family: 6 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
    await expect(assertSafeTargetUrl('https://mapped.example.com')).rejects.toThrow(/IPv4-mapped IPv6/i);
  });
});
