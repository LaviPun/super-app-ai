# Feature Specification: Platform V2 Phase 26 — Publish + Functions Create/Push/Republish Reliability

**Feature Directory**: `026-publish-functions-reliability`

**Created**: 2026-06-14

**Last updated**: 2026-06-14

**Status**: **In progress** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`docs/module-system-v2.md`](../../docs/module-system-v2.md). See also [`docs/shopify-dev-setup.md`](../../docs/shopify-dev-setup.md) (Functions two-layer deploy) and [`docs/superapp-surface-inventory.md`](../../docs/superapp-surface-inventory.md) (publish status matrix).

## Goal

Make every module reliably publishable — or honestly gated. Codify the two-layer Functions contract, fail preflight loudly when a function's extension isn't deployed, close the 9 AUDIT-only gaps (real wiring or an explicit "not publishable yet" gate — never report "published" when nothing deployed), and make republish idempotent (upsert, not duplicate). Workstream WS5; paired with WS4/025 to kill the "previewed buttons, published nothing" bug class.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **In progress** |
| Contract | `packages/platform-contracts/src/publish-functions.ts` (`FunctionDeploymentContractSchema`, `ModulePublishPreflightResultSchema`, `RepublishDiffSchema`, `computeRepublishDiff`) + test |
| App code | `classifyModulePublishability` + `AUDIT_ONLY_TYPES` + `FUNCTION_EXTENSION_HANDLES` in `publish-preflight.server.ts` |
| Tests | `apps/web/app/__tests__/publish-functions-reliability.test.ts` |

## Acceptance

- Two-layer Functions contract codified: (a) wasm extension ships via `shopify app deploy`; (b) the app upserts per-module config to a metaobject the function reads at runtime.
- Preflight fails loudly when a function type has no deployed extension behind it.
- Each of the 9 AUDIT-only types is either real-wired or explicitly gated "not publishable yet" — never reported "published" when nothing deployed.
- Republish is idempotent (upsert, not duplicate); unpublish removes the config.

## Success criteria

- **SC-001**: No type silently no-ops on publish — each either deploys or is gated with a clear message (test).
- **SC-002**: Republish is idempotent across create/republish/unpublish.
- **SC-003**: Functions two-layer contract documented + preflight enforces extension presence.
- **SC-004**: Smoke path passes for the three representative types (theme.section, a function, a checkout block).

### Expanded criteria

- **SC-001a**: `classifyModulePublishability` returns `deployable | gated | blocked` with `willDeploy`; `willDeploy === false` always carries a reason. The gated set equals the compiler's AUDIT-only dispatch.
- **SC-002a**: `computeRepublishDiff` yields `create / update (by metaobjectId) / noop / delete`; identical config ⇒ `noop` (no duplicate).
- **SC-003a**: `FunctionDeploymentContractSchema` carries `extensionHandle` + `wasmDeployed` (layer a) and `configMetaobjectType` (layer b); blocked preflight names the missing extension.

> Note: `ModulePublishPreflightResultSchema` is named to avoid collision with the pre-existing worker-job `PublishPreflightResultSchema` in `worker-payloads.ts` (that one is the async preflight job result; this one is the per-module publishability classification).
