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
  it('allows http://127.0.0.1 with port', () => {
    expect(() => assertSafeTargetUrl('http://127.0.0.1:11434')).not.toThrow();
  });

  it('allows http://localhost with port', () => {
    expect(() => assertSafeTargetUrl('http://localhost:8787')).not.toThrow();
  });

  it('rejects http hostnames that masquerade as localhost', () => {
    expect(() => assertSafeTargetUrl('http://localhost.attacker.com')).toThrow(
      /must be https or localhost http/i,
    );
  });

  it('rejects https://169.254.169.254 (AWS metadata IP)', () => {
    expect(() => assertSafeTargetUrl('https://169.254.169.254')).toThrow(/link-local/i);
  });

  it('rejects https://metadata.google.internal', () => {
    expect(() => assertSafeTargetUrl('https://metadata.google.internal')).toThrow(/metadata/i);
  });

  it('rejects https://[fe80::1] link-local IPv6', () => {
    expect(() => assertSafeTargetUrl('https://[fe80::1]')).toThrow(/link-local IPv6/i);
  });

  it('allows allowlisted internal host via INTERNAL_AI_ALLOW_HOSTS', () => {
    process.env.INTERNAL_AI_ALLOW_HOSTS = 'internal.svc.cluster.local';
    expect(() => assertSafeTargetUrl('https://internal.svc.cluster.local')).not.toThrow();
  });

  it('still allows arbitrary https hosts (default permissive https)', () => {
    expect(() => assertSafeTargetUrl('https://api.openai.com')).not.toThrow();
  });

  it('rejects ftp:// and other non-http(s) protocols', () => {
    expect(() => assertSafeTargetUrl('ftp://example.com')).toThrow();
  });

  it('allowlist override applies even to link-local hosts', () => {
    process.env.INTERNAL_AI_ALLOW_HOSTS = '169.254.169.254, metadata.google.internal';
    expect(() => assertSafeTargetUrl('https://169.254.169.254')).not.toThrow();
    expect(() => assertSafeTargetUrl('https://metadata.google.internal')).not.toThrow();
  });
});
