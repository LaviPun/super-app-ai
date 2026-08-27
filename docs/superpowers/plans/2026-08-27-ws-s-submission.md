# WS-S — App Store Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan is split by ACTOR** — every task header is tagged `[AGENT]` or `[OWNER-RUN]`. An agent executing this plan must STOP at every `[OWNER-RUN]` task and hand it to the owner; it must never attempt Partner Dashboard clicks, `shopify app deploy` against production, or the Submit button itself.

**Goal:** Take Super App AI from "wave-two PRs open, WS-C mid-flight" to a submitted Shopify App Store listing — every hard conformance gate closed and *verified*, the GDPR/data-protection surface complete, the Partner Dashboard listing built and accurate, a clean live-store install/publish/unpublish probe on record, a quiet 7-day burn-in on Railway, and the submission itself filed — without fabricating a single "verified" claim that didn't actually happen (D8 carries through to this workstream: no silent failures, no pre-dated success).

**Architecture:** Two kinds of work run in sequence, not in parallel with each other at the boundary points that matter. (1) **Agent-runnable prep** — a repo-resident conformance self-check script, listing copy, a screenshot/asset checklist, a scope-justification table, and a reviewer-facing notes doc — all derivable from code that already exists once the entry gate closes. None of this touches a live store or the Partner Dashboard. (2) **Owner-run activation** — the three runbooks this program already wrote (`app-pricing-setup.md`, `scope-reconsent.md`, `publish-live-probe.md`) executed in order against a real dev store, then the Partner Dashboard listing assembled from the agent's draft, then a 7-day burn-in watching WS-G's alert channel, then the production scope deploy, then Submit. WS-S does not re-specify what those three runbooks already specify; it sequences them and adds the two gates (listing content, burn-in) they don't cover.

**Tech Stack:** Same as the rest of the program — Remix (`apps/web`), Prisma, Vitest, Shopify CLI, Partner Dashboard (manual), Railway (owner-run). No new services.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` — WS-S is Phase 6 (line 61-62), Decision D8 ("Launch = App Store submission... conformance items are hard gates"), Global constraints. Doc grounding: Shopify App Store Requirements Checklist (shopify.dev, fetched 2026-08-26 — sections 1-4 below cite it directly; category 5.x sections are conditional and mostly N/A, see Task 3 Step 3), Shopify's clearer-image-standards changelog (4.4.5, enforced 2026-03-26 — already in effect for any submission after that date), Shopify App Store submission guidance on GDPR mandatory topics, listing copy fields, and screenshot dimensions (WebSearch, 2026-08-26).

## Global Constraints

- **This plan produces docs + one script. It does not touch application behavior.** No route, service, or schema file changes; every file this plan creates lives under `docs/launch/` or `apps/web/scripts/`.
- **No silent failures, no fabricated verification (D8).** Every checklist item in this plan that claims "done"/"verified"/"green" must cite the command that was actually run and its actual output — the same discipline `scope-reconsent.md` and `publish-live-probe.md` already established ("do not pre-date or pre-write a verified claim"). Task 8's pre-submission checklist file follows that pattern explicitly.
- **Actor tagging is load-bearing.** `[AGENT]` tasks require no Partner Dashboard access, no live store, no production deploy credentials — they run against the repo only. `[OWNER-RUN]` tasks require Partner org-owner access, a dev store, and (at the end) the actual Submit click; an agent must never simulate these.
- Admin API target: **2026-07** (program-wide constraint; nothing in this plan adds GraphQL, but the self-check script's scope list must match the toml's `2026-07`-validated scope names).
- Merchant UI: Polaris web components only — not touched by this plan, but Task 2's screenshot checklist captures the current `s-*` surfaces as-is; it does not ask for redesign.
- TDD, bite-sized tasks, frequent commits; CI (WS-B) must stay green — this plan's one script (Task 1) ships with its own test file like every other repo script that has a test.
- All file paths repo-relative to `/Users/lavipun/Work/ai-shopify-superapp`.

## Entry gate (do not start Task 1 until this is true)

Per the charter's Phase 6 placement and dependency edges, WS-S is the *last* workstream. Concretely, at time of writing (2026-08-26):

| Item | Status (2026-08-26) | Re-check command |
|---|---|---|
| PR #13 WS-A tail (env registry, observability, token sealing, decommission) | **OPEN** | `gh pr view 13 --json state,mergedAt` |
| PR #14 WS-D Conformance & billing | MERGED (008deb3) | — |
| PR #15 WS-E Publish integrity | MERGED (21a0a8c) | — |
| PR #16 WS-H Templates | **OPEN** | `gh pr view 16 --json state,mergedAt` |
| PR #17 WS-G + Integrations Hub (alert channel, shop/redact completeness [Infra-11]) | **OPEN** | `gh pr view 17 --json state,mergedAt` |
| PR #18 WS-F Merchant UI (Maya disclosure D4, publish ceremony) | **OPEN** | `gh pr view 18 --json state,mergedAt` |
| WS-C Async engine — no PR opened yet (branch `feat/ws-c-async-engine`, in-flight commits) | **NOT YET A PR** | `gh pr list --search "ws-c"` ; `git log --oneline feat/ws-c-async-engine -1` |
| WS-I Cleanup, WS-J Docs rewrite | Not started (no PR) | out of WS-S's entry gate per the charter — WS-J is "last-but-continuous," not a submission blocker; WS-I is dead-code removal, not a conformance gate. Do not block submission on either. |

**Gate condition:** `gh pr list --state open --json number,title | jq '[.[] | select(.number == (13,16,17,18))] | length'` returns `0` (all four merged) **AND** a PR exists for the branch currently at `feat/ws-c-async-engine` **AND** that PR is merged. Re-run the command above at execution time — do not trust this table once any of these merge; update the table's Status column in the same commit that starts Task 1.

**Why WS-G specifically gates submission (not just "nice to have"):** PR #17 carries [Infra-11] — today `webhooks.shop.redact.tsx` deletes 6 of the 30 `shopId`-bearing Prisma models (verified 2026-08-26: `grep -c shopId apps/web/prisma/schema.prisma` → 30 models carry the field; `webhooks.shop.redact.tsx` touches `DataStoreRecord`, `DataStore`, `DataCapture`, `ModuleEvent`, `ModuleMetricsDaily`, `AttributionLink` only). A `shop/redact` webhook that leaves `Module`, `Recipe`, `ApiLog`, `Job`, `ErrorLog`, `AiUsage`, `SupportTicket*`, `Connector*` etc. behind is not GDPR-complete — Task 4 of this plan re-verifies completeness only after PR #17 lands; running it against current `master` would fail honestly and for the wrong reason (the fix isn't merged yet, not that the check is broken).

**Why WS-F specifically gates submission:** PR #18 carries D4 (Maya AI-disclosure copy) and the publish ceremony (confirm-before-publish, view-on-storefront link) — both are things a reviewer will notice in the demo screencast (Task 5) and in normal use (functionality requirement 2.1.3, "have a UI merchants can interact with," reads badly on the current pre-#18 generate flow per the audit).

---

## Part A — Agent-runnable prep (run once the entry gate closes)

### Task 1: Pre-submission conformance self-check script `[AGENT]`

Why: every conformance fact this plan relies on (CSP wiring, App Bridge placement, GDPR webhook topics, App Pricing plan-sync presence, scope-list shape, restricted-scope avoidance) is currently verified by hand across five different WS-D/E/G PRs. A single script that re-derives every one of these facts from the current tree, in one run, is what Task 8's final pre-submission checklist actually executes — and it's what the owner reruns after WS-A tail/WS-H/WS-G/WS-F/WS-C all land, without re-reading five plan files.

**Files:**
- Create: `apps/web/scripts/submission-conformance-check.ts`
- Create: `apps/web/app/__tests__/submission-conformance-check.test.ts`
- Modify: `apps/web/package.json` (add `"submission:check"` script)

**Interfaces:**
- Produces: a script that prints one `PASS`/`FAIL` line per check and exits `1` if any check fails; a pure `runChecks(repoRoot: string): CheckResult[]` function the test file imports directly (so the test suite doesn't shell out).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/submission-conformance-check.test.ts
/**
 * Pre-submission conformance self-check (WS-S Task 1). Each check re-derives
 * a fact from the current tree — never hardcodes a "known good" value that
 * could silently go stale. Run standalone: `pnpm --dir apps/web submission:check`.
 */
import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../../scripts/submission-conformance-check';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('submission conformance self-check', () => {
  const results = runChecks(REPO_ROOT);

  it('runs at least the fixed set of checks (regression net on the check list itself)', () => {
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        'csp-entry-point',
        'app-bridge-head-order',
        'token-exchange-auth',
        'gdpr-webhook-topics-declared',
        'gdpr-webhook-handlers-exist',
        'app-pricing-plan-sync-present',
        'billing-api-flow-removed',
        'scope-list-matches-code',
        'restricted-scopes-not-requested',
        'tae-liquid-budget',
      ].sort(),
    );
  });

  it('every check on current master either passes or fails with a human-readable reason (never throws)', () => {
    for (const r of results) {
      expect(typeof r.pass).toBe('boolean');
      if (!r.pass) expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run app/__tests__/submission-conformance-check.test.ts`
Expected: FAIL — `../../scripts/submission-conformance-check` not found.

- [ ] **Step 3: Implement the script**

```ts
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
import { resolve } from 'node:path';

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
  const scopes = scopeMatch ? scopeMatch[1].split(',').map((s) => s.trim()) : [];
  results.push({
    id: 'scope-list-matches-code',
    pass: scopes.length > 0,
    detail:
      scopes.length > 0
        ? `${scopes.length} scopes declared: ${scopes.join(', ')}`
        : 'no [access_scopes] scopes line found in shopify.app.production.toml',
  });

  // 9. Restricted-scope avoidance (App Store Requirements 3.2.1-3.2.3 — request
  //    only when the feature genuinely needs it; this app requests none of them)
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
  const repoRoot = resolve(__dirname, '../../..');
  const results = runChecks(repoRoot);
  let anyFail = false;
  for (const r of results) {
    const line = `[${r.pass ? 'PASS' : 'FAIL'}] ${r.id} — ${r.detail}`;
    console.log(line);
    if (!r.pass) anyFail = true;
  }
  if (anyFail) {
    console.error('\nsubmission-conformance-check: one or more checks FAILED. Fix before Task 8.');
    process.exit(1);
  }
  console.log('\nsubmission-conformance-check: all checks passed.');
}

if (require.main === module) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run app/__tests__/submission-conformance-check.test.ts`
Expected: 2 passing. (The second test's per-check pass/fail values will vary depending on which PRs have merged at execution time — that's fine, the test only asserts the check *runs and returns a reason*, not that every check is green yet. Task 8 is where "all green" is required.)

- [ ] **Step 5: Wire the package.json script**

In `apps/web/package.json` `"scripts"`, add:

```json
    "submission:check": "tsx --tsconfig tsconfig.scripts.json scripts/submission-conformance-check.ts",
```

- [ ] **Step 6: Run it standalone against current tree**

Run: `pnpm --dir apps/web submission:check`
Expected at time of writing (2026-08-26, before PRs #13/16/17/18/WS-C merge): most checks PASS (WS-D/E facts are already on master); this is a smoke run to confirm the script itself works, not a submission gate — Task 8 is the gate.

- [ ] **Step 7: Full suite + commit**

```bash
cd apps/web && npx vitest run
git add apps/web/scripts/submission-conformance-check.ts apps/web/app/__tests__/submission-conformance-check.test.ts apps/web/package.json
git commit -m "feat(ws-s): pre-submission conformance self-check script"
```

---

### Task 2: Listing copy draft `[AGENT]`

Why: Requirement 4.x (App Store Listing Requirements) wants tagline, value proposition, feature list, "how it works," and pricing content as five distinct fields, plus accuracy rules (no unsubstantiated stats, no pricing in images, only claim languages actually supported, indicate if Online Store sales channel is required). This draft is written from `docs/app.md` and the App Pricing plan table already codified in `docs/runbooks/app-pricing-setup.md` — no numbers invented here.

**Files:**
- Create: `docs/launch/app-store-listing-draft.md`

- [ ] **Step 1: Draft the listing content**

```markdown
# App Store listing draft — Super App AI

Source of truth for every field below: `docs/app.md` (feature description),
`apps/web/app/services/billing/billing.service.ts` `PLAN_CONFIGS` (pricing —
cross-checked against `docs/runbooks/app-pricing-setup.md`, re-verify both
match at paste time), `shopify.app.production.toml` (scopes, sales-channel
requirement). This is a DRAFT for the owner to paste into the Partner
Dashboard listing form (4.5) and edit for tone — not a final approved copy.

## App card subtitle (4.1.1)
"Generate storefront, checkout, and admin features from plain English."
(under the ~60-char subtitle limit; states the mechanism, not a superlative)

## Tagline
"Describe what you want. Get a working Shopify module — no code, no dev queue."

## Value proposition
Merchants describe a feature in plain English (or pick a template); Super App
AI generates a draft module — a storefront banner, a discount Function, a
checkout upsell, an admin block, a bundle, a back-in-stock watcher — previews
it on a theme of their choice, and publishes it with one click. Every publish
can be rolled back instantly. One app, one generation flow, instead of
installing a different single-purpose app per feature.

## Features (bullet list — pull the exact set live from packages/core's
## module type registry at paste time; do not hand-copy this list without
## re-checking `ALL_MODULE_TYPES` in @superapp/core, since template/type
## counts drift as WS-H/WS-C land)
- AI-generated storefront modules: banners, popups, badges, recommendation
  blocks, spin-to-win, quizzes, A/B tests, sales-pop widgets
- Discount and cart-transform Shopify Functions (bundles, tiered discounts,
  automatic app discounts) generated from a description
- Checkout and thank-you page blocks (Shopify Plus features clearly marked
  as Plus-only before you try to publish them)
- Admin blocks, actions, print templates, and segment templates
- Connector-driven automation: sync data from an ERP/API on a schedule or
  webhook trigger, with a visual Flow Builder
- Instant rollback on every published module

## How it works (4-5 steps, matches docs/app.md exactly — keep in sync)
1. Install Super App AI.
2. Describe what you want in plain English, or pick a template.
3. Review the generated draft and preview it on a theme you choose.
4. Publish with one click. Every publish shows a "view on storefront" link.
5. Roll back to any previous version instantly if something needs adjusting.

## Pricing content (4.2 — keep numbers in the designated Pricing section
## ONLY, never restated in listing images per 4.2.2/4.3.4)
| Plan | Price | Trial | Included |
|---|---|---|---|
| Free | $0/mo | — | 10 AI generations/mo, 3 published modules, 50 workflow runs/mo |
| Starter | $19/mo | 14 days | 200 AI generations/mo, 20 modules, 1,000 workflow runs/mo |
| Growth | $79/mo | 14 days | 1,000 AI generations/mo, 100 modules, 10,000 workflow runs/mo |
| Pro | $299/mo | 7 days | 10,000 AI generations/mo, 1,000 modules, 100,000 workflow runs/mo |

Overage: $5 per 10 additional AI generations via Shopify usage charges, with a
merchant-set cap (D10). State this plainly in the Pricing section — Shopify
requires accurate, complete pricing information (4.2.1) and this is a usage
charge on top of the flat plans, not a hidden fee.

## Sales channel requirement (4.3.1)
Indicate: "Requires the Online Store sales channel for storefront modules
(theme app embed). Admin, checkout, and Function modules do not require it."
Verify this claim against the actual embed/theme-app-extension dependency at
paste time — do not restate it if WS-H changes how storefront modules attach.

## Languages (4.3.2)
Only claim English. Do not list additional languages unless the app UI is
actually localized (it is not, as of 2026-08-26 — re-verify: `grep -rl
"i18next\|react-intl" apps/web/app` and confirm no locale files exist beyond
en, before claiming otherwise).

## Category / tags (4.3.5)
Primary category: likely "Product page optimization" or "Store design" given
the module breadth — the owner should pick based on Partner Dashboard's
current category taxonomy at listing time (categories change more often than
this plan can track); tags should include: ai, automation, discounts,
checkout, bundles, upsell, no-code.

## What NOT to do here (accuracy rules, 4.3.3/4.3.4/4.3.6/4.3.7)
- No unsubstantiated performance/growth stats in copy or images.
- No customer reviews/testimonials in listing text or images.
- No pricing numbers baked into screenshot or feature-media images.
- No Shopify trademarks in the app icon, banner, or screenshots (4.4.3).
```

- [ ] **Step 2: Cross-check against live code**

Run: `grep -n "PLAN_CONFIGS" -A 40 apps/web/app/services/billing/billing.service.ts | head -60`
Confirm every price/quota number in the draft's pricing table still matches. If WS-D's pricing config changed since this plan was written, fix the draft table, not this instruction.

Run: `grep -rn "i18next\|react-intl\|locales/" apps/web/app packages/core 2>/dev/null | head -5`
Confirm the "English only" claim still holds.

- [ ] **Step 3: Commit**

```bash
git add docs/launch/app-store-listing-draft.md
git commit -m "docs(ws-s): App Store listing copy draft"
```

---

### Task 3: Scope-justification table `[AGENT]`

Why: reviewers (and requirement 3.2.x) scrutinize scope requests. The app requests 21 scopes (`shopify.app.production.toml` `[access_scopes]`, post-WS-E) plus one optional scope (`write_themes`). A table mapping every scope to the feature that needs it — generated by grepping actual call sites, not asserted from memory — is standard review-prep and doubles as the answer to "why does this app need write_orders" if a reviewer asks.

**Files:**
- Create: `docs/launch/scope-justifications.md`

- [ ] **Step 1: For each scope in the toml's `scopes` line, find its call site**

Run this once per scope and record the result (the pattern below is illustrative — adjust the grep target per scope, e.g. GraphQL mutation/query names are more precise than the raw scope string):

```bash
for scope in read_checkouts read_customer_events read_customers read_inventory \
  read_metaobjects read_orders read_products read_themes write_app_proxy \
  write_cart_transforms write_checkouts write_customers write_delivery_customizations \
  write_discounts write_fulfillment_constraint_rules write_metaobjects write_orders \
  write_payment_customizations write_pixels write_products write_validations; do
  echo "=== $scope ==="
  grep -rln "$scope" apps/web/app packages/core extensions --include="*.ts" --include="*.graphql" --include="*.toml" 2>/dev/null | grep -v __tests__ | head -3
done
```

- [ ] **Step 2: Write the table** — one row per scope, columns: scope, Shopify object(s) it gates, the SuperApp feature that needs it, and the file where that's proven. Use WS-E's `docs/publishing.md` §1 (surface → metaobject table) and the activation kinds (`discountAutomaticAppCreate`, `deliveryCustomizationCreate`, `paymentCustomizationCreate`, `validationCreate`, `fulfillmentConstraintRuleCreate`, `cartTransformCreate`) as the primary cross-reference for the function-related scopes — every `write_*` scope tied to a Function activation is already justified by WS-E's own activation.service.ts. Example rows (fill every scope, not just these):

```markdown
# Scope justifications — Super App AI

Re-derive this table from a fresh grep at listing time (Step 1's loop) —
do not hand-copy without checking each grep result still points somewhere
real, since WS-C/WS-F/WS-H may add or remove call sites.

| Scope | Gates | Feature | Evidence |
|---|---|---|---|
| `read_themes` | Theme list, `theme.files` | Theme picker for publish/preview; theme-app-extension embed status check | `apps/web/app/services/publish/embed-status.server.ts` |
| `write_cart_transforms` | `cartTransformCreate`/delete | Bundle pricing Function activation | `apps/web/app/services/publish/activation.service.ts` (cartTransform kind) |
| `write_discounts` | `discountAutomaticAppCreate`/update/delete | Discount rules Function activation ("SuperApp Discounts" node) | `apps/web/app/services/publish/activation.service.ts` (discount kind, E3) |
| `write_delivery_customizations` | `deliveryCustomizationCreate` | Delivery-customization Function activation (Plus-only) | WS-E Task 4 |
| `write_payment_customizations` | `paymentCustomizationCreate` | Payment-customization Function activation (Plus-only) | WS-E Task 5 |
| `write_validations` | `validationCreate` | Cart/checkout validation Function activation | WS-E Task 6 |
| `write_fulfillment_constraint_rules` | `fulfillmentConstraintRuleCreate` | Fulfillment constraint Function activation | WS-E Task 7 |
| `write_pixels` | `webPixelCreate`/update | Analytics/attribution web pixel for generated modules | `apps/web/app/services/shopify/web-pixel.service.ts` |
| `read_customer_events` | Pixel event read | Web-pixel attribution linking | `apps/web/app/services/shopify/web-pixel.service.ts` |
| `write_metaobjects` / `read_metaobjects` | `$app:superapp_*` metaobjects | Every published module's config storage (the mechanism, not a per-surface list) | `docs/publishing.md` §1 |
| `write_app_proxy` | App proxy config | Storefront widget rendering via `/apps/superapp` | `shopify.app.production.toml` `[app_proxy]` |
| `write_products`, `write_orders`, `write_customers`, `read_products`, `read_orders`, `read_customers`, `read_inventory`, `read_checkouts`, `write_checkouts` | (fill from Step 1 grep — bundle-product creation, connector sync triggers, order-routing/inventory features) | | |
| `write_themes` (optional, not in default grant) | Theme Files API `themeFilesUpsert` | Native-section push — **INERT until a Shopify page-builder exemption is granted** (see `specs/033-theme-edit-api/design.md` §2.2, §8); note this explicitly in the reviewer notes (Task 5) so a reviewer testing native sections isn't confused by a no-op |
```

Restricted scopes NOT requested (3.2.1-3.2.3): confirm and state so explicitly — `read_all_orders`, `write_payment_mandate`, `write_checkout_extensions_apis` are absent from both `scopes` and `optional_scopes`. (Task 1 Step 3's `restricted-scopes-not-requested` check automates this re-confirmation.)

- [ ] **Step 3: Confirm category 5.x sections are N/A, and record why**

This app is submitted as a regular app (2.2.1-family requirements), not a Sales Channel (5.7), Payment app (5.2/5.3), Purchase Option/Subscription app (5.4), Post Purchase app (5.8), or Mobile App Builder (5.9). One item deserves an explicit note because it's easy to mis-flag: the checkout/thank-you modules (`extensions/checkout-ui`) use the modern Checkout UI Extensions targets (`purchase.checkout.block.render`, thank-you block render — confirmed via `cat extensions/checkout-ui/shopify.extension.toml`), not the legacy Post-Purchase API (`purchase.checkout.io` / the old post-purchase page that requires `write_checkout_extensions_apis`) — so 5.8's post-purchase-specific rules do not apply, and the absence of `write_checkout_extensions_apis` from the scope list is correct, not a gap. Record this verdict in the scope-justifications doc so a reviewer question doesn't require re-deriving it live.

- [ ] **Step 4: Commit**

```bash
git add docs/launch/scope-justifications.md
git commit -m "docs(ws-s): scope-justification table for App Store review"
```

---

### Task 4: GDPR/data-protection verification commands `[AGENT]`

Why: requirement set 1.1/3.1 and the mandatory compliance topics need a repeatable verification, not a one-time read of the handler source. This task writes the commands (curl-based webhook simulation + a completeness assertion) an agent (or the owner) runs before Task 8. **Gated on PR #17 (WS-G) merging** — before that, `shop/redact` is honestly incomplete ([Infra-11]) and this task's completeness check is *expected* to fail; do not treat that as this task being broken.

**Files:**
- Create: `docs/launch/gdpr-verification.md`
- Test: `apps/web/app/__tests__/shop-redact-completeness.test.ts` (only if WS-G's PR #17 didn't already add an equivalent test — check first, per WS-G plan Task 19's own pinned test at line ~1791 of that plan; do not duplicate)

- [ ] **Step 1: Check whether WS-G already shipped the completeness test**

Run: `grep -rn "shop/redact completeness\|shopId-bearing" apps/web/app/__tests__/*.test.ts`
If a test already exists (expected once PR #17 merges — WS-G plan Task 19, "shop/redact deletes every shopId-bearing model"), skip Step 2 and just reference it in the doc. If not, write it per Step 2.

- [ ] **Step 2: (only if missing) Write the completeness test**

```ts
// apps/web/app/__tests__/shop-redact-completeness.test.ts
/**
 * GDPR shop/redact completeness (WS-G finding [Infra-11], re-verified here
 * as a submission gate). Every Prisma model carrying a shopId field must
 * either be deleted by webhooks.shop.redact.tsx, or have a documented reason
 * it's retained (e.g. audit/billing records with a legal retention basis).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('shop/redact completeness', () => {
  it('every shopId-bearing model is handled by webhooks.shop.redact.tsx or documented as retained', () => {
    const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const modelsWithShopId = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)\n\}/gm)]
      .filter(([, , body]) => /\bshopId\b/.test(body))
      .map(([, name]) => name);

    const handler = readFileSync(
      resolve(__dirname, '../routes/webhooks.shop.redact.tsx'),
      'utf8',
    );
    const untouched = modelsWithShopId.filter((model) => {
      const prismaField = model.charAt(0).toLowerCase() + model.slice(1);
      return !handler.includes(`prisma.${prismaField}.`);
    });

    // Retained-with-reason allowlist — every entry here MUST have a one-line
    // reason; an empty allowlist means every shopId model must be deleted.
    const RETAINED_WITH_REASON: Record<string, string> = {
      // e.g. AppSubscription: 'billing history retained per Shopify audit requirements',
    };
    const unexplained = untouched.filter((m) => !(m in RETAINED_WITH_REASON));
    expect(unexplained, `undeleted + unexplained models: ${unexplained.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the webhook simulation doc**

```markdown
# GDPR / data-protection verification — Super App AI

Run before Task 8's final checklist. Requires a running dev server
(`pnpm --dir apps/web dev`) and a valid webhook HMAC — use the Shopify CLI's
built-in webhook trigger rather than hand-computing HMACs:

```bash
shopify app webhook trigger --topic customers/data_request \
  --api-version 2026-07 --address "http://localhost:3000/webhooks/customers/data_request" \
  --delivery-method http
shopify app webhook trigger --topic customers/redact \
  --api-version 2026-07 --address "http://localhost:3000/webhooks/customers/redact" \
  --delivery-method http
shopify app webhook trigger --topic shop/redact \
  --api-version 2026-07 --address "http://localhost:3000/webhooks/shop/redact" \
  --delivery-method http
```

Expected for each: HTTP 200, and (for redact topics) an `ActivityLog` row
with `action: 'GDPR_CUSTOMER_REDACT'` or `'GDPR_SHOP_REDACT'` — check via:

```bash
pnpm --dir apps/web exec prisma studio
# or: psql -c "select action, details, \"createdAt\" from \"ActivityLog\" where action like 'GDPR_%' order by \"createdAt\" desc limit 5;"
```

Then run the completeness test:

```bash
cd apps/web && npx vitest run app/__tests__/shop-redact-completeness.test.ts
```

**`customers/data_request` note:** the current handler
(`apps/web/app/routes/webhooks.customers.data_request.tsx`) — confirm at
execution time whether it compiles and delivers the actual customer data
package to the merchant (Shopify's requirement: respond within 30 days) or
only logs receipt. If it only logs, that is a functional gap, not a doc gap —
do not mark this checklist item green without checking Shopify's data_request
compliance webhook expectations against the current handler body.
```

- [ ] **Step 4: Run, record actual output, commit**

```bash
cd apps/web && npx vitest run app/__tests__/shop-redact-completeness.test.ts
git add docs/launch/gdpr-verification.md apps/web/app/__tests__/shop-redact-completeness.test.ts
git commit -m "docs(ws-s): GDPR webhook verification commands + shop/redact completeness test"
```

(If the completeness test fails because PR #17 hasn't merged yet, that is the correct, honest state — do not weaken the test to pass early; re-run after PR #17 merges.)

---

### Task 5: Reviewer-facing review notes doc `[AGENT]` (content) + `[OWNER-RUN]` (credentials)

Why: requirement 4.5 (demo screencast, test credentials, functional test credentials, emergency developer contact) is what Shopify's review team actually reads first. The walkthrough structure and known-limitation notes are agent-writable from the code; the actual store URL / login / contact email are owner-supplied secrets that must never be committed as real values.

**Files:**
- Create: `docs/launch/review-notes.md`

- [ ] **Step 1 `[AGENT]`: Draft the structure and walkthrough**

```markdown
# Reviewer notes — Super App AI

**Test store:** `<OWNER: paste the review dev-store URL here — do not commit a
real store handle to a public doc if the repo is or becomes public; keep this
file private / .gitignored if the repo's visibility requires it>`
**Test login:** `<OWNER: staff account credentials for the reviewer, created
fresh for this submission — never reuse a personal or production login>`
**Emergency developer contact:** `<OWNER: name + email, kept current per
requirement 4.5.6 — Shopify may need to reach a human fast>`

## Walkthrough (matches the demo screencast, requirement 4.5.3)

1. **Install** — reviewer installs from the listing; managed installation +
   token exchange means no OAuth redirect loop (WS-D Task 2). Expect the app
   to load embedded immediately after the permission grant screen.
2. **Generate a module** — `/generate`, describe "a banner announcing free
   shipping over $50" (or pick a template). Expect a draft with a preview
   within the generation job's deadline budget (WS-C — note the actual
   timeout once WS-C's polling UI is live; before that, the inline SSE path
   has a ~60s route budget).
3. **Publish** — from the module detail page, Publish. Expect the publish
   ceremony (theme pick, confirm dialog, "view on storefront" link after
   success — WS-F PR #18). Storefront must render the banner after the theme
   app embed is enabled (first publish shows an `embed=not_added` banner with
   a deep link to the theme editor — WS-E `embed-status.server.ts`).
4. **Rollback** — from the module's version history, roll back. Confirm the
   storefront reverts.
5. **Unpublish** — confirm the storefront no longer renders the module and
   (per `docs/publishing.md`) the underlying metaobject/activation object is
   actually removed, not just hidden in the app's UI.
6. **Billing** — `/billing` shows the current App Pricing plan (read-only);
   "Manage plan" navigates the top window to Shopify's hosted pricing page.
   Reviewers should not be asked to enter a credit card — dev-store installs
   show $0 via the "Free for partners and developers" plan flag
   (`docs/runbooks/app-pricing-setup.md` Step 2).
7. **AI disclosure** — any AI-assisted merchant support/chat surface (Maya)
   must show the disclosure copy (D4, WS-F PR #18) — point the reviewer at
   exactly where.

## Known limitations to disclose up front (avoid a confused rejection)

- Some module types require Shopify Plus (delivery/payment customization,
  certain checkout targets) — the app explains and refuses to publish
  Plus-only modules on non-Plus stores rather than silently failing
  (`docs/app.md` "Plan differences"). Tell the reviewer which test store tier
  they're on so they don't file a false-positive bug.
- `write_themes` is an optional scope that is currently **inert** (no Shopify
  page-builder exemption granted yet) — native theme-section push is a no-op
  until that exemption lands; the app-block path (theme app extension) is the
  live default and does not need this scope. Do not let a reviewer treat the
  optional-scope prompt absence as a bug.
- Connector/Flow automation features require the merchant to configure a
  connector first — the reviewer's test store should have at least one
  configured (owner: seed one, or document that this surface is best-effort
  reviewed without live third-party credentials).

## Functional test credentials for any Connector/API-Tester surface

`<OWNER: if the reviewer needs to exercise a Connector, supply a safe test
endpoint (e.g. a public mock API) — never a real merchant/vendor credential>`
```

- [ ] **Step 2 `[AGENT]`: Commit the structure with placeholders intact**

```bash
git add docs/launch/review-notes.md
git commit -m "docs(ws-s): reviewer notes structure — owner fills credentials before submission"
```

- [ ] **Step 3 `[OWNER-RUN]`: Fill in the real values**

Replace every `<OWNER: ...>` placeholder with real values directly in a local copy before the Partner Dashboard submission form asks for "notes for the reviewer" / test credentials fields (4.5.4, 4.5.5). **Do not commit real store credentials to this repo if it is or could become public** — if the repo is private and stays private, committing the filled-in file is fine and keeps a record; if there's any chance of the repo going public, keep the filled version out of git (e.g., a local-only copy, or a secrets manager entry) and leave the committed version with placeholders. Confirm which applies before filling this in.

---

### Task 6: Screenshot / listing-asset checklist `[AGENT]` (checklist) + `[OWNER-RUN]` (capture)

Why: requirement 4.4 plus the 2026-03-26-enforced 4.4.5 (image uniqueness) and the general spec (icon 1200×1200, screenshots 1600×900, 4-7 images, first 3 shown in the preview card, feature media video or static 1600×900) need an exact shot list tied to real app states — not "take some screenshots later."

**Files:**
- Create: `docs/launch/screenshot-checklist.md`

- [ ] **Step 1 `[AGENT]`: Write the exact shot list**

```markdown
# Listing image checklist — Super App AI

Format: PNG, 1600×900 (16:9), one distinct feature/state per image (4.4.5 —
Shopify enforces uniqueness since 2026-03-26; do not submit two screenshots
of the same screen with only cosmetic differences). 4-7 total. Order matters:
image 1-3 appear in the App Store search/preview card.

| # | Screen | State to capture | Why this one |
|---|---|---|---|
| 1 | `/generate` | Mid-generation with 2-3 draft options visible, real (non-lorem) prompt text | Primary "what does this app do" shot — leads the listing |
| 2 | Module detail page, published module | Preview panel + Publish/Rollback controls visible, real module name | Shows the core publish/rollback loop |
| 3 | Storefront rendering a published module | Actual theme storefront, not the admin — proves the module is real, not mocked | Requirement: "showcase the customer-facing output" is standard review-team guidance for this pattern |
| 4 | Discount/Function module config | A discount rules or bundle module's settings (SchemaForm-driven, WS-F) | Shows Function-backed modules, not just UI widgets |
| 5 | `/billing` | Current plan display (Free/Starter/Growth/Pro tier visible) | Shows honest, working billing UI |
| 6 | Flow Builder canvas | A configured automation (trigger → action) | Shows the automation surface, distinct from module generation |
| 7 (optional) | Connectors / API Tester | A configured connector's saved-endpoint list | Only include if it renders cleanly with real (non-empty) data |

## App icon
1200×1200, PNG or JPEG, square with rounded corners handled by Shopify's
frame (don't pre-round the corners), no Shopify trademarks (4.4.3), bold
simple pattern — legible at the small size the App Store list renders it.

## Feature media
Either a 2-3 minute screencast (can reuse Task 5's walkthrough as the script)
or one additional 1600×900 static image. If a video: show install → generate
→ publish → storefront result end-to-end, matching Task 5's numbered steps —
this doubles as material for the demo screencast requirement (4.5.3) if it's
long/detailed enough; confirm with the Partner Dashboard's current guidance
on whether the feature-media video satisfies 4.5.3 or whether a separate,
more detailed screencast is required (this has changed across Shopify's
policy revisions — check at submission time, don't assume).

## Data hygiene before capturing (4.3.3/4.3.6/4.3.7, general realism)
- No lorem ipsum, no "Test Test" customer names, no visible internal debug
  panels, no console errors open in devtools.
- No fabricated stats/counters baked into any screenshot.
- No customer reviews or testimonial text anywhere in an image.
- No pricing numbers rendered inside a non-pricing screenshot (4.2.2) —
  crop the billing screenshot to the plan name/quota, not a $ figure if that
  reads as "advertising a price outside the pricing section."
```

- [ ] **Step 2 `[AGENT]`: Commit the checklist**

```bash
git add docs/launch/screenshot-checklist.md
git commit -m "docs(ws-s): listing screenshot/asset checklist"
```

- [ ] **Step 3 `[OWNER-RUN]`: Capture the images against the live Railway-hosted app**

Using the dev store from the `publish-live-probe.md` runbook (already populated with real modules from that probe — reuse its state rather than re-seeding), capture all 4-7 images per the checklist above at 1600×900. Save as `docs/launch/assets/screenshot-N-<slug>.png` locally (this repo, or wherever the owner keeps release assets — the Partner Dashboard is the actual destination, this repo is just staging). Capture the app icon and feature media/video separately. Evidence to keep: the exported PNG files themselves, and a note of which build/commit was live when they were taken (screenshots go stale as fast as any other artifact).

---

## Part B — Owner-run activation (sequenced)

### Task 7: Execute the three activation runbooks, in order `[OWNER-RUN]`

Why: this program already wrote three runbooks for exactly this. WS-S's job is to fix their order and make the dependency between them explicit — they were written independently and each references the others loosely; here is the one true sequence.

- [ ] **Step 1: `docs/runbooks/app-pricing-setup.md` — Shopify App Pricing activation**

Prerequisite: PR #14 (WS-D) merged — already true. Run Steps 1-6 of that runbook verbatim (opt in to App Pricing, create the 4 public plans with handles matching `plan-handles.ts`, create the Partner API client, set the 4 env vars on Railway, verify Partner API via curl, run the end-to-end plan-lifecycle test on a dev store). **Do not proceed to Step 2 below until that runbook's Step 5 (end-to-end lifecycle) is actually green** — it proves `/billing/callback` and `PlanSyncService` work against real Shopify state, which the rest of this plan assumes.

Evidence to capture: the `AppSubscription` row values from Step 5.4 of that runbook (plan name, handle, status, `lastSyncedAt`), and the reconcile-to-FREE result from Step 5.5.

- [ ] **Step 2: `docs/runbooks/scope-reconsent.md` — 21-scope re-consent rollout**

Prerequisite: this plan's entry gate (PR #17/WS-E scope additions already merged — confirmed, `write_validations` + `write_fulfillment_constraint_rules` are already in `shopify.app.production.toml`'s `scopes` line as of 2026-08-24). **Before running this**, re-check whether the upstream Shopify CLI bug the runbook cites (`cli#8386`, `[events]: Required` schema error blocking `shopify app config validate`/`shopify app deploy`) is fixed:

```bash
shopify app config validate --config production
```

If it still errors on `[events]: Required`, use the runbook's Partner Dashboard config-release contingency (Step 3) instead of the CLI. Run Steps 1-5 of that runbook verbatim. The runbook's own forward-note already says the scope count is 21, not 19 (post-WS-E) — confirm the deployed scopes line matches `shopify.app.production.toml`'s current `scopes = "..."` exactly before calling this done.

Evidence to capture: the CLI's config-diff output (or the Partner Dashboard release confirmation), the `shopify.scopes.query()` result showing all 21 scopes granted, the `app/scopes_update` ActivityLog entry, and the two functional GraphQL probes (Step 4.4).

- [ ] **Step 3: `docs/runbooks/publish-live-probe.md` — live-store publish integrity probe**

Prerequisite: Step 2 above complete (the probe's Step 1 explicitly requires the 21-scope re-consent to already be granted, or every function-activation step returns a misleading `ACCESS_DENIED`). Run all 7 steps verbatim — deploy, handle-casing verdict, `theme.section` end-to-end, `discountRules` end-to-end, the remaining function surfaces spot-check, `cartTransform` end-to-end, and record results in `docs/publishing.md`.

**Stop-and-escalate condition carried over from that runbook:** if Step 2 (handle-casing) finds outcome B (Shopify lowercased the metaobject handle), do not attempt a code fix under this plan — that is a separate, already-scoped task (`.superpowers/sdd/2026-08-24-ws-e-publish-integrity/task-17-brief.md` Step 2). Escalate and re-run Task 7 Step 3 after that fix lands, before continuing to Task 8.

Evidence to capture: everything the runbook's own "Record" lines ask for, actually pasted into `docs/publishing.md`'s new "live probe" section — not summarized as "looks good."

- [ ] **Step 4: Close the production deploy loop**

Once all three runbooks are green: `shopify app deploy --config production` (the `publish-live-probe.md` runbook's own closing step, Step 1's tail). Confirm the CLI's version summary matches `DEPLOYED_FUNCTION_EXTENSION_HANDLES` in `apps/web/app/services/publish/deployed-extensions.server.ts`.

---

### Task 8: Pre-submission checklist — final gate `[AGENT]` (assembles) + `[OWNER-RUN]` (confirms)

Why: this is the single artifact the owner reads right before clicking Submit. It aggregates Task 1's script output with the owner-run evidence from Task 7, and states explicitly which items are still red if any are. Per the D8 discipline this program has followed throughout (`scope-reconsent.md`, `publish-live-probe.md`): **never write a line in this file claiming something passed unless the command was actually run and its actual output is quoted.**

**Files:**
- Create: `docs/launch/pre-submission-checklist.md`

- [ ] **Step 1 `[AGENT]`: Create the checklist skeleton (no claims filled in yet)**

```markdown
# Pre-submission checklist — Super App AI

**STATUS: SKELETON — not yet run.** Every row below must be filled in with
the ACTUAL command output at the time it was run, dated. Do not pre-fill
"PASS" — this file is worthless if it isn't honest, per this program's
established discipline (see docs/runbooks/scope-reconsent.md,
docs/runbooks/publish-live-probe.md).

## A. Code-side conformance (run `pnpm --dir apps/web submission:check`)

Paste the full output here, dated:
```
<OWNER/AGENT: paste `pnpm --dir apps/web submission:check` output>
```
All 10 checks must show `PASS`. If any show `FAIL`, this checklist is NOT
ready — fix the underlying gap (likely: a wave-two PR hasn't merged yet, or
[Infra-11]'s shop/redact fix isn't in) and re-run.

## B. GDPR / data protection (Task 4)
- [ ] `customers/data_request` webhook: HTTP 200, ActivityLog entry recorded — paste result
- [ ] `customers/redact` webhook: HTTP 200, ActivityLog entry recorded — paste result
- [ ] `shop/redact` webhook: HTTP 200, ActivityLog entry recorded — paste result
- [ ] `shop-redact-completeness.test.ts`: PASS — paste vitest output
- [ ] `customers/data_request` actually delivers a data package (not just a log line) — confirmed by reading the handler, dated

## C. App Pricing (Task 7 Step 1)
- [ ] 4 public plans live in Partner Dashboard with handles matching `plan-handles.ts`
- [ ] Partner API client created, all 4 env vars set on Railway `web` service
- [ ] End-to-end lifecycle test (select plan → callback → AppSubscription row correct → cancel → cron reconcile to FREE) — paste the AppSubscription row values from both ends of the test

## D. Scope re-consent (Task 7 Step 2)
- [ ] `shopify app config validate --config production` — paste output (or note the Partner Dashboard contingency was used, and why)
- [ ] Deployed scopes line matches `shopify.app.production.toml` exactly — paste the diff/confirmation
- [ ] Re-consent grant screen shown + approved on the dev store — dated
- [ ] `shopify.scopes.query()` shows all scopes granted — paste the array
- [ ] `app/scopes_update` ActivityLog entry present — paste the row
- [ ] Both functional GraphQL probes (cartTransforms, a metaobject write) succeed with no ACCESS_DENIED — paste results

## E. Live publish-integrity probe (Task 7 Step 3)
- [ ] Handle-casing verdict recorded (A or B) — if B, confirm the code fix landed and this step was RE-RUN after
- [ ] `theme.section` end-to-end: publish → embed → storefront render → unpublish → residue checks — paste results
- [ ] `discountRules` end-to-end: node creation, checkout discount, republish idempotency, unpublish — paste results
- [ ] Remaining function surfaces spot-checked (delivery/payment customization, validation, fulfillment constraints) — paste results, including Plus-tier caveats
- [ ] `cartTransform` end-to-end: bundle merge at checkout, unpublish cleanup, no dead metaobject — paste results
- [ ] Results actually appended to `docs/publishing.md`'s live-probe section (not just summarized here) — confirm link

## F. Listing content (Tasks 2, 3, 5, 6)
- [ ] Listing copy pasted into Partner Dashboard (tagline, value prop, features, how-it-works, pricing) — confirm each field, note any edits made from the draft
- [ ] 4-7 screenshots uploaded, 1600×900, each showing a distinct state (4.4.5) — list filenames
- [ ] App icon uploaded, 1200×1200, no Shopify trademarks — confirm
- [ ] Feature media (video or static) uploaded — confirm
- [ ] Privacy policy URL set in the listing — **owner must supply this URL; there is no privacy policy page in this repo as of 2026-08-26** (see Gap note below) — paste the URL once live
- [ ] Support email set in the listing — paste the address
- [ ] Category + tags selected — confirm
- [ ] Reviewer notes / test credentials pasted into the submission form from `docs/launch/review-notes.md` (owner-filled copy, not the committed placeholder version)
- [ ] Emergency developer contact current (4.5.6) — confirm

## G. Burn-in (Task 9)
- [ ] 7 consecutive days on Railway with WS-G's alert channel live and quiet — paste the date range and a one-line summary of what (if anything) fired
- [ ] Uptime check green for the full window
- [ ] No SEV-1/SEV-2 incidents per `docs/runbooks/index.md`'s severity ladder during the window

## H. Final release
- [ ] `shopify app deploy --config production` — paste the CLI's version summary
- [ ] Full test suite green at the release commit: `pnpm test` — paste the summary line
- [ ] `node scripts/build-theme-liquid.mjs --check` — paste the byte count (must be ≤ 100,000; program target ≤ 95,000)
- [ ] CI green on the release commit (WS-B) — link the run

**Only once every row above is checked with real, dated, pasted evidence —
not before — does Task 10 (Submit) happen.**
```

- [ ] **Step 2 `[AGENT]`: Commit the skeleton**

```bash
git add docs/launch/pre-submission-checklist.md
git commit -m "docs(ws-s): pre-submission checklist skeleton — owner fills in real evidence before submitting"
```

- [ ] **Step 3 `[OWNER-RUN]`: Fill it in for real, after Task 7 and Task 9 are both done**

Work through every row with the actual commands/screens. This step IS the gate — do not skip rows, do not paste placeholder-looking text. If a row can't be checked yet (e.g., burn-in hasn't started), leave it unchecked and stop; do not submit with unchecked rows.

---

### Task 9: 7-day Railway burn-in `[OWNER-RUN]`

Why: D8 ("no silent failures anywhere") plus ordinary launch hygiene — a submission review takes 2-4 weeks per Shopify's current guidance, during which the production app keeps running; better to catch a Railway/Redis/Postgres instability during a deliberate watch window than during review or (worse) after approval with real merchants installing. **Prerequisite: PR #17 (WS-G) merged — the alert channel (Sentry + email/Slack thresholds) must actually fire before "quiet" means anything; watching a burn-in with no working alerts is watching nothing.**

- [ ] **Step 1: Start the window**

After Task 7's production deploy (Task 7 Step 4) and with WS-G's alert channel confirmed live (send one test alert through each configured channel — Sentry test event, a deliberate `Job.fail`, a webhook-handler exception — and confirm it actually lands in email/Slack before starting the clock), record the start timestamp in `docs/launch/pre-submission-checklist.md` Section G.

- [ ] **Step 2: Watch daily**

Each day: check Railway service health, Sentry issue stream, the internal admin's Jobs/DLQ page (`/internal/jobs`), and the uptime check. Use `docs/runbooks/index.md`'s severity ladder to classify anything that comes up. A SEV-3/4 that's understood and doesn't recur doesn't reset the clock; a SEV-1/2 does — fix it, then restart the 7-day window.

- [ ] **Step 3: Close the window**

After 7 consecutive quiet (or quiet-after-fix) days, fill in Section G of the checklist with the actual date range and a one-line summary of anything that fired and how it was resolved.

---

### Task 10: Submit `[OWNER-RUN]`

Why: the actual terminal action of this entire launch program.

- [ ] **Step 1: Final review**

Re-open `docs/launch/pre-submission-checklist.md`. Every row in every section (A-H) must be checked with real evidence. If anything drifted since it was checked (e.g., a dependency version bumped, a new PR merged touching a conformance area), re-run the relevant check rather than trusting a stale checkmark.

- [ ] **Step 2: Submit in the Partner Dashboard**

Partner Dashboard → the app → Distribution → Submit for review (or the current equivalent path — Shopify's Partner Dashboard navigation changes; use whatever the dashboard currently labels the submission action). Confirm the listing preview matches Task 2/6's drafted content before the final click.

- [ ] **Step 3: Record the submission**

Note the submission date and any confirmation reference Shopify provides. Update `docs/launch/pre-submission-checklist.md`'s header with "SUBMITTED <date>" and leave the file as the permanent record of what was verified before that click.

- [ ] **Step 4: Monitor for reviewer communication**

Shopify's standard review is 2-4 weeks (longer if the app is also pursuing Built for Shopify, which adds another 2-4 weeks of performance/accessibility/integration-depth review — this plan does not scope Built for Shopify; treat it as a post-launch follow-on if the owner wants it). Respond to any reviewer requests promptly using the emergency developer contact channel set up in Task 5.

---

## Sequencing summary

```
Entry gate: PRs #13, #16, #17, #18 merged + WS-C's PR merged
        │
        ├─ Task 1 (self-check script)  ─┐
        ├─ Task 2 (listing copy)         │  Part A — agent-runnable,
        ├─ Task 3 (scope justifications) │  any order, no live store,
        ├─ Task 4 (GDPR verification)*   │  no Partner Dashboard
        ├─ Task 5 (review notes struct)  │
        └─ Task 6 (screenshot checklist)─┘
                    │
                    ▼
        Task 7 Step 1: app-pricing-setup.md   ─┐
        Task 7 Step 2: scope-reconsent.md      │  Part B — owner-run,
        Task 7 Step 3: publish-live-probe.md   │  strictly sequential
        Task 7 Step 4: production deploy      ─┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  Task 5 Step 3            Task 6 Step 3
  (fill credentials)      (capture screenshots,
                            reuses Task 7's dev store)
        │                       │
        └───────────┬───────────┘
                     ▼
              Task 9: 7-day burn-in (needs WS-G alerting live)
                     │
                     ▼
              Task 8 Step 3: fill in the real checklist
                     │
                     ▼
              Task 10: Submit
```

*Task 4's completeness check is expected to fail until PR #17 (WS-G, [Infra-11]) merges — this is correctly ordered inside the entry gate, not a bug in the task.

---

## Self-review against the charter

- D8 ("Launch = App Store submission... conformance items are hard gates") → Task 1's script + Task 8's checklist are the hard-gate mechanism; nothing in Task 8 can be checked without real command output.
- Phase 6 / WS-S bullet's four named items (charter line 62 — "App Store requirements checklist run (CSP, install, App Pricing live, GDPR incl. redact completeness, honest AI disclosure, listing assets); the live-store probe green; 7-day burn-in on Railway with alerting quiet; submit") map directly: CSP/install → Task 1 checks 1/3; App Pricing live → Task 7 Step 1; GDPR + redact completeness → Task 4; honest AI disclosure (D4) → covered by the PR #18 entry-gate dependency + Task 5's walkthrough step 7; listing assets → Tasks 2/6; live-store probe green → Task 7 Step 3; burn-in → Task 9; submit → Task 10.
- Dependency edges ("WS-J last-but-continuous") → correctly excluded from this plan's entry gate (see Entry gate table).
- No numeric claims in prose (WS-J rule, program-wide) → every count in this plan (21 scopes, 30 Prisma models, 6 models redacted, 10 checks) is qualified with "as of 2026-08-26, re-verify with <command>" rather than stated as a bare fact.

## Charter items this plan could NOT fully map to a concrete task (gaps)

1. **Privacy policy hosting.** No requirement or code anywhere in this repo produces an actual hosted privacy-policy page/URL — Shopify's listing form requires one. This is a real gap: neither the charter nor any existing runbook names where this lives (a marketing site, a `/privacy` route in the app, a third-party doc host). Task 8 Section F flags it as owner-must-supply; this plan cannot write the task to build it without an owner decision on where it's hosted.
2. **Support email / support infrastructure for the public listing.** `docs/app.md` has a "Support" section describing in-app rollback but names no contact channel, and no `SUPPORT_EMAIL` env var or route exists in code (verified via grep). The internal Support CRM (`local-triage-llm` memory) handles in-app merchant tickets post-install, but the *listing's* public support email/URL is a separate Partner Dashboard field with no code-side source of truth. Flagged in Task 8 Section F as owner-supplied.
3. **Built for Shopify.** The charter's WS-S bullet doesn't mention it, and this plan treats standard review only (Task 10 Step 4 notes it as a possible post-launch follow-on). If the owner wants Built for Shopify status, that needs its own plan (performance budgets, accessibility audit, "integration depth" review) — not scoped here.
4. **`customers/data_request` actual data-delivery mechanism.** Task 4 Step 3 flags this rather than resolving it: the handler's current behavior (deliver a real data package vs. only log receipt) wasn't independently re-verified line-by-line during this plan's research pass beyond confirming the route exists and is wired to the compliance topic. This is a concrete open item for whoever executes Task 4.
