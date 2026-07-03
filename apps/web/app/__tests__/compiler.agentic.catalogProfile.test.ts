import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';

/**
 * M13 agentic.catalogProfile compiler + publishability.
 *
 * Persisting the config IS the deploy (the app-served /agentic/.../feed.json route
 * reads it) — like pos.extension. The compiler must emit a REAL AUDIT op (not the
 * bare fallthrough), and must NAME any deferred artifact (mcp/agent-profile/
 * sponsored) so nothing looks-done-but-isn't.
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

  it('names the deferred artifacts (mcp/agent-profile/sponsored) when requested — never faked', () => {
    const out = compileRecipe(
      spec({ artifacts: ['catalog-feed', 'mcp-endpoint', 'agent-profile', 'sponsored-products'], source: { kind: 'all' }, feedHandle: 'catalog', attributeMap: [], disclosures: [] }),
      { kind: 'PLATFORM' },
    );
    const deferred = out.ops.find((o) => o.kind === 'AUDIT' && o.action === 'agentic.deferred-artifacts');
    expect(deferred).toBeDefined();
    const details = (deferred as { details?: string }).details ?? '';
    expect(details).toContain('mcp-endpoint');
    expect(details).toContain('agent-profile');
    expect(details).toContain('sponsored-products');
    // The real feed still deploys (the compile op is present).
    expect(out.ops.some((o) => o.kind === 'AUDIT' && o.action === 'compile.agentic.catalogProfile')).toBe(true);
  });

  it('classifies as deployable (the feed runtime is shipped)', () => {
    const result = classifyModulePublishability(
      spec({ artifacts: ['catalog-feed'], source: { kind: 'all' }, feedHandle: 'catalog', attributeMap: [], disclosures: [] }),
    );
    expect(result.status).toBe('deployable');
    expect(result.willDeploy).toBe(true);
  });
});
