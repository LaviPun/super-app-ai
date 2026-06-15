import { describe, expect, it } from 'vitest';
import {
  IntentGraphSchema,
  buildIntentGraphFromPacket,
  validateIntentGraph,
} from '../intent-graph.js';
import type { IntentPacket } from '../intent-packet.js';

function makePacket(overrides: Partial<IntentPacket> = {}): IntentPacket {
  return {
    schema_version: '1.0',
    request_id: 'req_phase14_banner',
    input: { text: 'Create a free shipping banner for product pages' },
    classification: {
      intent: 'promo.banner',
      surface: 'storefront_theme',
      mode: 'create',
      confidence: 0.92,
      alternatives: [],
      reasons: ['merchant asked for a banner'],
    },
    routing: {
      prompt_scaffold_id: 'tpl_promo_banner_v1',
      prompt_profile: 'storefront_ui_v1',
      output_schema: 'StorefrontModuleSpecV1',
    },
    ...overrides,
  };
}

describe('IntentGraphSchema', () => {
  it('builds an intent graph from an existing IntentPacket', () => {
    const graph = buildIntentGraphFromPacket(makePacket());

    expect(graph.id).toBe('ig_req_phase14_banner');
    expect(graph.metadata.featureFlag).toBe('INTENT_GRAPH_ENABLED');
    expect(graph.routing.output_schema).toBe('StorefrontModuleSpecV1');
    expect(graph.nodes.some((node) => node.kind === 'goal' && node.intent === 'promo.banner')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'recipe_candidate' && node.moduleType === 'theme.section')).toBe(true);
  });

  it('falls back to extension blueprint for unknown long-tail intents', () => {
    const graph = buildIntentGraphFromPacket(
      makePacket({
        classification: {
          intent: 'support.how_to',
          surface: 'admin',
          mode: 'explain',
          confidence: 0.5,
          alternatives: [],
          reasons: [],
        },
      }),
    );

    const candidate = graph.nodes.find((node) => node.kind === 'recipe_candidate');
    expect(candidate?.kind).toBe('recipe_candidate');
    expect(candidate?.moduleType).toBe('platform.extensionBlueprint');
  });

  it('rejects duplicate node ids and dangling edges', () => {
    expect(() =>
      validateIntentGraph({
        schema_version: '1.0',
        id: 'ig_invalid_graph',
        routing: {
          prompt_scaffold_id: 'tpl_promo_banner_v1',
          prompt_profile: 'storefront_ui_v1',
          output_schema: 'StorefrontModuleSpecV1',
        },
        nodes: [
          {
            id: 'same_id',
            kind: 'goal',
            intent: 'promo.banner',
            mode: 'create',
            confidence: 0.9,
            textSummary: 'banner',
          },
          {
            id: 'same_id',
            kind: 'recipe_candidate',
            moduleType: 'theme.section',
            category: 'STOREFRONT_UI',
            surface: 'online_store',
          },
        ],
        edges: [{ from: 'same_id', to: 'missing_node', label: 'proposes' }],
      }),
    ).toThrow(/Duplicate node id|unknown to node/);
  });

  it('rejects catalog/module mismatches', () => {
    const parsed = IntentGraphSchema.safeParse({
      schema_version: '1.0',
      id: 'ig_catalog_mismatch',
      routing: {
        prompt_scaffold_id: 'tpl_promo_banner_v1',
        prompt_profile: 'storefront_ui_v1',
        output_schema: 'StorefrontModuleSpecV1',
      },
      nodes: [
        {
          id: 'goal_1',
          kind: 'goal',
          intent: 'promo.banner',
          mode: 'create',
          confidence: 0.9,
          textSummary: 'banner',
        },
        {
          id: 'catalog_1',
          kind: 'catalog_match',
          catalogId: 'type.proxy.widget',
          moduleType: 'theme.section',
          score: 0.9,
        },
        {
          id: 'candidate_1',
          kind: 'recipe_candidate',
          moduleType: 'theme.section',
          catalogId: 'type.proxy.widget',
          category: 'STOREFRONT_UI',
          surface: 'online_store',
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message).join('\n')).toMatch(/not theme.section/);
  });
});
