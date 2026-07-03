import { describe, it, expect } from 'vitest';
import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { checkNonDestructive } from '~/services/recipes/compiler/non-destructive';

/**
 * flow.automation compiles to a REAL deploy op (SHOP_METAFIELD_SET persisting the
 * flow definition), not a bare AUDIT no-op — the R0.1 deployable⇒non-AUDIT invariant.
 * A deployable type whose compiler only AUDITs would false-publish.
 */

const baseSpec = {
  type: 'flow.automation',
  name: 'Tag VIP Orders',
  category: 'FLOW',
  requires: [],
  config: {
    trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
    steps: [
      { kind: 'TAG_ORDER', tags: 'vip,priority' },
      { kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 },
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'ops@shop.test', subject: 'VIP order', body: '<p>hi</p>' },
    ],
  },
} as unknown as RecipeSpec;

const target = { kind: 'PLATFORM', moduleId: 'mod_1' } as unknown as DeployTarget;

describe('compileFlowAutomation', () => {
  it('emits a SHOP_METAFIELD_SET op with the serialized flow definition (deployable ⇒ non-AUDIT)', () => {
    const result = compileRecipe(baseSpec, target);
    const metafieldOp = result.ops.find((o) => o.kind === 'SHOP_METAFIELD_SET');
    expect(metafieldOp).toBeDefined();
    if (metafieldOp && metafieldOp.kind === 'SHOP_METAFIELD_SET') {
      expect(metafieldOp.namespace).toBe('superapp.flow');
      expect(metafieldOp.type).toBe('json');
      const parsed = JSON.parse(metafieldOp.value);
      expect(parsed.config.trigger).toBe('SHOPIFY_WEBHOOK_ORDER_CREATED');
      expect(parsed.config.steps.length).toBe(3);
      expect(parsed.name).toBe('Tag VIP Orders');
    }
  });

  it('is NOT an AUDIT-only compile (has a non-AUDIT op)', () => {
    const result = compileRecipe(baseSpec, target);
    const nonAudit = result.ops.filter((o) => o.kind !== 'AUDIT');
    expect(nonAudit.length).toBeGreaterThan(0);
    expect(result.compiledJson).toBeDefined();
  });

  it('records the durable DELAY shape in the AUDIT op', () => {
    const result = compileRecipe(baseSpec, target);
    const audit = result.ops.find((o) => o.kind === 'AUDIT' && o.action === 'compile.flow.automation');
    expect(audit).toBeDefined();
    if (audit && audit.kind === 'AUDIT') {
      const details = JSON.parse(audit.details ?? '{}');
      expect(details.durableDelay).toBe(true);
      expect(details.steps).toBe(3);
    }
  });

  it('emits only ops inside the SuperApp-owned namespace (non-destructive)', () => {
    const result = compileRecipe(baseSpec, target);
    // The SHOP_METAFIELD_SET must stay inside the `superapp.` prefix.
    const check = checkNonDestructive(result.ops);
    expect(check.ok).toBe(true);
    expect(check.violations).toEqual([]);
  });
});
