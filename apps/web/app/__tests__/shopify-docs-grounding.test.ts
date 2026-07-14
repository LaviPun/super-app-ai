import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_MODULE_TYPES } from '@superapp/core';
import {
  getShopifyDocsBlock,
  snapshotAgeDays,
  familyForModuleType,
} from '~/services/ai/shopify-docs-grounding.server';
import { compileCreateSingleRecipePrompt } from '~/services/ai/llm.server';
import snapshot from '~/services/ai/shopify-docs/snapshot.json';

const PLATFORM_HEADER = 'Shopify platform constraints (current';
const MAX_FAMILY_TOKENS = 700;

// App-served surfaces with no first-party Shopify extension contract → no family.
const UNGROUNDED_TYPES = [
  'integration.httpSync',
  'messaging.campaign',
  'agentic.catalogProfile',
  'platform.extensionBlueprint',
  'pos.extension',
] as const;

describe('getShopifyDocsBlock', () => {
  const originalDisabled = process.env.SHOPIFY_DOCS_GROUNDING_DISABLED;

  afterEach(() => {
    if (originalDisabled === undefined) {
      delete process.env.SHOPIFY_DOCS_GROUNDING_DISABLED;
    } else {
      process.env.SHOPIFY_DOCS_GROUNDING_DISABLED = originalDisabled;
    }
    vi.useRealTimers();
  });

  it('returns a self-headed constraints block for a grounded type (theme.section)', () => {
    const block = getShopifyDocsBlock('theme.section');
    expect(block).toBeDefined();
    expect(block).toContain(PLATFORM_HEADER);
    // Family-specific fact that should not come from generic knowledge.
    expect(block).toContain('shopify_attributes');
  });

  it('grounds functions.discountRules with the deprecation warning', () => {
    const block = getShopifyDocsBlock('functions.discountRules');
    expect(block).toBeDefined();
    expect(block).toContain('DEPRECATED');
    expect(block).toContain('discountClasses');
  });

  it('returns undefined for an unknown module type', () => {
    expect(getShopifyDocsBlock('totally.not.a.type')).toBeUndefined();
  });

  it('returns undefined for app-served types that have no Shopify contract', () => {
    for (const type of UNGROUNDED_TYPES) {
      expect(getShopifyDocsBlock(type)).toBeUndefined();
      expect(familyForModuleType(type)).toBeUndefined();
    }
  });

  it('grounds every module type except the app-served surfaces', () => {
    const ungrounded = new Set<string>(UNGROUNDED_TYPES);
    for (const type of ALL_MODULE_TYPES) {
      const block = getShopifyDocsBlock(type);
      if (ungrounded.has(type)) {
        expect(block, `${type} should be ungrounded`).toBeUndefined();
      } else {
        expect(block, `${type} should be grounded`).toContain(PLATFORM_HEADER);
      }
    }
  });

  it('honors the SHOPIFY_DOCS_GROUNDING_DISABLED off-switch', () => {
    process.env.SHOPIFY_DOCS_GROUNDING_DISABLED = '1';
    expect(getShopifyDocsBlock('theme.section')).toBeUndefined();
    process.env.SHOPIFY_DOCS_GROUNDING_DISABLED = 'false';
    expect(getShopifyDocsBlock('theme.section')).toBeDefined();
  });
});

describe('snapshotAgeDays', () => {
  afterEach(() => vi.useRealTimers());

  it('computes whole-day age from the snapshot generatedAt', () => {
    const expected = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(snapshot.generatedAt)) / 86_400_000),
    );
    expect(snapshotAgeDays()).toBe(expected);
  });

  it('crosses the staleness threshold once far enough past generatedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(snapshot.generatedAt) + 100 * 86_400_000));
    expect(snapshotAgeDays()).toBeGreaterThan(60);
  });
});

describe('snapshot.json schema', () => {
  it('declares an MCP-sourced snapshot with a parseable generatedAt', () => {
    expect(snapshot.source).toBe('shopify-dev-mcp');
    expect(Number.isNaN(Date.parse(snapshot.generatedAt))).toBe(false);
  });

  it('has non-empty, in-budget docBlocks with accurate token estimates', () => {
    const families = Object.entries(snapshot.families);
    expect(families.length).toBeGreaterThanOrEqual(10);
    for (const [key, block] of families) {
      const doc = block.docBlock.trim();
      expect(doc.length, `${key} docBlock non-empty`).toBeGreaterThan(0);
      const tokens = Math.ceil(block.docBlock.length / 4);
      expect(tokens, `${key} within token budget`).toBeLessThanOrEqual(MAX_FAMILY_TOKENS);
      expect(block.tokenEstimate, `${key} tokenEstimate accurate`).toBe(tokens);
      expect(Array.isArray(block.sourceRefs) && block.sourceRefs.length > 0).toBe(true);
    }
  });

  it('maps every referenced family to a real snapshot entry', () => {
    const grounded = ALL_MODULE_TYPES.map((t) => familyForModuleType(t)).filter(
      (f): f is string => Boolean(f),
    );
    for (const family of new Set(grounded)) {
      expect(snapshot.families, `family ${family} exists`).toHaveProperty(family);
    }
  });
});

describe('platform block injection into the compiled prompt', () => {
  it('appears in a compiled single-recipe prompt when threaded through', () => {
    const platformBlock = getShopifyDocsBlock('checkout.upsell');
    expect(platformBlock).toBeDefined();
    const prompt = compileCreateSingleRecipePrompt({
      purposeAndGuidance: 'Guidance.',
      moduleType: 'checkout.upsell',
      summary: 'A checkout upsell.',
      expectations: 'Expectations.',
      userRequest: 'Add a checkout upsell.',
      platformBlock,
    });
    expect(prompt).toContain(PLATFORM_HEADER);
    expect(prompt).toContain('extensions.capabilities');
  });

  it('is omitted when no platform block is supplied', () => {
    const prompt = compileCreateSingleRecipePrompt({
      purposeAndGuidance: 'Guidance.',
      moduleType: 'integration.httpSync',
      summary: 'An HTTP sync.',
      expectations: 'Expectations.',
      userRequest: 'Sync orders.',
      platformBlock: getShopifyDocsBlock('integration.httpSync'),
    });
    expect(prompt).not.toContain(PLATFORM_HEADER);
  });
});
