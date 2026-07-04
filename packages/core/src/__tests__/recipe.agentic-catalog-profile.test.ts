import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '../recipe.js';
import {
  AGENTIC_LIMITS,
  getExtensionEligibility,
  isRuntimeShipped,
  MODULE_TYPE_TO_CATEGORY,
  MODULE_TYPE_TO_SURFACE,
} from '../index.js';
import { getCapabilityNode } from '../capability-graph.js';

/**
 * M13 agentic.catalogProfile — the AI-channel product-data feed (specs/031
 * agentic-surface.md). Additive discriminated-union variant; a shop with no
 * agentic module is unaffected.
 */

const base = {
  type: 'agentic.catalogProfile' as const,
  name: 'AI Channel — Summer Catalog',
  category: 'INTEGRATION' as const,
};

describe('agentic.catalogProfile schema (M13)', () => {
  it('parses the full example spec', () => {
    const parsed = RecipeSpecSchema.parse({
      ...base,
      config: {
        artifacts: ['catalog-feed', 'attribute-map', 'compliance-disclosure'],
        source: { kind: 'collection', collectionIds: ['gid://shopify/Collection/12345'] },
        attributeMap: [
          { key: 'gtin', from: 'metafield:custom.gtin' },
          { key: 'brand', from: 'vendor' },
          { key: 'color', from: 'metafield:custom.color' },
        ],
        disclosures: [{ label: 'Country of origin', text: 'Made in Portugal.' }],
        feedHandle: 'summer-catalog',
      },
    });
    expect(parsed.type).toBe('agentic.catalogProfile');
    if (parsed.type !== 'agentic.catalogProfile') throw new Error('narrowing');
    expect(parsed.config.feedHandle).toBe('summer-catalog');
    expect(parsed.config.source.kind).toBe('collection');
  });

  it('applies defaults for a minimal config', () => {
    const parsed = RecipeSpecSchema.parse({ ...base, config: {} });
    if (parsed.type !== 'agentic.catalogProfile') throw new Error('narrowing');
    // catalog-feed is the always-real default; source defaults to all; handle to 'catalog'.
    expect(parsed.config.artifacts).toEqual(['catalog-feed']);
    expect(parsed.config.source.kind).toBe('all');
    expect(parsed.config.feedHandle).toBe('catalog');
    expect(parsed.config.attributeMap).toEqual([]);
    expect(parsed.config.disclosures).toEqual([]);
  });

  it('accepts the full artifact set (build #7c: mcp/agent-profile/sponsored are app-served + shipped)', () => {
    const parsed = RecipeSpecSchema.parse({
      ...base,
      config: {
        artifacts: ['catalog-feed', 'mcp-endpoint', 'agent-profile', 'sponsored-products'],
        sponsoredProductIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
        agentInstructions: 'Prioritize fair-trade products.',
      },
    });
    if (parsed.type !== 'agentic.catalogProfile') throw new Error('narrowing');
    expect(parsed.config.artifacts).toContain('mcp-endpoint');
    expect(parsed.config.sponsoredProductIds).toHaveLength(2);
    expect(parsed.config.agentInstructions).toBe('Prioritize fair-trade products.');
  });

  it('defaults sponsoredProductIds to [] and leaves agentInstructions undefined', () => {
    const parsed = RecipeSpecSchema.parse({ ...base, config: {} });
    if (parsed.type !== 'agentic.catalogProfile') throw new Error('narrowing');
    expect(parsed.config.sponsoredProductIds).toEqual([]);
    expect(parsed.config.agentInstructions).toBeUndefined();
  });

  it('rejects a non-GID sponsoredProductId', () => {
    const r = RecipeSpecSchema.safeParse({
      ...base,
      config: { sponsoredProductIds: ['not-a-gid'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an uppercase feedHandle', () => {
    const r = RecipeSpecSchema.safeParse({ ...base, config: { feedHandle: 'UPPER' } });
    expect(r.success).toBe(false);
  });

  it('rejects a non-GID productId in manual source', () => {
    const r = RecipeSpecSchema.safeParse({
      ...base,
      config: { source: { kind: 'manual', productIds: ['not-a-gid'] } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects over-limit collectionIds', () => {
    const ids = Array.from(
      { length: AGENTIC_LIMITS.collectionsMax + 1 },
      (_, i) => `gid://shopify/Collection/${i + 1}`,
    );
    const r = RecipeSpecSchema.safeParse({
      ...base,
      config: { source: { kind: 'collection', collectionIds: ids } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty artifacts array (min 1)', () => {
    const r = RecipeSpecSchema.safeParse({ ...base, config: { artifacts: [] } });
    expect(r.success).toBe(false);
  });
});

describe('agentic.catalogProfile registry + surface wiring (M13)', () => {
  it('maps to the INTEGRATION category and the agentic_channel surface', () => {
    expect(MODULE_TYPE_TO_CATEGORY['agentic.catalogProfile']).toBe('INTEGRATION');
    expect(MODULE_TYPE_TO_SURFACE['agentic.catalogProfile']).toBe('agentic_channel');
  });

  it('resolves to the AGENTIC capability surface with a PLATFORM target', () => {
    const node = getCapabilityNode('agentic.catalogProfile');
    expect(node.surface).toBe('AGENTIC');
    expect(node.allowedTargetKinds).toEqual(['PLATFORM']);
  });

  it('is deployable: the app-served feed runtime is shipped', () => {
    const e = getExtensionEligibility('agentic.catalogProfile');
    expect(e.runtime).toBe('agentic-feed');
    expect(e.runtimeShipped).toBe(true);
    expect(e.requiredScopes).toContain('read_products');
    expect(isRuntimeShipped('agentic.catalogProfile')).toBe(true);
  });
});
