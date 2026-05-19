# Fix log — QA pass 2026-05-19

## Fixed during continuation pass (production readiness)

### 6. Remix production build (Blocker)

**Symptom:** `pnpm --filter web build` failed — server-only module in client graph for `internal.ai-assistant.probe.tsx`.

**Fix:** Moved `probeAssistantTargets` to `app/services/ai/assistant-probe-route.server.ts`; route exports only `loader`/`action`.

### 7. innerHTML delete modals (High)

**Symptom:** XSS-prone `innerHTML` for delete confirmation in connectors/flows index.

**Fix:** Hidden Remix `<Form method="post">` + `requestSubmit()` on confirm.

**Files:** `connectors._index.tsx`, `flows._index.tsx`

### 8. Empty internal page titles (Medium)

**Fix:** `internal-route-meta.ts` + `meta` on `internal.tsx` / `internal.login.tsx`.

### 9. Merchant routes without session (High)

**Symptom:** `/advanced` and `/picker` returned **200** without Shopify session.

**Fix:** `shopify.authenticate.admin(request)` in loaders (parity with other merchant routes).

### 10. `/modules` auth swallowed as 500 (Medium)

**Symptom:** Playwright saw HTTP **500** for unauthenticated `/modules` under parallel load.

**Fix:** Authenticate **before** try/catch; only DB errors return 500 JSON.

**Files:** `modules._index.tsx`

### 11. CI web-build baseline skip removed

**Fix:** `scripts/v2-test-matrix.mjs` — `build-web` no longer `knownBaselineFailure`; `test:v2:fast` runs production build.

### 12. Audit critical protobufjs (High)

**Fix:** Root `pnpm.overrides.protobufjs: ">=8.0.1"` — **0 critical** after `pnpm install`.

### 13. E2E expansion

- `e2e/internal/crawl-auth.spec.ts` — document titles + route crawl
- `e2e/internal/a11y-auth.spec.ts` — axe serious violations
- `e2e/merchant/auth-guards.spec.ts` + `playwright.merchant.config.ts`
- `rollout-cutover.test.ts` — isolated env (no suite pollution from `.env`)

## Fixed during this pass

### 1. Merchant template preview missing sandbox shell (High)

**Symptom:** Playwright `preview-sandbox.spec.ts` failed — expected copy “Sandboxed preview” and sandboxed iframe metadata.

**Root cause:** `internal.templates.$templateId.preview.tsx` used an inline merchant HTML shell without the shared `previewShellResponse()` helper (badge, sandbox iframe, security copy).

**Fix:** Merchant `mode=merchant` now delegates to `previewShellResponse()` with artifact URL pointing at the inner preview route.

**Files:** `apps/web/app/routes/internal.templates.$templateId.preview.tsx`

### 2. Flaky AI assistant Import E2E (Medium)

**Symptom:** `getByRole('button', { name: 'Import' })` detached during Polaris re-render; optional `data-testid` on `Button` did not reach DOM.

**Fix:** Wrapped Import control in `<span data-testid="memory-import">`; E2E clicks nested button inside test id.

**Files:** `apps/web/app/routes/internal.ai-assistant.tsx`, `apps/web/e2e/internal/ai-assistant.spec.ts`

### 3. E2E auth setup timeout (Medium)

**Symptom:** First Playwright run timed out on login — `INTERNAL_ADMIN_PASSWORD` env not aligned with server.

**Mitigation:** Use `INTERNAL_ADMIN_PASSWORD` from `apps/web/.env` when running E2E against a live `dev:internal` server (`Hello@321` in local env).

### 4. Metaobject backfill hydration warning (Low)

**Symptom:** React warned about invalid HTML (`<ol>` nested inside `<p>`) on `/internal/metaobject-backfill`.

**Fix:** Moved ordered list outside the paragraph.

**Files:** `apps/web/app/routes/internal.metaobject-backfill.tsx`

### 5. Authenticated internal route crawl (QA harness)

**Added:** `e2e/internal/crawl-auth.spec.ts` — 21 internal routes, import modal, templates index; filters Vite dev abort noise.

## Not fixed (documented as risks)

- `pnpm audit` **19 high** / 18 moderate transitive advisories (OpenTelemetry/grpc/brace-expansion chain).
- `preview.service.ts` `innerHTML` for trusted preview HTML shell (lower risk than delete modals).
- Full **embedded Shopify OAuth** E2E in CI — see [merchant-oauth-checklist.md](./merchant-oauth-checklist.md).
