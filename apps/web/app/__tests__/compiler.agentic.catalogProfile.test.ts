import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';

/**
 * M13 + build #7c agentic.catalogProfile compiler + publishability.
 *
 * Persisting the config IS the deploy (the app-served /agentic/.../* routes read it) —
 * like pos.extension. The compiler must emit a REAL AUDIT op (not the bare fallthrough).
 * Build #7c: mcp-endpoint / agent-profile / sponsored-products are now app-served and
 * SHIPPED, so they are NOT named as deferred; the compiler surfaces their app-served
 * URLs in compiledJson. Any FUTURE unshipped artifact would still be named deferred.
 */

function spec(config: unknown): RecipeSpec {
  return {
    type: 'agentic.catalogProfile',
    name: 'AI Channel Feed',
    category: 'INTEGRATION',
    requires: [],
    config,
  } as unknown as RecipeSpec;
}

describe('compileAgenticCatalogProfile (M13)', () => {
  it('emits the compile.agentic.catalogProfile AUDIT op with feed details', () => {
    const out = compileRecipe(
      spec({ artifacts: ['catalog-feed'], source: { kind: 'all' }, feedHandle: 'catalog', attributeMap: [], disclosures: [] }),
      { kind: 'PLATFORM' },
    );
    const audit = out.ops.find((o) => o.kind === 'AUDIT' && o.action === 'compile.agentic.catalogProfile');
    expect(audit).toBeDefined();
    expect(out.compiledJson).toContain('/agentic/{shop}/catalog/feed.json');
  });

  it('does NOT emit a deferred-artifacts op when only real artifacts are requested', () => {
    const out = compileRecipe(
      spec({ artifacts: ['catalog-feed', 'attribute-map', 'compliance-disclosure'], source: { kind: 'all' }, feedHandle: 'catalog', attributeMap: [], disclosures: [] }),
      { kind: 'PLATFORM' },
    );
    const deferred = out.ops.find((o) => o.kind === 'AUDIT' && o.action === 'agentic.deferred-artifacts');
    expect(deferred).toBeUndefined();
  });

  it('does NOT defer mcp/agent-profile/sponsored (build #7c: all app-served) and surfaces their URLs', () => {
    const out = compileRecipe(
      spec({
        artifacts: ['catalog-feed', 'mcp-endpoint', 'agent-profile', 'sponsored-products'],
        source: { kind: 'all' },
        feedHandle: 'catalog',
        attributeMap: [],
        disclosures: [],
        sponsoredProductIds: ['gid://shopify/Product/1'],
      }),
      { kind: 'PLATFORM' },
    );
    // Nothing is deferred — all four requested artifacts are shipped.
    const deferred = out.ops.find((o) => o.kind === 'AUDIT' && o.action === 'agentic.deferred-artifacts');
    expect(deferred).toBeUndefined();
    // The real compile op is present, and compiledJson carries every app-served surface URL.
    expect(out.ops.some((o) => o.kind === 'AUDIT' && o.action === 'compile.agentic.catalogProfile')).toBe(true);
    const compiled = JSON.parse(out.compiledJson ?? '{}');
    expect(compiled.mcpUrl).toBe('/agentic/{shop}/catalog/mcp');
    expect(compiled.ucpDiscoveryUrl).toBe('/agentic/{shop}/catalog/.well-known/ucp');
    expect(compiled.agentProfileUrl).toBe('/agentic/{shop}/catalog/agent-profile.json');
    expect(compiled.agentsMdUrl).toBe('/agentic/{shop}/catalog/agents.md');
    expect(compiled.sponsoredProductIds).toEqual(['gid://shopify/Product/1']);
    // The theme agents.md opt-in path is honestly recorded (never faked).
    expect(out.ops.some((o) => o.kind === 'AUDIT' && o.action === 'agentic.agents-md')).toBe(true);
  });

  it('classifies as deployable (the feed runtime is shipped)', () => {
    const result = classifyModulePublishability(
      spec({ artifacts: ['catalog-feed'], source: { kind: 'all' }, feedHandle: 'catalog', attributeMap: [], disclosures: [] }),
    );
    expect(result.status).toBe('deployable');
    expect(result.willDeploy).toBe(true);
  });
});
