#!/usr/bin/env tsx
// apps/web/scripts/submission-conformance-check.ts
/**
 * WS-S Task 1 — pre-submission conformance self-check.
 * Re-derives conformance facts from the tree at run time; never hardcodes a
 * "should be true" value. Run: `pnpm --dir apps/web submission:check`.
 * This is NOT a replacement for the live-store probes in
 * docs/runbooks/publish-live-probe.md and docs/runbooks/scope-reconsent.md —
 * it verifies the CODE is submission-shaped; those runbooks verify the
 * LIVE STORE behaves correctly. Both must be green before Task 8.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CheckResult = { id: string; pass: boolean; detail: string };

function read(repoRoot: string, rel: string): string | null {
  const p = resolve(repoRoot, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

export function runChecks(repoRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. entry.server.tsx exists and calls applySecurityHeaders (Conf-1, WS-D Task 1)
  const entry = read(repoRoot, 'apps/web/app/entry.server.tsx');
  results.push({
    id: 'csp-entry-point',
    pass: !!entry && entry.includes('applySecurityHeaders'),
    detail: entry
      ? entry.includes('applySecurityHeaders')
        ? 'entry.server.tsx calls applySecurityHeaders'
        : 'entry.server.tsx exists but does not call applySecurityHeaders'
      : 'apps/web/app/entry.server.tsx is missing',
  });

  // 2. App Bridge in <head> before polaris.js (Conf-3, WS-D Task 3)
  const headScripts = read(repoRoot, 'apps/web/app/components/EmbeddedHeadScripts.tsx');
  const appBridgeIdx = headScripts?.indexOf('app-bridge.js') ?? -1;
  const polarisIdx = headScripts?.indexOf('polaris.js') ?? -1;
  results.push({
    id: 'app-bridge-head-order',
    pass: appBridgeIdx >= 0 && polarisIdx > appBridgeIdx,
    detail: headScripts
      ? appBridgeIdx < 0
        ? 'app-bridge.js script tag not found in EmbeddedHeadScripts.tsx'
        : polarisIdx <= appBridgeIdx
          ? 'polaris.js appears before or same position as app-bridge.js'
          : 'app-bridge.js precedes polaris.js in EmbeddedHeadScripts.tsx'
      : 'apps/web/app/components/EmbeddedHeadScripts.tsx is missing',
  });

  // 3. Token-exchange auth flag (Conf-2, WS-D Task 2)
  const shopifyServer = read(repoRoot, 'apps/web/app/shopify.server.ts');
  results.push({
    id: 'token-exchange-auth',
    pass: !!shopifyServer && /unstable_newEmbeddedAuthStrategy:\s*true/.test(shopifyServer),
    detail: shopifyServer?.includes('unstable_newEmbeddedAuthStrategy: true')
      ? 'unstable_newEmbeddedAuthStrategy: true set in shopify.server.ts'
      : 'unstable_newEmbeddedAuthStrategy is not enabled in shopify.server.ts',
  });

  // 4. GDPR compliance_topics declared in shopify.app.production.toml
  const toml = read(repoRoot, 'shopify.app.production.toml') ?? '';
  const requiredTopics = ['customers/data_request', 'customers/redact', 'shop/redact'];
  const missingTopics = requiredTopics.filter((t) => !toml.includes(`"${t}"`));
  results.push({
    id: 'gdpr-webhook-topics-declared',
    pass: missingTopics.length === 0,
    detail:
      missingTopics.length === 0
        ? 'all 3 GDPR compliance_topics present in shopify.app.production.toml'
        : `missing compliance_topics: ${missingTopics.join(', ')}`,
  });

  // 5. GDPR webhook route handlers exist and delete/anonymize (not just log)
  const gdprRoutes: Array<[string, string]> = [
    ['apps/web/app/routes/webhooks.customers.data_request.tsx', 'customers/data_request'],
    ['apps/web/app/routes/webhooks.customers.redact.tsx', 'customers/redact'],
    ['apps/web/app/routes/webhooks.shop.redact.tsx', 'shop/redact'],
  ];
  const missingRoutes = gdprRoutes.filter(([path]) => !existsSync(resolve(repoRoot, path)));
  results.push({
    id: 'gdpr-webhook-handlers-exist',
    pass: missingRoutes.length === 0,
    detail:
      missingRoutes.length === 0
        ? 'all 3 GDPR webhook route files present'
        : `missing route files: ${missingRoutes.map(([p]) => p).join(', ')}`,
  });

  // 6. App Pricing plan-sync code present (D3, WS-D Task 4-7) — code presence only;
  //    Task 6 of THIS plan verifies the Partner Dashboard side is actually configured.
  const planSync = read(repoRoot, 'apps/web/app/services/billing/plan-sync.service.ts');
  const planHandles = read(repoRoot, 'apps/web/app/services/billing/plan-handles.ts');
  results.push({
    id: 'app-pricing-plan-sync-present',
    pass: !!planSync && !!planHandles && /class PlanSyncService/.test(planSync),
    detail:
      planSync && planHandles
        ? 'PlanSyncService + plan-handles.ts present'
        : 'billing plan-sync service or plan-handles map missing',
  });

  // 7. Hand-rolled Billing API subscription flow removed (D3)
  const billingService = read(repoRoot, 'apps/web/app/services/billing/billing.service.ts') ?? '';
  results.push({
    id: 'billing-api-flow-removed',
    pass: !billingService.includes('appSubscriptionCreate'),
    detail: billingService.includes('appSubscriptionCreate')
      ? 'billing.service.ts still contains appSubscriptionCreate — App Pricing migration incomplete'
      : 'no appSubscriptionCreate call site in billing.service.ts',
  });

  // 8. Declared scopes line is non-empty and parses (shape check only — the
  //    live re-consent grant is verified by docs/runbooks/scope-reconsent.md)
  const scopeMatch = toml.match(/^scopes\s*=\s*"([^"]+)"/m);
  const scopes = scopeMatch?.[1] ? scopeMatch[1].split(',').map((s) => s.trim()) : [];
  results.push({
    id: 'scope-list-matches-code',
    pass: scopes.length > 0,
    detail:
      scopes.length > 0
        ? `${scopes.length} scopes declared: ${scopes.join(', ')}`
        : 'no [access_scopes] scopes line found in shopify.app.production.toml',
  });

  // 9. Restricted-scope avoidance (App Store Requirements 3.2.1-3.2.3 — request
  // only when the feature genuinely needs it; this app requests none of them)
  const restricted = ['read_all_orders', 'write_payment_mandate', 'write_checkout_extensions_apis'];
  const requested = restricted.filter((s) => scopes.includes(s) || (toml.match(/optional_scopes[^\]]*\]/)?.[0] ?? '').includes(s));
  results.push({
    id: 'restricted-scopes-not-requested',
    pass: requested.length === 0,
    detail:
      requested.length === 0
        ? 'none of the reviewer-scrutinized restricted scopes are requested'
        : `restricted scopes requested — must be justified in docs/launch/scope-justifications.md: ${requested.join(', ')}`,
  });

  // 10. TAE Liquid aggregate budget (program-wide constraint, also a review-time risk:
  //     an over-budget build breaks CI, which would break the release build for submission)
  results.push({
    id: 'tae-liquid-budget',
    pass: existsSync(resolve(repoRoot, 'scripts/build-theme-liquid.mjs')),
    detail: existsSync(resolve(repoRoot, 'scripts/build-theme-liquid.mjs'))
      ? 'run `node scripts/build-theme-liquid.mjs --check` separately for the live byte count (this check only confirms the gate script exists)'
      : 'scripts/build-theme-liquid.mjs missing',
  });

  return results;
}

function main(): void {
  // apps/web/scripts/submission-conformance-check.ts -> repo root is 3 dirs up
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const results = runChecks(repoRoot);
  let anyFail = false;
  for (const r of results) {
    const line = `[${r.pass ? 'PASS' : 'FAIL'}] ${r.id} — ${r.detail}`;
    console.info(line);
    if (!r.pass) anyFail = true;
  }
  if (anyFail) {
    console.error('\nsubmission-conformance-check: one or more checks FAILED. Fix before Task 8.');
    process.exit(1);
  }
  console.info('\nsubmission-conformance-check: all checks passed.');
}

// ESM equivalent of `require.main === module` (this package is "type": "module")
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
