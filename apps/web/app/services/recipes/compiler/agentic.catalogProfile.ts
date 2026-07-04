import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';
import { AGENTIC_ARTIFACTS_SHIPPED } from '@superapp/core';

/**
 * agentic.catalogProfile (M13 + build #7c) — the merchant's catalog surfaced to AI
 * shopping agents. Every artifact is served from THIS app's backend (publish persists
 * config → an app route reads the active PUBLISHED version → an AI agent/crawler
 * fetches), the SAME app-served model the shipped `pos.extension` uses. Persisting the
 * config IS the deploy: there is no Shopify write and therefore no new `DeployOperation`
 * kind. We emit an AUDIT op (not a bare no-op fallthrough) so the publish pipeline
 * records a real, inspectable compile artifact, and `compiledJson` carries every
 * app-served surface URL for the modules UI.
 *
 * App-served surfaces per published feed (all REAL, all `deployable`):
 *   - catalog-feed / attribute-map / compliance-disclosure → …/feed.json
 *   - mcp-endpoint       → …/mcp (JSON-RPC) + …/.well-known/ucp discovery
 *   - agent-profile      → …/agent-profile.json  (+ app-served …/agents.md)
 *   - sponsored-products → config-only (promoted GIDs boosted in the MCP/feed ranking)
 *
 * Honesty (R0.1 / needs_runtime discipline): if a FUTURE artifact lands in the schema
 * without a shipped runtime, it is filtered out of `SHIPPED_ARTIFACTS` and named in a
 * second `agentic.deferred-artifacts` AUDIT op — never faked, never silently published.
 * The `agents.md` surface ships via the app-served …/agents.md route only. A theme-emit
 * path for the canonical `templates/agents.md.liquid` (which would reference the
 * storefront-populated `agents` Liquid object an app cannot fill) is NOT implemented and
 * is NOT emitted here — no fake artifact, no half-wired flag.
 */
const SHIPPED_ARTIFACTS = new Set<string>(AGENTIC_ARTIFACTS_SHIPPED);

export function compileAgenticCatalogProfile(
  spec: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>,
): CompileResult {
  const { artifacts, feedHandle, source } = spec.config;
  const deferred = artifacts.filter((a) => !SHIPPED_ARTIFACTS.has(a));
  const base = `/agentic/{shop}/${feedHandle}`;

  const ops: CompileResult['ops'] = [
    {
      kind: 'AUDIT',
      action: 'compile.agentic.catalogProfile',
      details: JSON.stringify({ feedHandle, source: source.kind, artifacts }),
    },
  ];

  if (deferred.length > 0) {
    // Name what did NOT deploy so nothing looks-done-but-isn't (preflight surfaces this).
    ops.push({ kind: 'AUDIT', action: 'agentic.deferred-artifacts', details: deferred.join(',') });
  }

  // agents.md is app-served only; there is no theme-emit path (never faked).
  if (artifacts.includes('agent-profile')) {
    ops.push({
      kind: 'AUDIT',
      action: 'agentic.agents-md',
      details: 'app-served at {base}/agents.md; no templates/agents.md.liquid theme-emit path exists',
    });
  }

  return {
    ops,
    compiledJson: JSON.stringify({
      feedUrl: `${base}/feed.json`,
      mcpUrl: artifacts.includes('mcp-endpoint') ? `${base}/mcp` : undefined,
      ucpDiscoveryUrl: artifacts.includes('mcp-endpoint') ? `${base}/.well-known/ucp` : undefined,
      agentProfileUrl: artifacts.includes('agent-profile') ? `${base}/agent-profile.json` : undefined,
      agentsMdUrl: artifacts.includes('agent-profile') ? `${base}/agents.md` : undefined,
      sponsoredProductIds: artifacts.includes('sponsored-products')
        ? spec.config.sponsoredProductIds
        : undefined,
      artifacts,
      deferred,
    }),
  };
}
