# Internal Developer Admin Dashboard

This dashboard is for the **app owner** (your team), not merchants.
It is protected by `INTERNAL_ADMIN_PASSWORD` and an optional SSO (OIDC) flow.

---

## Ports

| Port | Use | How to run |
|------|-----|------------|
| **3000** | Shopify embedded app (merchant-facing) | `shopify app dev` from repo root |
| **4000** | Internal admin only | From `apps/web`: `pnpm dev:internal` |

- **Shopify app** must run on **3000** so the CLI tunnel and Partner Dashboard point to the correct URL.
- **Internal admin** runs on **4000** so you can use it without touching the Shopify app. Open **http://localhost:4000/internal/login**.

---

## Features

- Configure AI providers (OpenAI / Anthropic / Azure OpenAI / Custom OpenAI-compatible)
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
- **AI Assistant** — `/internal/ai-assistant` personal Quin 3 test console with local/cloud mode switch, DB-backed multi-chat history, memory controls, tool audits, and resumable SSE chat streaming for internal capability checks
- **Settings** — includes **AI & API keys** (link to Manage AI providers for Claude/OpenAI keys and options), **Password management** (INTERNAL_ADMIN_PASSWORD / SSO), **Environment variables** (.env reference), and **Advanced** (store & plan control). Standalone **Advanced** nav removed; `/internal/advanced` redirects to Settings

---

## Routes

| Route | Purpose |
|---|---|
| `/internal/login` | Password or SSO login |
| `/internal` | Dashboard home (store count, error count, AI calls 24h) |
| `/internal/ai-providers` | Add/activate AI providers + set model pricing |
| `/internal/ai-assistant` | Quin 3 internal dashboard (local/cloud mode switch, DB-backed sessions/history, memory/tools, observability) |
| `/internal/usage` | AI usage + costs (last 30 days); per-row **Replay** + **Trace** |
| `/internal/logs` | Error logs (auto-redacted); per-row **Trace** |
| `/internal/api-logs` | API access logs with actor, path, status, duration, requestId, correlationId, SSE **Live tail**, per-row **Trace** |
| `/internal/audit` | Audit log of sensitive admin/merchant actions (deletions, plan changes, overrides) for compliance review |
| `/internal/webhooks` | Webhook events from Shopify (orders, products, customers, fulfillments, GDPR) — topic/shop/status/date filters |
| `/internal/trace/:correlationId` | Unified timeline view: every API log, job, error, AI usage row, flow step, and activity entry that share the same correlationId/requestId |
| `/internal/stores` | Installed stores; per-store AI provider override, retention overrides, **Change plan** (FREE/STARTER/GROWTH/PRO/ENTERPRISE) |
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
- SSO is fail-closed: the callback only grants access when the IdP `email` claim matches `INTERNAL_SSO_ALLOWED_EMAILS`.
- In production: add IP allowlist + MFA in front of `/internal/*`.

---

## SSO setup

Set these env vars to enable SSO login on the `/internal/login` page:

```
INTERNAL_SSO_ISSUER=https://accounts.google.com
INTERNAL_SSO_CLIENT_ID=your-oauth-client-id
INTERNAL_SSO_CLIENT_SECRET=your-oauth-client-secret
INTERNAL_SSO_REDIRECT_URI=https://your-app.example.com/internal/sso/callback
INTERNAL_SSO_ALLOWED_EMAILS=ops@example.com,admin@example.com
```

---

## AI provider management

Use `/internal/ai-providers` to:
1. Add a provider (name, type, API key, base URL, default model)
2. Set it as the global active provider
3. Set per-store overrides via `/internal/stores`
4. Add model pricing (cents per 1M tokens) for accurate cost tracking

### Provider types supported
- `OPENAI` — uses `/v1/responses` API with `json_schema` strict mode
- `ANTHROPIC` (Claude) — uses Messages API with structured output; optional **Agent Skills** (container.skills) and **code execution** tool (beta headers). Configure skills (e.g. pptx, xlsx, docx) and "Enable code execution" when adding or editing the provider.
- `AZURE_OPENAI` — OpenAI-compatible with Azure base URL
- `CUSTOM` — any OpenAI-compatible endpoint (tries `/v1/responses`, falls back to `/v1/chat/completions`)

---

## Internal AI Assistant setup

The AI Assistant lives at `/internal/ai-assistant` and uses the same runtime target configuration as **Setup the Model** (`/internal/model-setup`).

### 1) Configure local Quin (LOCAL mode)

Set the local target URL/model in **Setup the Model**:

- `localMachine.url` e.g. `http://127.0.0.1:11434`
- `localMachine.backend` = `ollama` (or `qwen3/custom` if your local server is OpenAI-compatible)
- `localMachine.model` e.g. `qwen3:latest`

For Ollama local chat, ensure:

```bash
ollama serve
ollama pull qwen3:latest
```

### 2) Configure cloud Quin (CLOUD mode)

Set the remote target in **Setup the Model**:

- `modalRemote.url` e.g. your HTTPS inference endpoint
- `modalRemote.backend` = `qwen3` / `openai` / `custom`
- `modalRemote.model` = cloud model id
- token field (optional/required based on provider)

### 3) Runtime behavior

- Session mode controls which target is preferred per chat.
- If preferred target fails and fallback is available, assistant attempts failover.
- Tool snapshots are sanitized and injected as context when user intent asks for health/errors/logs.
- Every tool execution is written to `InternalAiToolAudit` and activity logs.
- Chat streaming uses SSE with request-id idempotency, so reconnect attempts resume from persisted assistant state instead of creating duplicate turns.
- Observability panel includes request-id diagnostics, per-attempt status timeline, reconnect counts, and resume markers for operator debugging.

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
- Verify SSE compatibility at proxy/load-balancer (no response buffering for `text/event-stream`).

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
