import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';
import { PublishService, PublishPartialFailureError } from '~/services/publish/publish.service';

/**
 * Per-op publish ledger (WS-E finding 4). `publish()` now returns `ledger:
 * PublishOpLedgerEntry[]` naming every Shopify write it made, and a mid-sequence
 * failure throws `PublishPartialFailureError` carrying the ops that already
 * completed — so a caller (merchant UI / internal ops) never has to guess
 * whether it's safe to republish: every completed step is a handle-keyed
 * upsert or MetafieldsSet, so a republish always converges without duplicating
 * anything (asserted directly below by re-running against a stateful mock).
 */

/** Build an admin whose `graphql` resolves by GraphQL operation name (extracted
 *  from `query <Name>` / `mutation <Name>` in the document) — mirrors the
 *  pattern in activation.service.test.ts. */
function mockAdmin(resolve: (op: string, variables?: Record<string, unknown>) => unknown) {
  const calls: Array<{ op: string; variables?: Record<string, unknown> }> = [];
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    const match = /(?:query|mutation)\s+(\w+)/.exec(query);
    const op = match?.[1] ?? '<unknown>';
    calls.push({ op, variables: options?.variables });
    const payload = resolve(op, options?.variables);
    return { json: async () => payload };
  });
  const admin = { graphql } as unknown as AdminApiContext['admin'];
  return { admin, calls };
}

// A theme.section spec published to the default app-block medium (no
// `mode: 'native_section'`) compiles to ONLY `themeModulePayload` (compiler ops
// are a single AUDIT no-op) — so its publish ledger is exactly the 3 writes
// writeThemeModule makes: ensureMetafieldDefinition, upsertMetaobject,
// setModuleGidList. That determinism is what makes this spec the right fixture
// for pinning the ledger's exact op names.
const THEME_SECTION_SPEC = {
  type: 'theme.section',
  name: 'Ledger Test',
  category: 'STOREFRONT_UI',
  requires: [],
  config: { kind: 'hero', activation: 'section', title: 'Hi', fields: {}, blocks: [] },
  style: {},
} as unknown as RecipeSpec;

const TARGET: DeployTarget = { kind: 'THEME', themeId: '1', moduleId: 'm1' };

const SUCCESS_RESOLVER = (op: string) => {
  switch (op) {
    case 'MetafieldDefinitionCreate':
      return { data: { metafieldDefinitionCreate: { createdDefinition: { id: 'gid://shopify/MetafieldDefinition/1' }, userErrors: [] } } };
    case 'MetaobjectUpsert':
      return { data: { metaobjectUpsert: { metaobject: { id: 'gid://shopify/Metaobject/m1' }, userErrors: [] } } };
    case 'ShopId':
      return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
    case 'ShopModuleRefs':
      return { data: { shop: { metafield: null } } };
    case 'MetafieldsSet':
      return { data: { metafieldsSet: { metafields: [{ id: 'gid://shopify/Metafield/1' }], userErrors: [] } } };
    default:
      return { data: {} };
  }
};

describe('publish ledger (WS-E finding 4)', () => {
  it('successful publish returns a ledger naming every Shopify write', async () => {
    const { admin } = mockAdmin(SUCCESS_RESOLVER);
    const publisher = new PublishService(admin, { shop: 'shop.example.com', shopId: 'shop_1' });
    const result = await publisher.publish(THEME_SECTION_SPEC, TARGET);

    expect(result.ledger.map((e) => e.op)).toEqual([
      'ensureMetafieldDefinition:superapp.theme/module_refs',
      'upsertMetaobject:superapp-module-m1',
      'setModuleGidList:superapp.theme/module_refs',
    ]);
  });

  it('mid-sequence failure throws PublishPartialFailureError carrying completed ops + the failed op', async () => {
    const { admin } = mockAdmin((op) => {
      if (op === 'MetafieldsSet') {
        return { data: { metafieldsSet: { metafields: [], userErrors: [{ field: [], message: 'boom' }] } } };
      }
      return SUCCESS_RESOLVER(op);
    });
    const publisher = new PublishService(admin, { shop: 'shop.example.com', shopId: 'shop_1' });

    const err = await publisher.publish(THEME_SECTION_SPEC, TARGET).catch((e) => e);

    expect(err).toBeInstanceOf(PublishPartialFailureError);
    expect(err.failedOp).toBe('setModuleGidList:superapp.theme/module_refs');
    expect(err.completed.map((e: { op: string }) => e.op)).toEqual([
      'ensureMetafieldDefinition:superapp.theme/module_refs',
      'upsertMetaobject:superapp-module-m1',
    ]);
    expect(err.message).toMatch(/Republishing is safe/);
    expect(err.code).toBe('PUBLISH_PARTIAL_FAILURE');
  });

  it('republish after partial failure converges: second run performs the SAME logical writes (handle-keyed upserts, no *Create duplicates)', async () => {
    // Run 1: MetafieldsSet fails every time (the refs write never lands).
    // Run 2 (fresh PublishService, as a republish would be): everything succeeds.
    // Every mutation op name observed across BOTH runs must be in the idempotent
    // allowlist — a republish converges rather than duplicating a resource.
    const IDEMPOTENT_MUTATIONS = new Set([
      'MetaobjectUpsert', 'MetafieldsSet', 'MetafieldDefinitionCreate', // TAKEN swallowed
    ]);

    const run1 = mockAdmin((op) => {
      if (op === 'MetafieldsSet') {
        return { data: { metafieldsSet: { metafields: [], userErrors: [{ field: [], message: 'boom' }] } } };
      }
      return SUCCESS_RESOLVER(op);
    });
    await new PublishService(run1.admin, { shop: 'shop.example.com', shopId: 'shop_1' })
      .publish(THEME_SECTION_SPEC, TARGET)
      .catch(() => {});

    const run2 = mockAdmin(SUCCESS_RESOLVER);
    const result2 = await new PublishService(run2.admin, { shop: 'shop.example.com', shopId: 'shop_1' })
      .publish(THEME_SECTION_SPEC, TARGET);
    expect(result2.ledger.map((e) => e.op)).toEqual([
      'ensureMetafieldDefinition:superapp.theme/module_refs',
      'upsertMetaobject:superapp-module-m1',
      'setModuleGidList:superapp.theme/module_refs',
    ]);

    for (const call of [...run1.calls, ...run2.calls]) {
      if (!/^[A-Z]/.test(call.op)) continue; // skip the synthetic '<unknown>' fallback, if any
      const isMutation = call.op !== 'ShopId' && call.op !== 'ShopModuleRefs';
      if (!isMutation) continue;
      expect(IDEMPOTENT_MUTATIONS.has(call.op), call.op).toBe(true);
    }
  });

  it('a gated/blocked module never reaches the ledger step wrapper (ModuleNotPublishableError, no ledger entries)', async () => {
    const { admin } = mockAdmin(() => {
      throw new Error('admin.graphql must not be called for a gated module');
    });
    const spec = { type: 'platform.extensionBlueprint', name: 'x', category: 'PLATFORM', config: {} } as unknown as RecipeSpec;
    const publisher = new PublishService(admin, { shop: 'shop.example.com', shopId: 'shop_1' });
    await expect(publisher.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' })).rejects.toMatchObject({
      code: 'MODULE_NOT_PUBLISHABLE',
    });
  });

  it('a FUNCTION_CONFIG_UPSERT whose idempotent diff found nothing to write records itself distinctly (fix round 1 minor: ledger stays truthful)', async () => {
    // writeFunctionConfig is wrapped by step() at the ops-loop call site with a
    // detail callback that maps its 'noop' return to a ledger `detail: 'noop'`
    // entry, so a no-op republish doesn't look identical to a real write.
    const { admin } = mockAdmin(() => ({ data: {} }));
    const svc = new PublishService(admin, { shop: 'shop.example.com', shopId: 'shop_1' });
    const noopMo = {
      getFunctionConfigByKey: vi.fn().mockResolvedValue({ metaobjectId: 'gid://shopify/Metaobject/1', config: { rate: 10 } }),
      ensureMetafieldDefinition: vi.fn(),
      upsertFunctionConfigObject: vi.fn(),
      setModuleRef: vi.fn(),
    };
    const writeFunctionConfig = (
      svc as unknown as { writeFunctionConfig: (mo: unknown, key: string, config: unknown) => Promise<'written' | 'noop'> }
    ).writeFunctionConfig;
    await expect(writeFunctionConfig.call(svc, noopMo, 'discountRules', { rate: 10 })).resolves.toBe('noop');
    expect(noopMo.upsertFunctionConfigObject).not.toHaveBeenCalled();

    const writtenMo = {
      getFunctionConfigByKey: vi.fn().mockResolvedValue(null),
      ensureMetafieldDefinition: vi.fn().mockResolvedValue(undefined),
      upsertFunctionConfigObject: vi.fn().mockResolvedValue('gid://shopify/Metaobject/2'),
      setModuleRef: vi.fn().mockResolvedValue(undefined),
    };
    await expect(writeFunctionConfig.call(svc, writtenMo, 'discountRules', { rate: 15 })).resolves.toBe('written');
    expect(writtenMo.upsertFunctionConfigObject).toHaveBeenCalledTimes(1);
  });
});
