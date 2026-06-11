import { describe, expect, it } from 'vitest';
import {
  PREVIEW_SANDBOX_CSP,
  PreviewEnvelopeSchema,
  PreviewQuerySchema,
  assertPreviewContentIsRecipeSafe,
  buildPreviewStorageKey,
  defaultPreviewPolicy,
} from '../preview.js';

describe('preview sandbox contracts', () => {
  it('builds deterministic preview storage keys', () => {
    expect(
      buildPreviewStorageKey({
        shopId: 'shop_1',
        moduleId: 'module_1',
        assetId: 'preview_module_1',
        contentType: 'text/html',
      }),
    ).toBe('shops/shop_1/modules/module_1/previews/preview_module_1.html');
  });

  it('parses preview query params with defaults', () => {
    const parsed = PreviewQuerySchema.parse({ shopId: 'shop_1', moduleId: 'mod_1' });
    expect(parsed.assetId).toBe('preview_module_1');
  });

  it('validates preview envelope with strict policy defaults', () => {
    const envelope = PreviewEnvelopeSchema.parse({
      shopId: 'shop_1',
      moduleId: 'module_1',
      version: '1',
      policy: defaultPreviewPolicy(),
      storageKey: 'shops/shop_1/modules/module_1/previews/preview_module_1.html',
      contentType: 'text/html',
      assetId: 'preview_module_1',
    });

    expect(envelope.policy.liquidAllowed).toBe(false);
    expect(envelope.policy.scriptsAllowed).toBe(false);
    expect(envelope.policy.csp).toBe(PREVIEW_SANDBOX_CSP);
  });

  it('rejects unsafe preview HTML at the contract boundary', () => {
    expect(() => assertPreviewContentIsRecipeSafe('<script>alert(1)</script>')).toThrow(/RecipeSpec/);
    expect(() => assertPreviewContentIsRecipeSafe('<div onclick="x()"></div>')).toThrow(/RecipeSpec/);
  });
});
