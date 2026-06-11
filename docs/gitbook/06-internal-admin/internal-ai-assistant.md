# Internal AI assistant (operator console)

Synthesis page for **Setup the Model**, **AI Assistant**, and the shared **Qwen3** routing stack used inside `/internal/*`. Merchant RecipeSpec generation is unchanged; this surface is operator-only.

## Read order

1. This page — scope, routes, and where to look in code
2. [`../../internal-admin.md`](../../internal-admin.md) § *Internal AI Assistant setup* — full behavior (probes, banners, delete/import, SSE, activity log)
3. [`../../ai-providers.md`](../../ai-providers.md) — module-gen vs internal split, release gate, safe URLs, `ROUTER_REQUIRE_AUTH`
4. [`../../implementation-status.md`](../../implementation-status.md) — dated delivery notes (2026-05-01, 2026-05-14 entries)
5. Deploy: [`../../../deploy/railway-internal-router/README.md`](../../../deploy/railway-internal-router/README.md) · [`../../../deploy/modal-qwen-router/README.md`](../../../deploy/modal-qwen-router/README.md)

## Routes and artifacts

| Area | Location | Notes |
|------|----------|--------|
| AI Assistant UI | `apps/web/app/routes/internal.ai-assistant.tsx` | Local-first new session default, condensed readiness summary, blocked send guardrails, archive/delete, import dedupe |
| Chat stream (SSE) | `apps/web/app/routes/internal.ai-assistant.chat.stream.tsx` | `:keepalive` comments, empty-reply → error status |
| Probe JSON (polling) | `apps/web/app/routes/internal.ai-assistant.probe.tsx` | `{ localMachine, modalRemote, parseError? }` for UI recheck / auto-reprobe |
| Model setup | `apps/web/app/routes/internal.model-setup.tsx` | Runtime config, release-gate banner, decryption banner, Modal URL warning; respects `INTERNAL_AI_LOCAL_ONLY` (banner, dual-target off, no modal active/fallback/rollback) |
| Chat target validation | `apps/web/app/services/ai/assistant-chat-target-probe.server.ts` | Shared probe: router-only vs chat-ready |
| Router runtime config | `apps/web/app/services/ai/router-runtime-config.server.ts` | Encrypted DB-backed targets; `parseError` surfacing |
| Prompt router + release gate | `apps/web/app/services/ai/prompt-router.server.ts` | Rolling buffer (200), `ROUTER_RELEASE_GATE_TRIPPED` |
| Assistant orchestration + URL safety | `apps/web/app/services/ai/internal-assistant.server.ts` | `assertSafeTargetUrl`, `INTERNAL_AI_ALLOW_HOSTS`; reference-router OpenAI→`/api/chat` fallback; `INTERNAL_AI_LOCAL_ONLY` |
| Reference local router base detection | `apps/web/app/services/ai/assistant-router-local.server.ts` | `isReferenceLocalPromptRouterBaseUrl` — shared with probe + assistant |
| Local reference router | `apps/web/scripts/internal-ai-router.ts` | `/route`, optional Ollama passthrough; prod ignores `ROUTER_REQUIRE_AUTH=0` |
| Tool audit retention | `apps/web/app/services/jobs/internal-ai-audit-retention.job.ts` | Cron via `api.cron.tsx`; `INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS` |

## Operator and engineering notes (chat UX)

**Env / happy path:** Internal admin session required. Router targets come from DB-backed runtime config (`getRouterRuntimeConfig`); reference dev stack: `pnpm --filter web dev:internal` (Remix on **http://127.0.0.1:4000**, router on **8787**) plus reachable `ROUTER_OLLAMA_BASE_URL` or OpenAI-compatible upstream. Optional `INTERNAL_AI_LOCAL_ONLY=1` forces Local target only (UI, stream route, model-setup save).

**Staging-gate / smoke when Cloudflare tunnel is down:** `shopify.app.toml` may still list an expired `*.trycloudflare.com` URL (NXDOMAIN). Certify against the local internal stack instead: set `INTERNAL_ADMIN_PASSWORD` in the shell (do not commit), run `pnpm --filter web dev:internal`, then `pnpm --filter web smoke:internal-ai -- --base-url http://127.0.0.1:4000` and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4000 INTERNAL_ADMIN_PASSWORD=… pnpm --filter web test:e2e`. Restart `shopify app dev` only when you need a fresh tunnel URL in TOML/env.

**Remix data flow:** Session CRUD uses `useFetcher` + `useFormAction` and `computeSessionMutationFollowUp` (navigate after create/delete vs `revalidate` on errors/updates). Chat list uses loaders; `useNavigation` drives a route-level loading overlay. Composer send uses `computeAssistantSendDisabledReason` (single source for disabled + copy); `sendLockRef` prevents double-submit before streaming state commits.

**SSE / stream:** POST `/internal/ai-assistant/chat/stream` with JSON body (`sessionId`, `message`, optional `target`, `retryCount`, `clientRequestId`). Idempotent user rows via `clientRequestId`. Probe failures show a **warning** banner but do not block send; transport/SSE errors use the **critical** banner. Stream `finally` clears streaming, send-in-flight, and revalidates.

**Known failure modes:** Store init → placeholder session `unavailable` (send disabled). Empty model reply → persisted error + SSE `error`. Session missing → 404 JSON from stream action. Upstream timeouts / 5xx → user-facing message from JSON or SSE (no token logging in default paths).

**Best-practice checklist**

- Keep chat probes **non-blocking** for send; reserve **critical** tone for real failures.
- One helper for **send disabled + reason**; avoid duplicating `isStreaming` / fetcher / navigation checks in handlers.
- Guard **double submit** with a synchronous ref plus `sendInFlight` state for UI.
- Session mutations: centralize **idle** follow-up (`computeSessionMutationFollowUp`) so fast fetcher transitions do not skip navigate/revalidate.
- Prefer **route `ErrorBoundary`** for render-phase failures without weakening auth on loaders/actions.
- Do not log secrets or raw model bodies; map upstream errors to **short operator strings**.
- After stream completion, **revalidate** so history matches DB.
- Tests: pure helpers (`computeSessionMutationFollowUp`, `computeAssistantSendDisabledReason`) in Vitest without a browser.

## Security and compliance (summary)

- **SSRF:** Chat/inference base URLs are validated before use; HTTPS path blocks link-local and cloud metadata hosts; `http://` allows exact localhost loopbacks only; optional comma-separated **`INTERNAL_AI_ALLOW_HOSTS`** for trusted internal HTTPS hostnames.
- **Release gate:** In-memory trip on excessive schema failures or fallback rate for the active router target; shadow mode forced until operator intervention (see `ai-providers.md`).
- **Sessions vs audits:** Session delete removes messages; **`InternalAiToolAudit`** rows kept with `ON DELETE SET NULL`. Daily purge of stale audit rows per retention env.
- **Logs:** No raw model bodies in default paths; follow [`../../internal-admin.md`](../../internal-admin.md) and observability docs for redaction rules.
- **Local-only mode:** Set `INTERNAL_AI_LOCAL_ONLY=1` to forbid `modalRemote` assistant sends and dual-target failover (stream route + AI assistant UI + **Local AI Setting** `/internal/model-setup` enforce the same policy: save cannot use modal as active/fallback or dual-target; switch/rollback to modal blocked; Modal probe skipped on save).
- **Readiness rendering:** The assistant header uses one active-target readiness summary (health + chat probe) and only optional standby detail, eliminating duplicate contradictory status chips.
- **Reference router chat:** With base `http://127.0.0.1:8787` or `http://localhost:8787` and backend `qwen3`/`openai`, the app tries OpenAI-compatible paths first, then one Ollama `/api/chat` attempt on common upstream failures (see `internal-assistant.server.ts`).

## Canonical references

- Operator guide: `docs/internal-admin.md`
- Provider and gate semantics: `docs/ai-providers.md`
- Delivery ledger: `docs/implementation-status.md`
- Root product overview: `README.md`
