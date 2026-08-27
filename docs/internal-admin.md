# Internal Developer Admin Dashboard

This dashboard is for the **app owner** (your team), not merchants.
It is protected by `INTERNAL_ADMIN_PASSWORD` and an optional SSO (OIDC) flow
gated by an email allowlist — see [Security](#security).

> **Last audited: 2026-08-27**, against `master@c201150`. This is an audit +
> refresh pass (per WS-J Task 9), not a ground-up rewrite — most of this doc
> was already accurate; corrections and additions are called out where they
> occur.

> **UI:** As of the 2026-06-16 SuperApp redesign, the admin renders through the vendored `AdminChrome` shell (`apps/web/app/routes/internal.tsx`) — a collapsible left rail grouped **Overview · Operations · Support · Platform · AI & Models · Catalog**, a top bar with global **⌘K** command palette, notifications, avatar, and a health footer. This replaces the prior Polaris `Frame`; auth and loaders are unchanged. The shell is built entirely on the vendored `~/components/admin/page-kit` component set — no `@shopify/polaris` import anywhere under `apps/web/app/routes/internal.*` or `apps/web/app/internal-admin/` (confirmed by repo search); do not confuse this with the merchant-facing embedded app, which does use Polaris. See [DESIGN.md](../DESIGN.md) § *Implemented Design System*.
>
> **Theme: light-only, by design.** `apps/web/app/styles/superapp/shell.css` pins `color-scheme: light` on the admin viewport root, with an explicit comment citing "owner decision 2026-07-14 — no dark theme" — this is intentional so browsers/UA widgets that default to dark don't get auto-dark-mode-rewritten against an intentionally-light surface. If you're auditing for DESIGN.md compliance, a dark-mode toggle proposal for this shell is a deviation from a real, dated decision, not an oversight.
>
> **Operations nav consolidation.** The "Logs" item under **Operations** is one nav entry that groups four routes — Activity, API logs, Error logs, and Audit log — via a shared highlight rule (`internal.tsx`'s `ADMIN_NAV`, the `also` array on the Logs entry); each still has its own route and page (see [Routes](#routes)), this is a navigation grouping, not a merged page.

---

## Ports

| Port | Use | How to run |
|------|-----|------------|
| **3000** | Shopify embedded app (merchant-facing) | `shopify app dev` from repo root |
| **4000** | Internal admin only | From `apps/web`: `pnpm dev:internal` (runs **Remix** on 4000 and the **internal-ai-router** on **8787** in parallel via `concurrently`; stop with Ctrl+C once to exit both) |
| **8787** | Reference internal prompt router + Ollama passthrough | Started automatically with `pnpm dev:internal`; or run alone: `pnpm --filter web router:internal`. Requires **Ollama** (`ollama serve`) for inference or router calls to Ollama will fail (502/timeouts). |

**Node version:** use **Node 24.x** (`nvm use` at repo root reads `.nvmrc`). Node **20.20+** is also supported. Requires `@shopify/shopify-app-remix` **3.8.5+** (uses `import … with { type: 'json' }` instead of deprecated `assert` syntax removed in Node 22+).

- **Shopify app** must run on **3000** so the CLI tunnel and Partner Dashboard point to the correct URL.
- **Internal admin** runs on **4000** so you can use it without touching the Shopify app. Open **http://127.0.0.1:4000/internal/login** (`dev:internal` binds `--host 127.0.0.1` so smoke/Playwright match CI). When a Shopify Cloudflare tunnel URL in `shopify.app.toml` is expired (NXDOMAIN), use this local URL for staging-gate smoke and e2e instead of the tunnel.
- **Environment:** `apps/web/.env` must include all vars in `apps/web/.env.example`, including **`SCOPES`** (comma-separated, same list as `shopify.app.toml` `[access_scopes]`). If `SCOPES` is missing, SSR boot fails with `[env] Boot failed — invalid environment: SCOPES: Required`. See [Shopify dev setup](shopify-dev-setup.md), section 4 (Environment variables).

---

## Features

- Configure AI providers (OpenAI / Anthropic / Google Gemini / Azure OpenAI / Custom OpenAI-compatible), with a default (active) provider and an optional fallback provider
- Set the global active provider; override per store
- View AI usage and approximate costs (30-day window) with **Replay** action that re-enqueues the same generation as a new `AI_GENERATE` job under a fresh correlationId
- View error logs (auto-redacted — no secrets/PII)
- View API logs with `requestId` and `correlationId` correlation, plus an SSE-backed **Live tail** toggle
- View **Audit log** (`/internal/audit`) — sensitive admin/merchant actions (deletions, plan changes, sensitive overrides) retained for compliance
- View **Webhook events** (`/internal/webhooks`) — Shopify webhook deliveries (orders, products, customers, fulfillments, GDPR), filterable by topic/shop/status/date
- **Trace view** (`/internal/trace/<correlationId>`) — joins API logs, jobs, errors, AI usage, flow steps, and activity into one timeline for any correlationId; reachable from a **Trace** action on every list row
- View installed stores and basic stats
- View and monitor background jobs (AI generation, publish, connector tests, flow runs, theme analysis), with **Replay** action that re-enqueues the original payload under a fresh correlationId
- Per-step flow execution logs for debugging automations
- **Type category configuration** — view and edit category display names / visibility; **add new categories** (JSON overrides in App Settings)
- **Plan tier configuration** — view and edit plan definitions (quotas, display name, trial days, price; -1 = "Contact us"). **Enterprise** plan (unlimited, Contact us); **Pro** = 10× Growth quotas
- **Recipe edit** — select a store or **"All recipes (templates)"** to view/edit module specs or default templates; Validate or Save (new version or template override). Template overrides used when merchants create from template
- **Store & plan control** — change a store's billing plan (FREE / STARTER / GROWTH / PRO / ENTERPRISE) without Shopify billing (internal override)
- **Templates** — Module templates (link to recipe-edit) and Flow templates section
- **Activity log** — covers *everything*: page opened, page refreshed, button/link clicks, settings changes, request success/error (not just modules/server). API log = APIs only; Error log = errors only. Per-entry **View** opens full detail (actor, action, resource, store, IP, details JSON)
- **AI Providers** — configured providers show **masked API key** (e.g. ••••••••xyz1), model, base URL; for **Claude (ANTHROPIC)** you can set Agent Skills (e.g. pptx, xlsx) and enable code execution; model pricing table
- **AI Assistant** — `/internal/ai-assistant` personal **Qwen3** test console with local/cloud mode switch, DB-backed multi-chat history, memory controls, tool audits, and resumable SSE chat streaming for internal capability checks. It is also **app-aware** — see [Internal AI Assistant — app awareness](#internal-ai-assistant--app-awareness) below
- **Support CRM** (`/internal/support`) — merchant support tickets (filed from the storefront/app via `support._index.tsx`/`api.support.create.tsx`, or a shopper-intake path) triaged by a **local** LLM (`qwen3.5:9b` via Ollama, `think:false` + strict JSON) with an optional cloud fallback toggle; a human-approved **AI auto-fix** flow lets an operator ask the AI to propose a corrected `RecipeSpec` from a ticket and apply it after review; SSE live tail (`/internal/support/stream`); email notifications for admin alerts and merchant updates. See [Support CRM](#support-crm) below
- **Settings** — includes **AI & API keys** (link to Manage AI providers for Claude/OpenAI keys and options), **Password management** (INTERNAL_ADMIN_PASSWORD / SSO), **Environment variables** (.env reference), and **Advanced** (store & plan control). Standalone **Advanced** nav removed; `/internal/advanced` redirects to Settings

---

## Routes

| Route | Purpose |
|---|---|
| `/internal/login` | Password or SSO login |
| `/internal` | Dashboard home (store count, error count, AI calls 24h) |
| `/internal/ai-providers` | Add/activate AI providers + set model pricing. See [AI provider management](#ai-provider-management) for what "only writer" means here |
| `/internal/ai-accounts` | **Redirect only** — `/internal/ai-accounts` 302s to `/internal/ai-providers?tab=accounts` (kept for old deep links / ⌘K entries; the page was merged into AI Providers) |
| `/internal/ai-assistant` | Qwen3 internal dashboard (local/cloud mode switch, DB-backed sessions/history, memory/tools, observability) |
| `/internal/model-setup` | "Setup the Model" — local/cloud runtime target configuration for the AI Assistant + internal prompt router (target URLs, backend, model, tokens); surfaces the decryption-failure, release-gate, and Modal-proxy-URL warning banners. Referenced throughout [Internal AI Assistant setup](#internal-ai-assistant-setup) but was missing from this table until this pass |
| `/internal/usage` | AI usage + costs (last 30 days); per-row **Replay** + **Trace** |
| `/internal/logs` | Error logs (auto-redacted); per-row **Trace** |
| `/internal/api-logs` | API access logs with actor, path, status, duration, requestId, correlationId, SSE **Live tail**, per-row **Trace** |
| `/internal/audit` | Audit log of sensitive admin/merchant actions (deletions, plan changes, overrides) for compliance review |
| `/internal/webhooks` | Webhook events from Shopify (orders, products, customers, fulfillments, GDPR) — topic/shop/status/date filters |
| `/internal/trace/:correlationId` | Unified timeline view: every API log, job, error, AI usage row, flow step, and activity entry that share the same correlationId/requestId |
| `/internal/stores` | Installed stores; per-store AI provider override, retention overrides, **Change plan** (FREE/STARTER/GROWTH/PRO/ENTERPRISE). `:storeId` detail page renders a real store or an in-shell not-found state for unknown ids (placeholder fallback removed 2026-07) |
| `/internal/modules`, `/internal/modules/:moduleId` | **Platform** — module list + detail (versions, publish/rollback) |
| `/internal/flows`, `/internal/flows/:flowId` | **Platform** — flow list + detail (steps visualization, run history, pause/resume, run-now) |
| `/internal/connectors`, `/internal/connectors/:connectorId` | **Platform** — connector list + detail (endpoints, test history, config, test connection) |
| `/internal/data-stores`, `/internal/data-stores/:key` | **Platform** — data-store list + record detail |
| `/internal/customers`, `/internal/customers/:customerId` | **Platform** — customers derived from stores + detail |
| `/internal/support`, `/internal/support/:ticketId` | **Support** — ticket list + detail (triage result, reply, escalate, note, AI auto-fix propose/apply). See [Support CRM](#support-crm) |
| `/internal/support/stream` | SSE live tail for the support ticket list (new tickets, status changes) |
| `/internal/release-dashboard` | Publish release-safety metrics: release timeline, rollout stage/decision, rollback budget, transition audit trail (`RolloutPolicyService`, `getRecentPublishMetrics`). **Naming note:** the left-nav labels this "Release Gate" under **AI & Models** (`#/admin/release` → `/internal/release-dashboard` via a hash-route special-case in `CommandPalette.tsx`) — don't confuse it with the unrelated AI-generation release gate (schemaFailRate/fallbackRate trip, surfaced as a banner on `/internal/model-setup`, documented in `docs/ai-providers.md`). Same word, two different systems |
| `/internal/metaobject-backfill` | One-off operator tool: re-writes theme-module / admin-block / admin-action metaobjects for existing published modules (used for schema migrations that need a backfill pass, not part of normal day-to-day operation) |
| `/internal/jobs/:jobId` | Background job detail (attempts, payload); **Replay** when the job exists in the DB |
| `/internal/webhooks/:webhookId` | Webhook delivery detail (attempts, payload, HMAC); **Redeliver** on failures |
| `/internal/recipe-edit/:id` | Recipe edit detail page |
| `/internal/ops` | **Shared mutation action** (action-only; loader redirects to `/internal`). All Platform/Operations admin buttons submit here via the `useAdminOps()` hook. Maps each intent (publish, rollback, flow_pause/resume, flow_run, connector_test/save/delete, webhook_redeliver, job_replay) to a real service call + `ActivityLogService` audit entry, and returns `{ ok, message }` for toasts |
| `/internal/plan-tiers` | View and edit plan tier definitions (display name, price [-1 = Contact us], trial days, quotas JSON). Enterprise = unlimited + Contact us; Pro = 10× Growth |
| `/internal/categories` | View module categories, **add new categories**, edit overrides (display name, enabled) as JSON |
| `/internal/recipe-edit` | Select **store or "All recipes (templates)"** → module/template → edit RecipeSpec; Validate or Save (new version or template override) |
| `/internal/templates` | Module templates (link to recipe-edit) and Flow templates section |
| `/internal/activity` | Activity log (every page open, click, request outcome, settings change); each row has **View** → `/internal/activity/:id` with full detail (actor, action, resource, store, IP, details JSON) |
| `/internal/advanced` | **Redirects to** `/internal/settings` (Advanced merged into Settings) |
| `/internal/settings` | Appearance, profile, contact, app config; **Password management**; **Environment variables**; **Advanced** (store & plan control, other controls) |
| `/internal/jobs` | Background job list (QUEUED/RUNNING/SUCCESS/FAILED) |
| `/internal/sso/start` | Initiates OIDC SSO flow |
| `/internal/sso/callback` | OIDC callback handler |
| `/internal/logout` | Clears internal admin session |

---

## Security

- Protected via `INTERNAL_ADMIN_PASSWORD` + HttpOnly session cookie.
- Supports OIDC SSO (Google OAuth, Okta, etc.) via `INTERNAL_SSO_*` env vars.
- **SSO is gated by an email allowlist — fail-closed, not fail-open.**
  `INTERNAL_SSO_ALLOWED_EMAILS` (comma-separated, exact-match,
  case-insensitive) is required for an SSO login to succeed
  (`apps/web/app/internal-admin/sso-allowlist.server.ts`,
  `evaluateSsoIdentity`): the ID token's `email` claim must be present, must
  be `email_verified` when the IdP sends that claim, and must appear on the
  allowlist. **An empty/unset allowlist denies every identity** (`reason:
  'allowlist_empty'`) — it does not fall back to accepting any authenticated
  IdP identity. This closes a real prior gap: the callback used to grant
  internal-admin access to any identity the IdP authenticated, with no
  allowlist check at all (see the file's own header comment, "fix
  (WS-QF / Ops-2)" — commit `bbdab2a`). Every denial is best-effort
  audit-logged (`ActivityLogService`, action `LOGIN`, `outcome: 'denied'`)
  without ever letting a failed audit write mask the denial.
- In production: add IP allowlist + MFA in front of `/internal/*`.

---

## SSO setup

Set these env vars to enable SSO login on the `/internal/login` page:

```
INTERNAL_SSO_ISSUER=https://accounts.google.com
INTERNAL_SSO_CLIENT_ID=your-oauth-client-id
INTERNAL_SSO_CLIENT_SECRET=your-oauth-client-secret
INTERNAL_SSO_REDIRECT_URI=https://your-app.example.com/internal/sso/callback
```

---

## AI provider management

**Architecture:** **Merchant module generation** (RecipeSpec) uses **OpenAI**, **Anthropic (Claude)**, and **Google Gemini** — configure those under AI Providers / Settings (corrected in this pass: this doc previously said "OpenAI and Anthropic only," which is stale — `docs/ai-providers.md`'s own audited product-split table lists all three for module generation). **Internal** flows (prompt router first layer, **Setup the Model**, **AI Assistant**) **always default to the self-hosted Qwen3 ~4B** targets: `localMachine` = local Ollama (active default), `modalRemote` = a cloud-hosted Qwen twin (e.g. Modal). Operators may switch either target to the optional **`anthropic`** backend in **Setup the Model**, but the internal copilot is never hosted-by-default. See [AI providers](./ai-providers.md) (module vs internal split).

Use `/internal/ai-providers` to:
1. Add a provider (name, type, API key, base URL, default model)
2. Set it as the global active provider
3. Set per-store overrides via `/internal/stores`
4. Add model pricing (cents per 1M tokens) for accurate cost tracking

**`/internal/ai-providers` (via `ai-provider.service.ts`) is the only writer
of a provider's core config** — name, type, API key, base URL, default model,
active/inactive state. Two other write paths exist but neither touches that
core config: `provider-model-catalog.server.ts`'s OpenRouter model-catalog
auto-sync and `ai-account-observability.service.ts`'s billing/dashboard
metadata both only merge into `AiProvider.extraConfig` (JSON metadata), and
`ai-usage.service.ts` lazily creates **inactive, keyless synthetic rows** to
satisfy a foreign key for env-key-sourced usage — never a config a human
reviews. See `docs/ai-providers.md` for what's actually stored in
`extraConfig` (model catalog, Claude Agent Skills config, billing snapshot).

### Provider types supported
- `OPENAI` — uses `/v1/responses` API with `json_schema` strict mode
- `ANTHROPIC` (Claude) — uses Messages API with structured output; optional **Agent Skills** (container.skills) and **code execution** tool (beta headers). Configure skills (e.g. pptx, xlsx, docx) and "Enable code execution" when adding or editing the provider.
- `AZURE_OPENAI` — OpenAI-compatible with Azure base URL
- `CUSTOM` — any OpenAI-compatible endpoint (tries `/v1/responses`, falls back to `/v1/chat/completions`)

---

## Internal AI Assistant setup

The AI Assistant lives at `/internal/ai-assistant` and uses the same runtime target configuration as **Setup the Model** (`/internal/model-setup`).

### Internal AI Assistant — app awareness

The assistant is **app-aware**, not just a bare chat console: `apps/web/app/services/ai/internal-assistant-tools.server.ts` exposes a fixed toolset the assistant selects from per-prompt (`selectToolsForPrompt`), including two tools worth calling out specifically because they read the live app rather than just answering from the model's own training:

- **`searchAppDocs`** — indexes and full-text-searches this very `docs/` directory (`resolveDocsDir()` + `getDocsIndex()`/`searchDocs()`) and returns ranked snippets as grounding context. When `docs/` isn't present on a deployment, it degrades honestly (`available: false` with an explicit reason) rather than silently answering ungrounded.
- **`getAppOverview`** — a live snapshot query, not documentation: shop counts (total + active subscriptions), module counts by status, flow/connector/data-store counts, the currently-active AI provider, the failed-jobs (DLQ) count, 7-day webhook failure count, and 30-day AI request volume — all fetched in parallel with per-query `.catch()` fallbacks so one failing count never blanks the whole overview.

Both are real and covered by tests (`internal-assistant-search-docs-tool.test.ts`, `internal-assistant-app-aware-routing.test.ts`), not aspirational — confirmed by reading `runAssistantTool`'s `searchAppDocs`/`getAppOverview` branches directly.

When send is blocked because health/chat probes fail on a **local** URL that uses port **8787**, the error banner includes a short hint to run `pnpm --filter web router:internal` and check `ROUTER_OLLAMA_BASE_URL` / `ROUTER_OPENAI_BASE_URL`.

**Health vs chat probes:** For **`ollama`** backend, liveness uses **`GET /api/tags`** (Ollama has no `/healthz`). For **qwen3** / **openai** / **custom**, liveness uses **`GET /healthz`** on the configured base URL. The default local target in code is **direct Ollama** at `http://127.0.0.1:11434` with backend **ollama** (no reference router required if Ollama is running). If you use the reference router on **8787** instead, set backend and URL accordingly in **Local AI Setting**.

**Router vs inference:** Minimal router deployments may expose only `POST /route` and `GET /healthz`. The assistant needs **chat** APIs (`POST /api/chat` for Ollama, or OpenAI-compatible `/v1/chat/completions`). A base URL that answers `/route` but has no chat surface is **router-only** — the AI Assistant shows **chat blocked** until probes pass. Use **Validate assistant targets** on **Setup the Model** (same checks as save, without writing settings).

The reference Node router [`apps/web/scripts/internal-ai-router.ts`](../apps/web/scripts/internal-ai-router.ts) adds **Ollama passthrough**: `GET /api/tags` and `POST /api/chat` forward to `ROUTER_OLLAMA_BASE_URL`, so **one local base** (e.g. `http://127.0.0.1:8787`) can satisfy prompt routing and assistant chat when `localMachine.backend` is `ollama`. The optional **Modal HTTPS proxy** still forwards only `/route` and `/healthz`; point assistant/inference URLs at a real chat host unless you use this passthrough pattern locally or on your own edge.

### 1) Configure local Qwen3 (LOCAL mode)

Set the local target URL/model in **Setup the Model**:

- `localMachine.url` — Ollama base (e.g. `http://127.0.0.1:11434`) **or** the reference router base (e.g. `http://127.0.0.1:8787`) if you use router passthrough to Ollama
- `localMachine.backend` = `ollama` (or `qwen3` / `custom` if your server is OpenAI-compatible)
- `localMachine.model` e.g. `qwen3:4b-instruct` (~4B)

For raw Ollama local chat, ensure:

```bash
ollama serve
ollama pull qwen3:4b-instruct
```

### 2) Configure cloud Qwen3 (CLOUD mode)

Set the remote target in **Setup the Model**:

- `modalRemote.url` — must be a **chat inference** base URL (Ollama or OpenAI-compatible), **not** the Modal router-only proxy unless your upstream implements chat there
- `modalRemote.backend` = `qwen3` / `openai` / `custom`
- `modalRemote.model` = cloud model id
- token field (optional/required based on provider)

For **Modal**, deploy [`deploy/modal-qwen-router/modal_app.py`](../deploy/modal-qwen-router/modal_app.py) as the HTTPS **proxy** for router traffic only; use a separate inference URL for assistant chat when needed.

**Cloud checklist (router vs assistant):**

| Env / setting | Use |
|---------------|-----|
| **`INTERNAL_AI_ROUTER_URL`** (Remix `.env`) | HTTPS origin of **`superapp-internal-ai-router-proxy`** only (`modal deploy modal_app.py`). Secret **`INTERNAL_ROUTER_UPSTREAM_URL`** on Modal must target your **real** upstream router (Node/Railway — see [`deploy/railway-internal-router/README.md`](../deploy/railway-internal-router/README.md)), not the optional mock. |
| **`modalRemote.url`** in **Setup the Model** | Real **chat** host only (inference). **Do not** use [`mock_upstream_app.py`](../deploy/modal-qwen-router/mock_upstream_app.py) URLs or any deployment that lacks `/api/chat` / OpenAI-compatible chat. |
| Mock app | Stop/delete **`superapp-internal-ai-router-mock`** when unused — see [`deploy/modal-qwen-router/README.md`](../deploy/modal-qwen-router/README.md) § *Stopping or removing the mock app*. |

### 3) Runtime behavior

- New sessions default to **Local** mode (`localMachine`) unless an explicit cloud target is requested and local-only guardrails are off.
- Session mode controls which target is preferred per chat.
- If preferred target fails and fallback is available, assistant attempts failover.
- Assistant status UI now shows one primary readiness summary (active target health + chat readiness) plus optional standby target detail, instead of duplicate mixed indicators.
- Tool snapshots are sanitized and injected as context when user intent asks for health/errors/logs.
- Every tool execution is written to `InternalAiToolAudit` and activity logs.
- Chat streaming uses SSE with request-id idempotency, so reconnect attempts resume from persisted assistant state instead of creating duplicate turns.
- Observability panel includes request-id diagnostics, per-attempt status timeline, reconnect counts, and resume markers for operator debugging.

### Operator banners and warnings

**Decryption failure banner** (`/internal/model-setup`). When the saved router runtime config row exists but cannot be decrypted or parsed (typical cause: `ENCRYPTION_KEY` rotation), [`getRouterRuntimeConfig`](../apps/web/app/services/ai/router-runtime-config.server.ts) returns `{ config: defaults, parseError: <reason> }`. The model-setup loader propagates `parseError` and the page renders a red banner: *"Saved router config could not be loaded (decryption/parse error). Re-save the config to restore."* `/internal/ai-assistant` (see [`internal.ai-assistant.tsx`](../apps/web/app/routes/internal.ai-assistant.tsx)) shows a matching warning chip linking to model-setup so operators do not chat against the silently-defaulted config.

**Release gate banner** (`/internal/model-setup`). When `getReleaseGateState().tripped` is true, the page renders a "Release gate tripped" banner with the breached metric (`schemaFailRate` / `fallbackRate`), the observed value, the configured threshold, and the affected target. Shadow mode is **forced on in memory** by the prompt router; the encrypted runtime config is not rewritten. Operators should investigate the upstream cause (schema validation churn or upstream failures rolling to the fallback) before saving a new runtime config — the next save clears the in-memory trip. See [docs/ai-providers.md](./ai-providers.md) § *Release gate* for the rolling buffer (200) and event semantics.

**Modal proxy URL warning** (`/internal/model-setup`). When the saved `modalRemote.url` host ends in `.modal.run` or matches the `INTERNAL_ROUTER_UPSTREAM_URL` env (i.e. the router-only Modal `/route` proxy from [`deploy/modal-qwen-router/`](../deploy/modal-qwen-router/)), the page renders an inline warning: *"This URL appears to be the Modal /route proxy. Assistant chat requires a real chat host; point this at vLLM/Ollama."* The router proxy only forwards `/route` and `/healthz`; chat (`/api/chat`, `/v1/chat/completions`) will 404 there.

### Sessions: archive vs delete

`/internal/ai-assistant` supports both **archive** and **delete** intents on a chat session (with a confirm dialog before delete).

- **Archive** keeps the session row and message history but hides the thread from the active list (existing behavior).
- **Delete** (`intent: 'deleteSession'`) hard-deletes the `InternalAiSession` row. Cascading rules:
  - `InternalAiMessage` rows for the session are cascade-deleted.
  - `InternalAiToolAudit` rows are **preserved** via `ON DELETE SET NULL` on `sessionId` and `messageId` (see [`internal-assistant-store.server.ts`](../apps/web/app/services/ai/internal-assistant-store.server.ts) and the `InternalAiToolAudit` table definition). Audit history remains available even after the originating session is gone.

### Tool audit retention

`InternalAiToolAudit` rows are pruned by a daily job invoked from [`api.cron.tsx`](../apps/web/app/routes/api.cron.tsx).

- Implementation: [`internal-ai-audit-retention.job.ts`](../apps/web/app/services/jobs/internal-ai-audit-retention.job.ts) deletes rows whose `createdAt` is older than the configured retention window.
- Retention window: `INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS` env var, default `90`. Non-finite or non-positive values fall back to the default.
- Chat message retention window: `INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS` env var, default `30` (used by the internal assistant message retention job).
- The cron loader runs the purge at most once per **24 hours** per process via an in-memory `lastAuditRetentionRunAt` marker; calling `/api/cron` more frequently is harmless but a no-op after the first daily run.
- The response of `/api/cron` includes `auditRetention: { deleted, retentionDays, cutoff }` on the day the purge runs and `null` on subsequent same-day calls.

### Chat stream behavior

- **SSE heartbeat.** [`internal.ai-assistant.chat.stream.tsx`](../apps/web/app/routes/internal.ai-assistant.chat.stream.tsx) emits a `:keepalive` SSE comment frame every **15 seconds** (`HEARTBEAT_INTERVAL_MS`) while waiting for model tokens. SSE comments are silently discarded by `EventSource` clients but keep idle proxy/CDN connections from being closed mid-stream.
- **Empty model reply.** A response whose `fullReply.trim()` is empty is no longer stored as the placeholder content `"No response generated."`. The assistant message is updated with `status='error'` and `error='Empty model response'`, and an `error` SSE frame is pushed. The UI already renders the existing error chip for `status='error'`.
- **Rate limiting.** Stream and probe endpoints enforce per-IP internal rate limits (`stream`: 10/min, `probe`: 30/min) and return HTTP `429` with `Retry-After` when exceeded.
- **Estimated cost persistence.** Completed assistant messages persist server-side `estimatedCostCents` from model pricing rows (`AiModelPrice`) using backend→provider mapping.
- **Activity log.** `AI_ASSISTANT_QUERY` now fires on **every** attempt (not just the first), with `attempt: <number>` in the details. Retries are countable. The new event `ROUTER_RELEASE_GATE_TRIPPED` is emitted by the prompt router when the rolling release gate trips.

### Import session dedupe

`/internal/ai-assistant` `intent: 'importSession'` (see `applyImportSession` in [`internal.ai-assistant.tsx`](../apps/web/app/routes/internal.ai-assistant.tsx)) dedupes incoming messages by `clientRequestId`:

- Each imported message is checked against `store.findUserMessageByRequest(sessionId, clientRequestId)` (when a `clientRequestId` is present) before insert.
- Existing rows are skipped, not overwritten.
- The action returns `{ ok: true, sessionId, inserted, skipped }`. The toast on the page surfaces both counts so re-importing the same JSON twice inserts zero rows the second time.

---

## AI Assistant deployment notes

- Run Prisma migration and regenerate client:

```bash
cd apps/web
pnpm prisma migrate deploy
pnpm prisma generate
```

- Ensure internal admin env vars are present (password/SSO/session secret).
- Ensure both local/cloud model target URLs and tokens are configured in `/internal/model-setup`.
- `ALLOW_MERCHANT_CODE_EXECUTION` should stay unset/false; merchant RecipeSpec generation paths hard-block Anthropic code execution regardless of provider `extraConfig`.
- Verify SSE compatibility at proxy/load-balancer (no response buffering for `text/event-stream`).

## Support CRM

A merchant-facing support ticket system with an internal-admin operator side,
living under `apps/web/app/services/support/`. Not documented anywhere in
this file before this pass — confirmed real and committed (not a partial or
uncommitted feature) by reading each service file directly.

- **Merchant/shopper intake:** `support._index.tsx` / `support.$ticketId.tsx`
  (merchant-facing routes) and `api.support.create.tsx` /
  `api.support.ticket-action.tsx` let a shop create and act on tickets;
  `shopper-intake.server.ts` handles intake from a storefront-facing path,
  capping subject/description length and immediately invoking triage.
- **Triage** (`triage.server.ts`): runs **locally by default** — `qwen3.5:9b`
  via Ollama, called with `think: false` and a mandatory strict JSON
  `format` (the file's own comment cites a measured ~3,400 thinking tokens
  vs. 75 output tokens on this model as the reason `think:false` is
  non-negotiable, not a tuning choice). An operator can flip
  `AppSettings.supportTriageMode` to `cloud` from the **same**
  `/internal/ai-providers` page's "Support triage" card
  (`AppSettings.supportTriageProviderId` optionally pins the cloud call to a
  specific provider) — see `docs/ai-providers.md` for the full triage
  writeup, not duplicated here.
- **Human-approved AI auto-fix** (`autofix.server.ts`, "Phase G"): from a
  ticket, an operator can ask the AI to propose a corrected `RecipeSpec`
  (reusing the existing AI-modify chain, `modifyRecipeSpecOptions`) and then
  separately apply it — the AI never writes a module directly from a
  support ticket without that explicit operator approval step.
- **Notifications** (`notifications.server.ts`, "Phase F"): best-effort,
  never blocks the caller. Two audiences — operator alerts (escalated,
  intervention-flagged, triage-failed, new shopper ticket; gated off by
  default, opt-in via `AppSettings.enableEmailAlerts` + `alertRecipients`)
  and merchant updates (human replied, resolved; sent to the shop owner's
  address fetched live from the Shopify Admin API, silently skipped if no
  Admin client is available).
- **Ticket event log** (`ticket-events.server.ts`): a typed timeline per
  ticket — `CREATED`, `TRIAGED`, `TRIAGE_FAILED`, `MERCHANT_REPLIED`,
  `AI_REPLIED`, `HUMAN_REPLIED`, `NOTE_ADDED`, `ESCALATED`,
  `INTERVENTION_FLAGGED`, and more.
- **Operator UI:** `/internal/support` (list) and `/internal/support/:ticketId`
  (detail — triage result, reply, escalate, note, auto-fix propose/apply),
  with `/internal/support/stream` providing an SSE live tail of ticket
  activity, matching the pattern the Logs/API-logs pages already use.

## Jobs and DLQ

The `/internal/jobs` page shows all background tasks.
Failed jobs (`status=FAILED`) are the **dead-letter queue (DLQ)** — they persist for investigation.
To replay a failed flow: `POST /api/flow/run` with the shop's event data.

Flow jobs also produce per-step logs (`FlowStepLog`) for granular debugging.

---

## API Logs

`/internal/api-logs` shows all significant API calls:
- Actor: `MERCHANT | INTERNAL | WEBHOOK | APP_PROXY`
- Path, method, status, duration
- `requestId` — matches the `x-request-id` response header for client correlation
- `correlationId` — propagated across the full request lifecycle (API log → job → AI usage → flow step → error log → activity log) so a single ID joins every related record
- Shop domain
- **Live tail** — SSE stream (`/internal/api-logs/stream`) emits new ApiLog rows in near-real time; toggle on the page
- **Trace** — opens `/internal/trace/<correlationId>` for a full timeline of correlated records

## Trace view

`/internal/trace/:correlationId` joins all log sources into a single timeline. Tabs split by source (Timeline, API, Jobs, Errors, AI usage, Flow steps, Activity). Use this to investigate a single end-to-end request — e.g. "why did this AI generation fail and what happened to the publish job that followed?"

## Replay actions

- `/internal/jobs` — **Replay** re-enqueues the original job payload as a new job (new id, fresh correlationId), preserving job type and shop linkage so flaky external dependencies can be retried without round-tripping through the merchant UI.
- `/internal/usage` — **Replay** creates a new `AI_GENERATE` job with the same payload, same shop, same provider hint, and a fresh correlationId for re-running historical generations under the current model/prompt version.

---

## Integrations Hub

`/internal/integrations` is a marketplace-style grid of every external service the app talks to, grouped into AI-provider and ops-service categories, plus the ops-alert fan-out that some of those tiles feed.

### Category 1 — AI providers

One tile per provider kind (Anthropic, OpenAI, Gemini, Grok, DeepSeek, Mistral). These tiles don't fork a separate config surface — "Configure" / "Manage in AI Providers" deep-links into `/internal/ai-providers`, which stays the single `AiProvider` writer (`AiProviderService`). Grok/DeepSeek/Mistral need no new HTTP client: they speak the same OpenAI Chat Completions dialect as the existing `CUSTOM`/`AZURE_OPENAI` fallthrough in `llm.server.ts`, so adding a kind is a config-only change (a `ProviderKind` union member + a default base URL).

Each configured provider gets a "Test connection" button — on the provider's own row in `/internal/ai-providers`, and on the Hub tile itself when a kind has exactly one row configured (otherwise the id is ambiguous and the tile points at the per-row buttons instead). The probe is a minimal, cheap "are these credentials valid" request, not a real generation call: OpenAI-compatible kinds `GET {baseUrl}/models` with a Bearer key, Anthropic `GET {baseUrl}/v1/models` with `x-api-key`, Gemini `GET {baseUrl}/v1beta/models` with an `x-goog-api-key` header — never a `?key=` query param, since Sentry's default fetch-breadcrumb instrumentation records full request URLs and `beforeSend` doesn't redact breadcrumbs, so a key in the query string would leak. A failure surfaces the real upstream status and error body — never a generic "something went wrong" — and every attempt (success or failure) is audited (`PROVIDER_TESTED`).

### Category 2 — Ops services

Each tile is explicitly one of a small set of configuration models, chosen per-service by how the app actually depends on it at runtime:

- **DB-config, full read/write** (Slack, Email): the app calls out to these at request/job time, so their credentials live in `AppSettings`, encrypted, with the existing DB-wins-over-env-var precedence pattern already used by the mailer and support-triage config. Email gains `resend`/`postmark` provider kinds alongside the existing `smtp`/`sendgrid`/`generic`.
- **DB-config, read-only status key** (UptimeRobot, Healthchecks.io): nothing in the app boots against either service — UptimeRobot only ever polls `/healthz` from outside, and the healthchecks.io ping is sent by the cron workflow, not the Node process. Their tiles store a read-only status-API key in `AppSettings` so the Hub can pull and display live check/monitor status; the tile is explicit that the ping/monitor itself lives in the external dashboard, not in this app.
- **Env-only, reflect + test** (Sentry): the DSN is read once at process boot by `sentry.server.ts`'s lazy `init()` for uncaught-exception hooks to work; moving it to DB-config would need an async, per-request-rechecked init, which conflicts with "zero runtime cost when unset." The tile shows masked env status and a "Send test event" button (`captureMessage`), recording `AppSettings.sentryLastTestedAt`.

Every Hub save/test action is audited via `ActivityLog` with a real `ActivityAction` — never an untyped string — and a static-analysis test (`hub-activity-audit-coverage.test.ts`) greps both `internal.integrations.tsx` and `internal.ai-providers.tsx` for every mutating `intent` branch and fails the suite if one doesn't call `activity.log`.

### Ops-alert fan-out

`OpsAlertService` (`apps/web/app/services/observability/ops-alert.server.ts`) is the single point that fires an alert — no call site invokes Sentry or sends a Slack/email message directly. It fans out to each channel via `Promise.allSettled` (one channel's failure never blocks another):

- **Sentry** — unconditional. Every call to `fire()` that carries an `error` captures it immediately; Sentry is already a curated, deduped stream by design, so it isn't gated.
- **Email and Slack** — gated by a rolling-window threshold plus a cooldown, tracked via two distinct `ActivityLog` action rows rather than one: every `fire()` call unconditionally records an `OPS_ALERT_OCCURRED` row first, and the threshold (`AppSettings.opsAlertThresholdCount` within `opsAlertThresholdWindowMin` minutes) is evaluated against a rolling-window count of those `OPS_ALERT_OCCURRED` rows. `OPS_ALERT_FIRED` is written only once that gate opens, and it drives the cooldown, not the threshold: while an `OPS_ALERT_FIRED` for the same alert kind exists within the window, further occurrences keep incrementing the `OCCURRED` count (so the next window's count stays accurate) but delivery is suppressed — at most one send per kind per window. Splitting the two rows this way avoids a bootstrap deadlock a single-counter design has: if the same row both gated delivery and recorded the threshold count, the counter could never organically leave zero.

A couple of failure-suppression rules keep the channel pager-grade rather than noisy:
- **Double-alert seam:** some call sites fire an alert as a side effect of another call and then re-throw the same error so an outer layer can still handle it (an HTTP response, a retry decision). `JobService.fail` fires `JOB_FAILED` and marks the error (`markOpsAlerted`); if that same error later reaches `withApiLogging`'s catch (e.g. a route that awaits a job inline), it sees the mark (`wasOpsAlerted`) and skips its own `API_REQUEST_FAILED` fire — one root cause pages once, not once per layer. The `ErrorLog` write and the rethrow itself are unaffected either way.
- **Expected 4xx client errors don't page:** `withApiLogging`'s catch also skips the fire when the error is an `AppError` with a 4xx status (`RATE_LIMITED`, `VALIDATION_ERROR`, `NOT_FOUND`, etc.) — those are expected client-facing outcomes, not operational incidents. A 5xx `AppError`, or any non-`AppError` (unknown/unexpected) failure, still fires unconditionally. The `ErrorLog` write stays unconditional regardless of this gate too.

Call sites wired into `fire()` today: the shared `withApiLogging` catch (`API_REQUEST_FAILED`), `JobService.fail` (`JOB_FAILED`), the webhook route's per-connector best-effort catches (`WEBHOOK_FANOUT_FAILED`), and support-triage failure notifications (`TRIAGE_FAILED`).

### DLQ replay — what's real today

The Jobs page's Replay button (`/internal/ops`, and `/internal/jobs`) writes a fresh legacy `Job` row (`JobService`, the Prisma `Job` model — `type: 'CONNECTOR_TEST'|'FLOW_RUN'|'MESSAGING_RUN'|'HTTP_SYNC_RUN'|...`) with `status: QUEUED`. **As of this writing there is still no consumer that dequeues and executes that row.** This is no longer because the worker is a no-op: WS-C (#19) made `apps/web/scripts/worker.ts` mount real BullMQ `Worker`s (`createWebWorkerRuntime`) when `JOB_EXECUTION_MODE=queue` and a queue has registered handlers (`buildWorkerHandlers()`, `apps/web/app/services/jobs/processors/index.ts`). But those BullMQ workers consume an entirely different queue system — the new `PlatformQueueName` queues (`ai-generation`, `publish`, `connector`, `flow`, `webhook`, `retention` — `packages/platform-contracts/src/platform-jobs.ts`) fed by `enqueueWebJob`, not the legacy `Job` table this admin surface's Replay button writes to. Only two of those platform queues have a registered handler today (`ai-generation` and `publish`); `connector`/`flow`/`webhook`/`retention` have none. Separately, the legacy `Job` rows this Replay button creates for `CONNECTOR_TEST`/`FLOW_RUN`/`MESSAGING_RUN`/`HTTP_SYNC_RUN` have no poller at all — `runNextConnectorWorkerJob` (`services/connectors/connector-worker.server.ts`) is the closest thing to one, but nothing calls it; the only caller of that module's job-runner (`runConnectorWorkerJob`) is `api.connectors.test.tsx`, which runs a test inline against the row it just created, not against a later-replayed one. So "Replay" still just writes a database row for investigation, not a resumable job — the honest state is documented here rather than left to look done because a button exists. Wiring a real consumer for these legacy admin-owned job kinds (`CONNECTOR_TEST`, `FLOW_RUN`, `MESSAGING_RUN`, `HTTP_SYNC_RUN`, and the composite fan-out kinds) — deliberately never `AI_GENERATE`/`AI_HYDRATE`/`AI_MODIFY`/`PUBLISH`, which already moved onto the new async engine — remains tracked separately.

---

## Provider HTTP clients

Provider calls:
- Use structured JSON schema output enforcement (`zodToJsonSchema` → sent as `json_schema`)
- Log request/response metadata (status, duration, provider request ID, SHA-256 body hashes)
- Raw prompts/outputs are **not** persisted in logs by default
- Retry 429/5xx with exponential backoff; non-retryable 4xx errors fail immediately

---

## Model pricing

Use `/internal/ai-providers` to add per-model pricing (cents per 1M tokens).
Cost is computed per AI call and stored in `AiUsage.costCents`.

Example (GPT-4o pricing):
- Input: `250` cents / 1M tokens
- Output: `1000` cents / 1M tokens

---

## Backend validation

- **Recipe edit** — All admin recipe edits are validated with `RecipeSpecSchema` (Zod) before save. Validate button returns structured errors; Save returns 400 with error details if invalid. No change to module type is allowed.
- **Plan tier edits** — Quotas are validated (numbers, -1 allowed for unlimited) before persisting to `PlanTierConfig`.
- **Category overrides** — JSON shape is validated before saving to App Settings.
- **Store plan change** — Only allowed plans (FREE, STARTER, GROWTH, PRO, ENTERPRISE) are accepted; internal admin only.

---

## Dashboard

The dashboard (`/internal`) shows:
- **Key metrics**: Stores, AI calls (24h), API cost (24h), Active AI providers (with links to Stores, Usage, AI Providers)
- **Errors (24h)**, **Jobs (7d)** with success-rate progress bar, **Activities (24h)** (with links to Error logs, Jobs, Activity log)
- **Quick links**: Plan tiers, Categories, Recipe edit, Settings
