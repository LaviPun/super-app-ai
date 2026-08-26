# Changelog

All notable merged changes to this repo, grouped by the launch-program workstream (`WS-<letter>`) that landed them. See [`docs/superpowers/plans/2026-08-24-launch-program.md`](./docs/superpowers/plans/2026-08-24-launch-program.md) for the workstream plan these entries track.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/); entries are grouped by merge, not by release version, since this app doesn't cut numbered releases.

## [Unreleased]

WS-F (merchant UI), WS-G (integrations/ops), WS-H (templates), WS-C (async engine), and WS-I (cleanup) are in flight but not yet merged to `master` as of this file's seed date (2026-08-27) — see the launch program doc for status.

## [2026-08-25] — WS-E: Publish integrity

Activations, unpublish, rollback, and a per-op publish ledger (commit `21a0a8c`, PR #15).

### Added
- Canonical `ACTIVATION_WIRED_FUNCTION_TYPES` gate seam covering every `functions.*` type
- `ActivationService` + `FunctionActivation` table — discount, delivery-customization, payment-customization, checkout-validation, fulfillment-constraint, and cart-transform activations wired end to end; each corresponding function type un-gated from `needs_runtime` as its activation landed
- `UnpublishService` inverting publish (refs, metaobjects, activations, web pixel) + a merchant Unpublish button; delete now unpublishes from Shopify first on all three delete routes
- `RollbackService` — rollback recompiles and republishes; the DB only flips on success
- Per-op publish ledger + `PublishPartialFailureError` with republish guidance
- Post-publish app-embed check + a theme-editor activation deep link

### Changed
- Deleted the progressive-publish theater (fake canary + DB-only auto-rollback), replaced by the real `RollbackService`
- `docs/publishing.md` rewritten to reflect the ledger/activation/unpublish/rollback/embed reality

### Fixed
- Plan-aware cartTransform activation extracted, with double-activation dedup on blueprints
- Internal-ops publish intent now runs the real publish pipeline before the DB transition
- Shared-activation guards + singleton-per-functionKey + unpublish symmetry (final-review pass)

Also on this date: `c201150` — post-merge lint cleanup restoring warning-cap headroom after the WS-E merge.

## [2026-08-24] — WS-D: Shopify conformance + App Pricing billing

Commit `008deb3` (PR #14).

### Added
- Per-shop `frame-ancestors` CSP emission in `entry.server.tsx` [Conf-1]
- Token-exchange embedded auth + auth redirect fallback [Conf-2]
- App Pricing plan-state sync — Partner API `activeSubscription` + handle map [Conf-4]
- Welcome-link callback + cron plan reconcile, since App Pricing has no webhooks [Conf-5]

### Changed
- `app-bridge.js` now loads in `<head>` before `polaris.js`; dropped the `AppProvider` body injection [Conf-3]
- Shopify Admin API bumped 2026-04 → 2026-07 (app, webhooks, extensions); Customer Account API bumped 2026-04 → 2026-07

### Removed
- `appSubscriptionCreate` in-app charge flow removed entirely; `/billing` is now read-only with a Shopify-hosted manage-plan link (D3)

### Fixed
- `/internal` CSP guard uses the matched-route id instead of a case-sensitive path parse [Conf-1]
- Quota resolution honors subscription status — non-`ACTIVE` now resolves to `FREE` [Deploy-4]
- Embedded params preserved through the welcome callback; internal admin reads the billing plan from the subscription (final-review fixes)

Also on this date: `fa48bae` — `deriveEffectivePlan` moved to a client-safe plan-status module (build fix following this merge).

## [2026-08-24] — WS-A: Railway hosting

Postgres cutover, `/healthz`, production image, provisioning (tasks 1–9). Commit `1b2b5e2` (PR #12).

### Added
- Flipped the Prisma datasource to Postgres with a regenerated baseline migration, plus a local dev Postgres/Redis stack
- Idempotent, DMMF-driven SQLite→Postgres data-copy script
- `/healthz` resource route checking Postgres + Redis, with a production timeout safety fix for Railway
- Production Dockerfile (multi-stage pnpm) + start script for `apps/web`
- Worker service skeleton — Redis-connected, health-served entrypoint
- Railway config-as-code for the web + worker services
- Split Shopify app config: production config now linked to the stable Railway domain (no auto-URL rewriting), local dev keeps the CLI's auto-updating tunnel config

### Fixed
- Resolved a `Module`↔`ModuleVersion` foreign-key cycle via nullable-edge deferral

### Changed
- CI adapts `DATABASE_URL` and Postgres service containers to the `postgresql` provider

Also on this date: `9916227` — triggered Railway's first deploy via a repaired GitHub integration.

## [2026-08-24] — WS-QF: Quick fixes

Security, billing honesty, quota enforcement. Commit `cb54a9b` (PR #11).

### Fixed
- Internal SSO callback now enforces the `INTERNAL_SSO_ALLOWED_EMAILS` allowlist
- Per-IP rate limit + failed-attempt audit added to internal login
- `getClientIp` uses the rightmost XFF entry and prefers `cf-connecting-ip`
- Activation-unwired function types gated `needs_runtime` (D6 step 1 — precursor to WS-E's activation work)
- Pending module deletes commit on unmount instead of silently cancelling
- AI stream failures now fail honestly (`jobs.fail` + an error frame) with single billing per request; the stream-drop double-bill window closed via `correlationId` dedupe; failed legacy attempts zero-billed
- Module cap enforced at publish, agent create, and duplicate
- Activity log filters combine `action` + `excludeActions` instead of one clobbering the other

## [2026-08-24] — WS-B: Quality gates + CI on master

Commit `c6cd399` (PR #10).

### Added
- CI now runs on `master` push/PR; added the wasm-function-extension and TAE Liquid-budget jobs; workspace package dists now build everywhere they're needed
- `apps/web` production Dockerfile + a master-push image-build workflow (the hook point WS-A's deploy later used)
- Nightly eval flywheel now builds its own dependencies and fails loudly instead of silently skipping on a missing report

### Fixed
- Theme-check gate: NSEC-VHERO overlay opacity values corrected to multiples of 0.1 (Shopify's section-setting schema requirement)
- wasm function-extension suites given a realistic build budget; `test:packages`/`test:functions` split so CI can give the wasm suites their own Rust/CLI toolchain job
- Golden wasm fixtures corrected for `shopify_function`'s omit-not-null serialization; `Cargo.lock` pinned and tracked across all six wasm extensions to close a serialization-drift blind spot
- Pre-commit typecheck hook actually gates now (a silent `|| true` was removed)
- Several internal-admin accessibility/hydration fixes: accessible names/headings/button semantics, relative-time hydration mismatches app-wide, dev-server HMR no longer targets a placeholder tunnel host

---

This file is updated by each WS as it lands (see [`docs/superpowers/plans/2026-08-24-launch-program.md`](./docs/superpowers/plans/2026-08-24-launch-program.md) dependency notes), not retroactively regenerated — WS-J only seeds the backlog as of its own execution date (2026-08-27).
