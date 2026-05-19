import { describe, expect, it } from 'vitest';
import {
  RecipeDslSchema,
  buildRecipeDslFromIntentGraph,
  compileRecipeDsl,
} from '../recipe-dsl.js';
import { RecipeSpecSchema } from '../recipe.js';
import { buildIntentGraphFromPacket } from '../intent-graph.js';
import type { IntentPacket } from '../intent-packet.js';

const intentPacket: IntentPacket = {
  schema_version: '1.0',
  request_id: 'req_phase14_popup',
  input: { text: 'Show an exit intent popup with a discount code' },
  classification: {
    intent: 'promo.popup',
    surface: 'storefront_theme',
    mode: 'create',
    confidence: 0.93,
    alternatives: [],
    reasons: ['merchant asked for a popup'],
  },
  routing: {
    prompt_scaffold_id: 'tpl_promo_popup_v1',
    prompt_profile: 'storefront_ui_v1',
    output_schema: 'StorefrontModuleSpecV1',
  },
};

describe('RecipeDslSchema and compiler', () => {
  it('compiles DSL into a validated RecipeSpec', () => {
    const graph = buildIntentGraphFromPacket(intentPacket);
    const result = compileRecipeDsl({
      schema_version: '1.0',
      id: 'dsl_phase14_popup',
      intentGraph: graph,
      catalogId: 'type.theme.popup',
      recipe: {
        type: 'theme.popup',
        name: 'Exit Offer',
        config: {
          title: 'Wait before you go',
          body: 'Use SAVE10 today.',
          ctaText: 'Shop now',
          ctaUrl: 'https://example.com/collections/sale',
        },
      },
      steps: [
        { id: 'set_trigger', op: 'set_config', path: 'trigger', value: 'ON_EXIT_INTENT' },
        { id: 'set_pages', op: 'set_placement', enabled_on: { templates: ['product'] } },
      ],
    });

    expect(result.boundaries.validatedRecipeSpec).toBe(true);
    expect(result.boundaries.deploysMerchantCode).toBe(false);
    expect(result.recipe.type).toBe('theme.popup');
    expect(RecipeSpecSchema.safeParse(result.recipe).success).toBe(true);
    if (result.recipe.type === 'theme.popup') {
      expect(result.recipe.config.trigger).toBe('ON_EXIT_INTENT');
      expect(result.recipe.placement?.enabled_on?.templates).toEqual(['product']);
    }
  });

  it('builds DSL from an intent graph and preserves catalog compatibility', () => {
    const graph = buildIntentGraphFromPacket(intentPacket);
    const dsl = buildRecipeDslFromIntentGraph(graph, {
      type: 'theme.popup',
      name: 'Graph Popup',
      config: { title: 'A graph-derived popup' },
    });

    expect(dsl.intentGraph?.id).toBe(graph.id);
    expect(dsl.catalogId).toBe('type.theme.popup');
    expect(dsl.recipe.type).toBe('theme.popup');
  });

  it('can compile from a compatible existing template', () => {
    const result = compileRecipeDsl({
      schema_version: '1.0',
      id: 'dsl_template_banner',
      templateId: 'UAO-001',
      recipe: {
        type: 'theme.banner',
        name: 'Cart Threshold Banner',
        config: {
          heading: 'Almost there',
        },
      },
      steps: [
        { id: 'set_heading', op: 'set_config', path: 'heading', value: 'Spend $10 more for free shipping' },
      ],
    });

    expect(result.recipe.type).toBe('theme.banner');
    if (result.recipe.type === 'theme.banner') {
      expect(result.recipe.config.heading).toBe('Spend $10 more for free shipping');
    }
  });

  it('rejects raw script-like DSL content before RecipeSpec validation', () => {
    const parsed = RecipeDslSchema.safeParse({
      schema_version: '1.0',
      id: 'dsl_unsafe_script',
      recipe: {
        type: 'theme.banner',
        name: 'Unsafe Banner',
        config: {
          heading: '<script>alert("xss")</script>',
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message).join('\n')).toMatch(/Unsafe DSL content/);
  });

  it('rejects raw code/liquid keys even when values look harmless', () => {
    const parsed = RecipeDslSchema.safeParse({
      schema_version: '1.0',
      id: 'dsl_unsafe_key',
      recipe: {
        type: 'theme.banner',
        name: 'Unsafe Key',
        config: {
          rawLiquid: 'plain text',
          heading: 'Hello',
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message).join('\n')).toMatch(/Unsafe DSL content/);
  });

  it('rejects catalog and template mismatches', () => {
    expect(() =>
      compileRecipeDsl({
        schema_version: '1.0',
        id: 'dsl_bad_catalog',
        catalogId: 'type.theme.popup',
        recipe: {
          type: 'theme.banner',
          name: 'Mismatched Banner',
          config: { heading: 'Hello' },
        },
      }),
    ).toThrow(/not theme.banner/);

    expect(() =>
      compileRecipeDsl({
        schema_version: '1.0',
        id: 'dsl_bad_template',
        templateId: 'UAO-001',
        recipe: {
          type: 'theme.popup',
          name: 'Mismatched Popup',
          config: { title: 'Hello' },
        },
      }),
    ).toThrow(/not theme.popup/);
  });

  it('rejects DSL that cannot compile to existing RecipeSpec', () => {
    expect(() =>
      compileRecipeDsl({
        schema_version: '1.0',
        id: 'dsl_bad_recipe',
        recipe: {
          type: 'theme.banner',
          name: 'Missing Heading',
          config: {},
        },
      }),
    ).toThrow();
  });
});
