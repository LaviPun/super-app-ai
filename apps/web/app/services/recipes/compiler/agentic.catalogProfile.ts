import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';
import { AGENTIC_ARTIFACTS_SHIPPED } from '@superapp/core';

/**
 * agentic.catalogProfile (M13) — a structured product-data feed the merchant
 * surfaces to AI channels. Its runtime is the app-served feed endpoint
 * `/agentic/{shop}/{handle}/feed.json`, which reads the module's active PUBLISHED
 * version and emits the feed to an external AI crawler/agent — the SAME app-served
 * model the shipped `pos.extension` uses (publish persists config → an app route
 * reads it → an external consumer fetches). So, exactly like `pos.extension`,
 * PERSISTING the config IS the deploy: there is no Shopify write and therefore no
 * new `DeployOperation` kind. We emit an AUDIT op (not a bare no-op fallthrough) so
 * the publish pipeline records a real, inspectable compile artifact — mirroring how
 * `pos.extension` AUDIT-compiles — and `compiledJson` carries the feed URL for the
 * modules UI.
 *
 * Honesty (R0.1 / needs_runtime discipline): only the feed artifacts
 * (catalog-feed / attribute-map / compliance-disclosure) are real today. If the
 * merchant requested a `mcp-endpoint` / `agent-profile` / `sponsored-products`
 * artifact — whose runtime is NOT shipped — we emit a second AUDIT op naming the
 * deferred artifacts so publish/preflight can surface them to the merchant. The
 * deferred artifacts are never faked and never silently "published".
 */
const SHIPPED_ARTIFACTS = new Set<string>(AGENTIC_ARTIFACTS_SHIPPED);

export function compileAgenticCatalogProfile(
  spec: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>,
): CompileResult {
  const { artifacts, feedHandle, source } = spec.config;
  const deferred = artifacts.filter((a) => !SHIPPED_ARTIFACTS.has(a));

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

  return {
    ops,
    compiledJson: JSON.stringify({
      feedUrl: `/agentic/{shop}/${feedHandle}/feed.json`,
      artifacts,
      deferred,
    }),
  };
}
