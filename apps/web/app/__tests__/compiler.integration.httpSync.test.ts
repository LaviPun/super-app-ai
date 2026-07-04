import { describe, it, expect } from 'vitest';
import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';

/**
 * integration.httpSync compiles to a REAL deploy op (SHOP_METAFIELD_SET persisting the
 * sync config), not a bare AUDIT no-op — the R0.1 deployable⇒non-AUDIT invariant. A
 * deployable type whose compiler only AUDITs would false-publish (build #7a).
 */

const baseSpec = {
  type: 'integration.httpSync',
  name: 'ERP Order Sync',
  category: 'INTEGRATION',
  requires: [],
  config: {
    connectorId: 'conn_erp',
    endpointPath: '/orders/ingest',
    trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
    payloadMapping: { orderId: '{{admin_graphql_api_id}}', total: '{{total_price}}' },
  },
} as unknown as RecipeSpec;

const target = { kind: 'PLATFORM', moduleId: 'mod_1' } as unknown as DeployTarget;

describe('compileIntegrationHttpSync', () => {
  it('emits a SHOP_METAFIELD_SET op with the serialized config (deployable ⇒ non-AUDIT)', () => {
    const result = compileRecipe(baseSpec, target);
    const metafieldOp = result.ops.find((o) => o.kind === 'SHOP_METAFIELD_SET');
    expect(metafieldOp).toBeDefined();
    if (metafieldOp && metafieldOp.kind === 'SHOP_METAFIELD_SET') {
      expect(metafieldOp.namespace).toBe('superapp.integration');
      expect(metafieldOp.type).toBe('json');
      const parsed = JSON.parse(metafieldOp.value);
      expect(parsed.config.trigger).toBe('SHOPIFY_WEBHOOK_ORDER_CREATED');
      expect(parsed.config.connectorId).toBe('conn_erp');
      expect(parsed.name).toBe('ERP Order Sync');
    }
  });

  it('is NOT an AUDIT-only compile (has a non-AUDIT op)', () => {
    const result = compileRecipe(baseSpec, target);
    const nonAudit = result.ops.filter((o) => o.kind !== 'AUDIT');
    expect(nonAudit.length).toBeGreaterThan(0);
    expect(result.compiledJson).toBeDefined();
  });
});
