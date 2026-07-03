import { describe, it, expect } from 'vitest';
import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';

/**
 * messaging.campaign compiles to a REAL deploy op (SHOP_METAFIELD_SET persisting
 * the campaign config), not a bare AUDIT no-op — the R0.1 deployable⇒non-AUDIT
 * invariant. A deployable type whose compiler only AUDITs would false-publish.
 */

const baseSpec = {
  type: 'messaging.campaign',
  name: 'Back in Stock Waitlist',
  category: 'INTEGRATION',
  requires: [],
  config: {
    channel: 'email',
    trigger: { kind: 'back_in_stock' },
    audience: { source: 'data_store', storeKey: 'waitlist', addressField: 'email', recipients: [] },
    templates: [{ channel: 'email', subject: 'Back!', body: '<p>Back in stock</p>' }],
    batchSize: 200,
    respectConsent: true,
  },
} as unknown as RecipeSpec;

const target = { kind: 'PLATFORM', moduleId: 'mod_1' } as unknown as DeployTarget;

describe('compileMessagingCampaign', () => {
  it('emits a SHOP_METAFIELD_SET op with the serialized config (deployable ⇒ non-AUDIT)', () => {
    const result = compileRecipe(baseSpec, target);
    const metafieldOp = result.ops.find((o) => o.kind === 'SHOP_METAFIELD_SET');
    expect(metafieldOp).toBeDefined();
    if (metafieldOp && metafieldOp.kind === 'SHOP_METAFIELD_SET') {
      expect(metafieldOp.namespace).toBe('$app:superapp_messaging');
      expect(metafieldOp.type).toBe('json');
      const parsed = JSON.parse(metafieldOp.value);
      expect(parsed.config.channel).toBe('email');
      expect(parsed.name).toBe('Back in Stock Waitlist');
    }
  });

  it('has at least one non-AUDIT op (no bare-AUDIT fallthrough)', () => {
    const result = compileRecipe(baseSpec, target);
    const nonAudit = result.ops.filter((o) => o.kind !== 'AUDIT');
    expect(nonAudit.length).toBeGreaterThan(0);
  });

  it('carries the config in compiledJson', () => {
    const result = compileRecipe(baseSpec, target);
    expect(result.compiledJson).toBeDefined();
    expect(JSON.parse(result.compiledJson!).config.channel).toBe('email');
  });
});
