import { describe, expect, it } from 'vitest';
import { isReferenceLocalPromptRouterBaseUrl } from '~/services/ai/assistant-router-local.server';

describe('isReferenceLocalPromptRouterBaseUrl', () => {
  it('matches default dev router bases', () => {
    expect(isReferenceLocalPromptRouterBaseUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isReferenceLocalPromptRouterBaseUrl('http://127.0.0.1:8787/')).toBe(true);
    expect(isReferenceLocalPromptRouterBaseUrl('http://localhost:8787')).toBe(true);
    expect(isReferenceLocalPromptRouterBaseUrl('http://localhost:8787/v1')).toBe(false);
  });

  it('rejects non-reference hosts and ports', () => {
    expect(isReferenceLocalPromptRouterBaseUrl('https://example.modal.run')).toBe(false);
    expect(isReferenceLocalPromptRouterBaseUrl('http://127.0.0.1:8788')).toBe(false);
    expect(isReferenceLocalPromptRouterBaseUrl('http://192.168.1.5:8787')).toBe(false);
  });
});
