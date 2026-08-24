import { describe, it, expect, vi } from 'vitest';

// WS-F Task 8: thin server-only wrapper around getRecipeJsonSchemaForType so
// generate._index.tsx (a client-bundled route component) never imports the
// .server.ts schema-registry module directly (binding build rule) — it fetches
// this route instead. Kills the Builder's hard-coded "buy bar" field set
// (BASE_SETTINGS / mergeSettingsIntoRecipe) by giving the client a real,
// per-type JSON Schema to drive SchemaForm from.

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 's.myshopify.com' } })),
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));

vi.mock('~/services/ai/recipe-json-schema.server', () => ({
  getRecipeJsonSchemaForType: vi.fn((type: string) =>
    type === 'theme.section'
      ? { type: 'object', properties: { config: { type: 'object', properties: { label: { type: 'string' } } }, style: { type: 'object', properties: {} } } }
      : undefined,
  ),
}));

describe('api.generate.config-schema (WS-F: kills hard-coded buy-bar fields)', () => {
  it('returns the config+style sub-schema for a known type', async () => {
    const { loader } = await import('~/routes/api.generate.config-schema');
    const res = await loader({ request: new Request('https://app.test/api/generate/config-schema?type=theme.section') } as never);
    const payload = (await res.json()) as { jsonSchema: { properties: Record<string, unknown> } };
    expect(payload.jsonSchema.properties.label).toBeDefined();
  });

  it('returns null for an unknown type (caller falls back to a plain JSON textarea)', async () => {
    const { loader } = await import('~/routes/api.generate.config-schema');
    const res = await loader({ request: new Request('https://app.test/api/generate/config-schema?type=nonsense') } as never);
    const payload = (await res.json()) as { jsonSchema: unknown };
    expect(payload.jsonSchema).toBeNull();
  });

  it('400s when type is missing', async () => {
    const { loader } = await import('~/routes/api.generate.config-schema');
    const res = await loader({ request: new Request('https://app.test/api/generate/config-schema') } as never);
    expect(res.status).toBe(400);
  });

  it('strips pricing/recommendation/ruleEngine keys — those already have dedicated pack editors in the Builder (PricingControls/RecommendationControls/RuleEngineControls), so SchemaForm must never render a second, worse editor for the same fields', async () => {
    const { getRecipeJsonSchemaForType } = await import('~/services/ai/recipe-json-schema.server');
    vi.mocked(getRecipeJsonSchemaForType).mockReturnValueOnce({
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            pricing: { type: 'object', properties: {} },
            recommendation: { type: 'object', properties: {} },
            ruleEngine: { type: 'object', properties: {} },
          },
        },
        style: { type: 'object', properties: {} },
      },
    } as never);

    const { loader } = await import('~/routes/api.generate.config-schema');
    const res = await loader({ request: new Request('https://app.test/api/generate/config-schema?type=pricing.tiered') } as never);
    const payload = (await res.json()) as { jsonSchema: { properties: Record<string, unknown> } };

    expect(payload.jsonSchema.properties.label).toBeDefined();
    expect(payload.jsonSchema.properties.pricing).toBeUndefined();
    expect(payload.jsonSchema.properties.recommendation).toBeUndefined();
    expect(payload.jsonSchema.properties.ruleEngine).toBeUndefined();
  });
});
