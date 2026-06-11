import { describe, expect, it } from 'vitest';
import {
  PREVIEW_SHELL_CSP,
  buildPreviewContentUrl,
  buildPreviewEnvelopeUrl,
} from '../lib/preview-sandbox';

describe('frontend preview sandbox shell', () => {
  it('builds API URLs for envelope and content endpoints', () => {
    expect(
      buildPreviewEnvelopeUrl({ shopId: 'shop_1', moduleId: 'module_1', assetId: 'preview_module_1' }),
    ).toBe('http://localhost:3002/v1/preview/shop_1/module_1/envelope?assetId=preview_module_1');

    expect(
      buildPreviewContentUrl({ shopId: 'shop_1', moduleId: 'module_1', assetId: 'preview_module_1' }),
    ).toBe('http://localhost:3002/v1/preview/shop_1/module_1/content?assetId=preview_module_1');
  });

  it('defines a restrictive shell CSP with frame-src for the sandbox iframe', () => {
    expect(PREVIEW_SHELL_CSP).toContain("default-src 'none'");
    expect(PREVIEW_SHELL_CSP).toContain('frame-src');
  });
});
