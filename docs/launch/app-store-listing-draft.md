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
## re-checking `ALL_MODULE_TYPES` in `packages/core/src/recipe.ts`, since
## template/type counts drift as WS-H/WS-C land)
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

## How it works (5 steps, matches docs/app.md "How it works" verbatim —
## keep in sync if that section changes)
1. Install Super App AI.
2. Describe what you want in plain English, or pick a pre-built template.
3. Super App AI generates a Draft module. Preview it on a theme you choose.
4. Publish with one click.
5. Roll back to any previous published version at any time.

## Pricing content (4.2 — keep numbers in the designated Pricing section
## ONLY, never restated in listing images per 4.2.2/4.3.4)

Verified against `PLAN_CONFIGS` in
`apps/web/app/services/billing/billing.service.ts:26-79` (2026-08-27):

| Plan | Price | Trial | Included |
|---|---|---|---|
| Free | $0/mo | — | 10 AI generations/mo, 3 published modules, 50 workflow runs/mo |
| Starter | $19/mo | 14 days | 200 AI generations/mo, 20 modules, 1,000 workflow runs/mo |
| Growth | $79/mo | 14 days | 1,000 AI generations/mo, 100 modules, 10,000 workflow runs/mo |
| Pro | $299/mo | 7 days | 10,000 AI generations/mo, 1,000 modules, 100,000 workflow runs/mo |

Plans are billed exclusively through **Shopify App Pricing** (`PlanSyncService`,
`apps/web/app/services/billing/plan-sync.service.ts`) — the app does not
create charges itself (D3, WS-D Tasks 4-7). Quotas are **hard monthly caps**:
when a plan's `aiRequestsPerMonth` (or any other quota) is reached, the app
blocks the action server-side and shows an upgrade message
(`apps/web/app/services/billing/quota.service.ts:10-27`, "Monthly ... quota
exceeded ... Upgrade to get more"; also documented in `docs/app.md`
"Plans & quotas"). State this plainly as "included, hard limit — upgrade for
more" — do NOT describe usage-based overage billing in the listing.

**Correction vs. an earlier internal plan (D10 in
`docs/superpowers/plans/2026-08-24-launch-program.md`):** that plan proposed
a "$5 per 10 additional generations" Shopify usage-charge overage on top of
the flat plans. Re-verified 2026-08-27 on master @ 8a656af (post
WS-C/F/G/H merge): **no usage-charge
mechanism exists in code** — there is no `AppUsageRecord`/usage-charge model
in `apps/web/prisma/schema.prisma` and no call site for
`appUsageRecordCreate` anywhere in `apps/web/app` or `packages/core`. Quotas
are enforced as hard caps only (see above). Re-verify with
`grep -rln "appUsageRecordCreate\|AppUsageRecord" apps/web` before every
listing update — if it still returns nothing, do not list an overage charge;
if a future workstream ships usage-based billing, update this section and
cite the new file:line.

## Sales channel requirement (4.3.1)
Indicate: "Requires the Online Store sales channel for storefront modules
(theme app embed). Admin, checkout, and Function modules do not require it."
Verify this claim against the actual embed/theme-app-extension dependency at
paste time (see `apps/web/app/services/publish/embed-status.server.ts`) — do
not restate it if WS-H changes how storefront modules attach.

## Languages (4.3.2)
Only claim English. Re-verified 2026-08-27:
`grep -rl "i18next\|react-intl" apps/web/app` returns no matches, and no
locale directory exists under `apps/web/app`. Do not list additional
languages unless that changes.

## Category / tags (4.3.5)
Primary category: likely "Product page optimization" or "Store design" given
the module breadth — the owner should pick based on Partner Dashboard's
current category taxonomy at listing time (categories change more often than
this plan can track); tags should include: ai, automation, discounts,
checkout, bundles, upsell, no-code.

## Contact & Legal (4.5 — Partner Dashboard listing form)
- **Support email:** `support@lavipun.com` — owner decision, resolved 2026-08-27.
- **Privacy policy URL:** owner-deferred: URL to be provided before
  submission (hard blocker for Task 8/10). Do not paste a placeholder URL
  into the Partner Dashboard form — leave the field empty until the owner
  supplies the real one.

## What NOT to do here (accuracy rules, 4.3.3/4.3.4/4.3.6/4.3.7)
- No unsubstantiated performance/growth stats in copy or images.
- No customer reviews/testimonials in listing text or images.
- No pricing numbers baked into screenshot or feature-media images.
- No Shopify trademarks in the app icon, banner, or screenshots (4.4.3).
- No usage-based overage claim until a real usage-charge mechanism ships in
  code (see Pricing content correction above).
