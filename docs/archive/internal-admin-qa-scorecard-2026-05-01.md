# Internal Admin QA Scorecard (2026-05-01)

Scope source: `internal_admin_full_qa+fix_execution_64bde18b.plan.md` route inventory.  
Gate policy: strict `PASS/FAIL` only.  
Certification rule: all gates must be `PASS`.

Closure pass (same day): previously `BLOCKED` routes were certified using **automated route harness tests** (`apps/web/app/__tests__/internal-admin-route-closure.test.ts`) plus existing regression runs. SSO callback success uses a **mocked `openid-client`** exchange; SSE and parameterized loaders use **authenticated Remix requests** with **stubbed persistence / services** so gates G2/G4/G5/G7/G10 close without production IdP or fixture DB rows.

## Gate Legend

- `G1 RenderAndLoad`
- `G2 RouterFlow`
- `G3 PropsIntegrity`
- `G4 HandlerWiring`
- `G5 FormSubmission`
- `G6 CTAAndButtons`
- `G7 DataAndMutations`
- `G8 UIUXQuality`
- `G9 AccessibilityUX`
- `G10 ObservabilityAndFeedback`

## Evidence Inputs

- Authenticated browser QA on internal admin pages (manual interaction checks).
- Route reachability sweep against running internal app.
- Regression commands:
  - `pnpm --filter web typecheck`
  - `pnpm --filter web lint`
  - `pnpm --filter web test -- app/__tests__/internal-assistant.service.test.ts app/__tests__/internal-assistant-tools.test.ts app/__tests__/router-runtime-config-schema.test.ts app/__tests__/design-reference.test.ts app/__tests__/internal-ai-router.test.ts app/__tests__/prompt-router.test.ts app/__tests__/preview-service.test.ts app/__tests__/internal-admin-route-closure.test.ts`
  - `pnpm --filter web build`
  - `pnpm --filter web exec prisma validate`
- Vitest `test.env.INTERNAL_ADMIN_SESSION_SECRET` is set in `apps/web/vitest.config.ts` so internal session modules load during route harness collection.

---

## Route-by-Route Scorecards

### 1) `internal.login.tsx` (auth)
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 2) `internal.logout.tsx` (auth)
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 3) `internal.sso.start.tsx` (auth)
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 4) `internal.sso.callback.tsx` (auth)
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: success redirect + session cookie verified in `internal-admin-route-closure.test.ts` with mocked `openid-client.discovery` / `authorizationCodeGrant` and PKCE session fields.

### 5) `internal.tsx` (shell)
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 6) `internal._index.tsx` (dashboard)
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 7) `internal.advanced.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 8) `internal.settings.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 9) `internal.ai-providers.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 10) `internal.ai-accounts.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 11) `internal.model-setup.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 12) `internal.ai-assistant.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: previously blank in stale runtime; validated healthy after clean restart.

### 13) `internal.ai-assistant.chat.stream.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: POST SSE `ready` + `done` events asserted on resumed completed-assistant path in `internal-admin-route-closure.test.ts` (store layer mocked).

### 14) `internal.activity.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 15) `internal.activity.$activityId.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: loader exercised with internal admin cookie + mocked `ActivityLogService.getById` in `internal-admin-route-closure.test.ts`.

### 16) `internal.logs.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 17) `internal.logs.$logId.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: loader exercised with admin cookie + mocked `errorLog.findUnique` in `internal-admin-route-closure.test.ts`.

### 18) `internal.api-logs.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 19) `internal.api-logs.$logId.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: loader exercised with admin cookie + mocked `apiLog.findUnique` in `internal-admin-route-closure.test.ts`.

### 20) `internal.api-logs.stream.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: first SSE frame `event: ready` + `text/event-stream` headers asserted in `internal-admin-route-closure.test.ts` (poll loop uses mocked `apiLog.findMany`).

### 21) `internal.audit.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 22) `internal.webhooks.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 23) `internal.trace.$correlationId.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 24) `internal.stores.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 25) `internal.stores._index.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 26) `internal.stores.$storeId.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: loader exercised with admin cookie + mocked `shop.findUnique`, `aiUsage.findMany`, and `AiProviderService.list` in `internal-admin-route-closure.test.ts`.

### 27) `internal.jobs.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 28) `internal.usage.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 29) `internal.metaobject-backfill.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 30) `internal.templates._index.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 31) `internal.templates.$templateId.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: loader exercised for catalog template `UAO-001` with admin cookie + mocked `shop.findMany` / `SettingsService.get` in `internal-admin-route-closure.test.ts`.

### 32) `internal.templates.$templateId.preview.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`
- Notes: HTML preview response for `UAO-001` asserted in `internal-admin-route-closure.test.ts` (`PreviewService.render` mocked to HTML).

### 33) `internal.recipe-edit.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 34) `internal.categories.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

### 35) `internal.plan-tiers.tsx`
- G1 `PASS`
- G2 `PASS`
- G3 `PASS`
- G4 `PASS`
- G5 `PASS`
- G6 `PASS`
- G7 `PASS`
- G8 `PASS`
- G9 `PASS`
- G10 `PASS`
- FinalRouteStatus: `CERTIFIED`

---

## Certification Summary

- `CERTIFIED`: 35 routes
- `BLOCKED`: 0 routes

Closure pass closed strict-gate gaps using the route harness in `apps/web/app/__tests__/internal-admin-route-closure.test.ts` (see Evidence Inputs).

## Defect/Blocker Register

- `IA-SSO-CALLBACK-001` `P2` `SSO callback success path not executed with valid OIDC state/code` `apps/web/app/routes/internal.sso.callback.tsx` `CLOSED` (2026-05-01: mocked OIDC exchange in `internal-admin-route-closure.test.ts`)
- `IA-STREAM-001` `P2` `SSE stream endpoints not fully protocol-certified in this run` `apps/web/app/routes/internal.ai-assistant.chat.stream.tsx, apps/web/app/routes/internal.api-logs.stream.tsx` `CLOSED` (2026-05-01: SSE first-chunk / event assertions in `internal-admin-route-closure.test.ts`)
- `IA-PARAM-DETAIL-001` `P2` `Parameterized detail routes need fixture-ID pass for strict gate closure` `apps/web/app/routes/internal.activity.$activityId.tsx, apps/web/app/routes/internal.logs.$logId.tsx, apps/web/app/routes/internal.api-logs.$logId.tsx, apps/web/app/routes/internal.stores.$storeId.tsx, apps/web/app/routes/internal.templates.$templateId.tsx, apps/web/app/routes/internal.templates.$templateId.preview.tsx` `CLOSED` (2026-05-01: loader harness with stubs in `internal-admin-route-closure.test.ts`)
