# AI provider integration

## Module generation vs internal (product split)

| Layer | Models | Where |
|-------|--------|--------|
| **Merchant module generation** (RecipeSpec JSON, compiler, merchant-facing flows) | **OpenAI**, **Anthropic (Claude)**, and **Google Gemini** | `getLlmClient` → `/internal/ai-providers`, store overrides, env fallbacks (`OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`). Uses Responses/Messages/generateContent APIs with strict JSON. A default (active) provider plus an optional operator-assigned fallback provider (`AppSettings.fallbackAiProviderId`). |
| **Internal + first-layer** (prompt router, internal AI Assistant, operator tooling) | **Qwen3 ~4B** class | `INTERNAL_AI_ROUTER_*`, `/internal/model-setup` dual targets (`localMachine` / `modalRemote`), reference [`internal-ai-router.ts`](../apps/web/scripts/internal-ai-router.ts). |
| **Support ticket triage** (severity/category/summary/suggested-reply, not module generation) | **`qwen3.5:9b`** (local Ollama, default) or the merchant-generation provider chain (cloud toggle) | `AppSettings.supportTriageMode`, `/internal/ai-providers` "Support triage" card, `apps/web/app/services/support/triage.server.ts`. See [§ Support ticket triage](#support-ticket-triage-separate-local-qwen-model). |

Other provider kinds in Internal Admin (e.g. Azure OpenAI, custom OpenAI-compatible) exist for integration flexibility; **RecipeSpec generation runs on the configured default provider (OpenAI / Anthropic / Gemini), with automatic failover to the assigned fallback provider** when the default call fails.

## Goals
- Strict JSON-only responses matching RecipeSpec JSON Schema
- Bounded retries for transient errors (429/5xx)
- Metadata logging (status, duration, provider request id, body hashes)
- No raw prompt/output persisted to logs by default

**Release gate / eval harness.** This doc covers the prompt router's own release gate ([§ Release gate](#release-gate)); the RecipeSpec generation quality gate (golden-prompt evals, `schemaValidRate`/`compilerSuccessRate` thresholds) is run via `pnpm --filter web evals` (`apps/web/app/services/ai/evals.server.ts`) — see [`docs/testing.md`](./testing.md) for the eval commands and CI wiring rather than re-deriving them here.

## Providers implemented
- **OpenAI Responses API** (`openai-responses.client.server.ts`): uses `text.format: { type: 'json_object' }`. Default `max_output_tokens: 8192`. Accepts `maxTokens` override — hydration passes `16000`. Set `OPENAI_API_KEY` (and optionally `OPENAI_DEFAULT_MODEL`, default `gpt-4o-mini`).
- **Anthropic Messages API** (`anthropic-messages.client.server.ts`): system prompt forces JSON-only output. Default `max_tokens: 8192`. Accepts `maxTokens` override. Supports **Claude Agent Skills** and **code execution** when configured (see below). Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_DEFAULT_MODEL`, default `claude-sonnet-4-20250514`).
- **Custom OpenAI-compatible** (`openai-compatible.client.server.ts`): tries `/v1/responses` first, falls back to `/v1/chat/completions` with `response_format`.
- **Google Gemini** (`gemini.client.server.ts`): `POST /v1beta/models/{model}:generateContent`, auth via `x-goog-api-key`, system instruction forces JSON-only, `generationConfig.responseMimeType: 'application/json'` plus native `responseSchema` (JSON-Schema keywords Gemini rejects are stripped). Default `maxOutputTokens: 8192`. Set `GEMINI_API_KEY` (and optionally `GEMINI_DEFAULT_MODEL`, default `gemini-2.5-flash`).

### Prompt caching (P2-A)

Anthropic legs (`anthropic-messages.client.server.ts`) use `cache_control` breakpoints behind `AI_PROMPT_CACHING_ENABLED` (default off) — see `docs/superpowers/plans/2026-08-28-p2-a-generation-context.md`. OpenAI/Gemini/OpenAI-compatible legs receive the exact same flat prompt string as before this change; neither client reads the new `cacheableChars` hint, so this is a strict no-op for those providers.

Provider-side automatic caching (Task 4 doc-verification spike, provider docs fetched 2026-08-28 — starting point for a future P2-D cost-optimization track):

- **OpenAI (Responses API)** — prompt caching is **automatic**, no opt-in and no opt-out. Prefix-matched; minimum cacheable prefix is 2,048 visible input tokens for pre-GPT-5.6 model generations (1,024 for GPT-5.6+). Cached input bills at a model-dependent discounted rate: `gpt-4o-mini` (this app's default) $0.075 vs $0.15/1M = 50% off; `gpt-4.1-mini` 75% off; GPT-5.6+ 0.1×. Cache lifetime ~5–10 minutes on older generations (30 min on GPT-5.6+; optional `prompt_cache_retention: "24h"` on supported models). An optional `prompt_cache_key` parameter improves cache routing; we don't send one.
- **Gemini (`generateContent`)** — **implicit caching** is automatic on Gemini 2.5+ with a 2,048-token minimum for `gemini-2.5-flash`/`-pro` (4,096 on 3.x-generation models); cached tokens bill at ~10% of the standard input rate ($0.03 vs $0.30/1M for 2.5 Flash text). The separate explicit `cachedContents` API (TTL-based, storage billed per token-hour: $1.00/1M/hr Flash, $4.50/1M/hr Pro) is **not** used by this app and is only worth it for very large, long-lived shared contexts.
- **Does this app's prompt shape defeat automatic caching?** No — it helps it. After the P2-A split, `CompiledPrompt.prompt` is the `stable + dynamic` concatenation, so the byte-stable shared prefix occupies the *first* N tokens of every request — exactly what prefix-based automatic caching keys on. Both clients also send a fixed system instruction (`instructions` / `systemInstruction`) ahead of the prompt, which is prefix-stable too. Caveats: (a) the stable prefix must clear the provider's minimum-token threshold to be cacheable at all; (b) `previousError` retry text and all per-request content live in the dynamic suffix, so they don't break the prefix.
- **Observability gap**: neither client reads its provider's cached-token usage field (Responses `usage.input_tokens_details.cached_tokens`; Gemini `usageMetadata.cachedContentTokenCount`), so OpenAI/Gemini hit rates are invisible today. Wiring those into `AiUsage.meta` alongside the Anthropic `cacheReadTokens`/`cacheCreationTokens` stats (Task 6) is the natural first step of P2-D.

## Default & fallback selection

`getLlmClient()` (`apps/web/app/services/ai/llm.server.ts`) resolves the client to use, in this order:

1. **Per-shop override** (`Shop.aiProviderOverrideId`) — a deliberate merchant/operator pin. Wins outright, never re-ranked by cost.
2. **Cost-ranked routing** — gated behind `AI_COST_ROUTING_ENABLED` (default **off**; `isCostRoutingEnabled()` in `env.server.ts`). When enabled, `getCostRankedActiveProviders()` builds a cheapest-first chain across every active, priced provider. Seeding `AiModelPrice` for cost observability does **not** by itself reroute traffic — the flag is a separate lever from the pricing data.
3. **`resolveProviderIdForShop`** — the ordinary single active-provider path (`AiProvider.isActive`, set on `/internal/ai-providers` via *Set global active*).
4. **Env-key path** (no DB providers configured) — `AppSettings.defaultAiProvider` (`openai | claude | gemini`) selects the primary from `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`; OpenAI is the implicit fallback for claude/gemini when `OPENAI_API_KEY` is also set.

In every DB-backed branch above, `withManualFallback()` appends the operator-assigned `AppSettings.fallbackAiProviderId` (*Default & fallback AI* card, same `/internal/ai-providers` page) as the last leg of the chain, unless it's already covered. `FallbackLlmClient` tries each client in order and only advances to the next on **any** thrown error (rate limit, unexpected content blocks, model error, etc.) — this is provider-agnostic; it is not specifically "Claude primary, OpenAI fallback" except in the env-key path, where that is literally the configured pair.

Cost attribution: usage is attributed to the provider that **actually served** the request. Each `ConfiguredLlmClient` stamps `servedProviderId` on its result, so when a later leg of the chain serves, `attributeServedCost` keys the price lookup on (served providerId, served model) and records the `AiUsage` row under that provider — not the one first tried. Env-key clients (no DB row) carry no `servedProviderId` and price at 0, as before. The served model is also recorded in `AiUsage.meta`.

## Internal admin provider workflow
- Internal Admin → `AI Providers` is credentials-first: operators enter only provider credentials/default model.
- Model catalog + pricing are auto-synced from catalog APIs (OpenRouter model catalog endpoint) for `OPENAI` and `ANTHROPIC`. For `GEMINI` (and Azure/Custom), enter the model id and per-1M token rates in `AiModelPrice` so cost/usage dashboards populate.
- Synced rows are persisted to `AiModelPrice` (active snapshot), and model metadata (description/context) is stored in `AiProvider.extraConfig.modelCatalog`.
- The page shows per-model usage and cost (30d) by joining `AiUsage` telemetry (`meta.model`) with active `AiModelPrice`.
- Existing `.env` keys can be imported to DB from the `AI Providers` page (masked in UI), so database credentials can become the primary source of truth.
- Provider feature toggles from `AiProvider.extraConfig` are wired into runtime calls:
  - OpenAI: `reasoningEffort`, `verbosity`, `webSearch`
  - Anthropic: `skills`, `codeExecution`

## Claude (Anthropic) Agent Skills and code execution
For ANTHROPIC providers you can optionally enable:
- **Agent Skills**: Pass a list of skill IDs in the Messages API `container.skills` parameter. Use beta headers `skills-2025-10-02` and `files-api-2025-04-14`. Skills can be Anthropic-built (e.g. `pptx`, `xlsx`, `docx`, `pdf`) or custom (IDs like `skill_01AbCdEf...`). Max 8 skills per request.
- **Code execution**: Pass the `code_execution_20250825` tool and beta header `code-execution-2025-08-25`.

Configuration is stored per provider in `AiProvider.extraConfig` (JSON: `{ skills?: string[], codeExecution?: boolean }`). Set it when adding an ANTHROPIC provider or via "Update Claude options" on the AI Providers internal page. Settings → "AI & API keys" links to AI Providers for API keys and Claude/OpenAI options.

## Anthropic Free Tier rate limits (reference)

Limits apply **per minute** (not per request). When the app receives HTTP 429 from Anthropic, it retries with backoff; if still rate-limited, the user sees the provider error. Keep these in mind for UX and when debugging:

| Model                | Requests/min | Input tokens/min | Output tokens/min |
|---------------------|--------------|------------------|-------------------|
| Claude Sonnet Active| 5            | **10K** (< 200k context) | 4K  |
| Claude Opus Active  | 5            | **10K** (< 200k context) | 4K  |
| Claude Haiku Active| 5            | **10K** (< 200k context) | 4K  |
| Claude Haiku 3      | 5            | 25K (< 200k context)    | 5K  |

- **Batch requests:** 5/min across all models.
- **Web search tool:** 30 uses/sec across all models.
- **Files API storage:** 100 GB total per org.

A single hydrate (or create-module) call can use a large share of the 10K input tokens/min; multiple quick requests can exhaust the limit. Contact Anthropic for custom rate limits.

## Internal prompt router (first-layer)

The **prompt router** chooses how much structured context (catalog slices, full schema, intent packet, etc.) is attached before the main RecipeSpec compiler runs. It is **not** a merchant-facing creative model: outputs must stay inside `PromptRouterDecision` JSON (`apps/web/app/schemas/prompt-router.server.ts`).

- **Remix client** (`INTERNAL_AI_ROUTER_URL`): calls `POST /route` with bearer auth when configured; otherwise uses deterministic confidence gating only. Tunables include `ROUTER_CONFIDENCE_MAX_DELTA`, shadow mode (`INTERNAL_AI_ROUTER_SHADOW`), canary shops (`INTERNAL_AI_ROUTER_CANARY_SHOPS`), circuit breaker thresholds, and `INTERNAL_AI_ROUTER_TIMEOUT_MS`. For the `/internal/model-setup` UI that configures these at runtime (dual-target config, decryption-failure banner, release-gate banner), see [`docs/internal-admin.md`](./internal-admin.md).
- **Reference service**: `pnpm --filter web router:internal` → `apps/web/scripts/internal-ai-router.ts` (Ollama or OpenAI-compatible backend). Defaults target **Qwen3-4B-class** routing models; point `ROUTER_OPENAI_BASE_URL` at vLLM/Ollama as needed.
- **Production self-host path**: Railway Docker service per [`deploy/railway-internal-router/README.md`](../deploy/railway-internal-router/README.md) (not Kubernetes).
- **Modal edge** (optional): `deploy/modal-qwen-router/` proxies HTTPS traffic to an upstream `/route` implementation.
- **Production auth default**: router enforces bearer auth in production (`NODE_ENV=production`) even if `ROUTER_REQUIRE_AUTH` is unset. Set `INTERNAL_AI_ROUTER_TOKEN` everywhere. Optional explicit override: `ROUTER_REQUIRE_AUTH=1` for non-prod. See **`ROUTER_REQUIRE_AUTH`** below for the production-ignore semantics.
- **Internal Admin control plane**: `/internal/model-setup` persists encrypted dual-target runtime config (`localMachine` / `modalRemote`), target-specific tokens, health/route probe status, and guarded switch/rollback controls.
- **Feature flag for rollout safety**: `INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED=1` enables DB-configured dual-target resolution. Keep unset/false to preserve legacy single-endpoint behavior while shipping UI/config first.
- **Target env fallback keys**: `LOCAL_ROUTER_*` and `MODAL_ROUTER_*` keys can supply URL/token/timeout if not stored in DB for a target.

Provider DB keys (`AiProvider`) are unrelated to this internal router token; keep `INTERNAL_AI_ROUTER_TOKEN` separate and rotate independently.

### Release gate

`releaseGateSchemaFailRateMax` and `releaseGateFallbackRateMax` (stored in the encrypted runtime config and editable from `/internal/model-setup`) are **enforcing**, not informational.

- The prompt router (`apps/web/app/services/ai/prompt-router.server.ts`) tracks the most recent **200** `/route` outcomes per target (`localMachine`, `modalRemote`) as a rolling buffer.
- After every routed call the router recomputes, for the **active** target, the rolling **schema-fail rate** (`schemaFail / calls`) and the rolling **fallback rate** (`fallbackCalls / calls`).
- If either rate exceeds its configured gate for the active target, the router:
  1. Forces `shadowMode = true` **in memory** for the rest of the process lifetime (the encrypted DB config is **not** rewritten — restart or save clears the in-memory trip).
  2. Emits a single `ROUTER_RELEASE_GATE_TRIPPED` row to the activity log with the breached metric (`schemaFailRate` / `fallbackRate`), the observed value, the configured threshold, and the active target.
- `getReleaseGateState()` is exported for UI use — `/internal/model-setup` reads it and renders a "Release gate tripped" banner with the breach reason.
- Buffer state lives in process memory; horizontally scaled deployments evaluate the gate per pod. The buffer size constant is `RELEASE_GATE_BUFFER_SIZE = 200`.

Operators should treat a tripped gate as "stop promoting this target": investigate the upstream schema validation failures or fallback churn before manually saving a fresh runtime config (which clears the in-memory trip on next route).

### Safe target URLs

`assertSafeTargetUrl` in [`internal-assistant.server.ts`](../apps/web/app/services/ai/internal-assistant.server.ts) is the SSRF guard for every assistant-chat target URL (used by both `/internal/ai-assistant` chat send and its health probe). It's a thin wrapper (`context: 'Assistant target URL'`, `allowHttpLocalhost: true`) around the shared `assertSafeTargetUrl` in `packages/network-security/src/ssrf.ts` — that shared module, not this route file, is where to verify the exact rule set.

- **`http://` is local-only**: allowed only for `127.0.0.1`, `localhost`, `::1`, plus any hostname listed in `INTERNAL_AI_ALLOW_HOSTS` (comma-separated, case-insensitive). Any other `http://` hostname is rejected (`... http is only allowed for localhost hosts`).
- **`https://` goes through the full shared SSRF check**: a blocklist of known cloud-metadata hostnames (`metadata.google.internal`, `instance-data.ec2.internal`, `metadata.azure.internal`, etc.), then DNS resolution of the hostname followed by a check of **every resolved address** against a private/reserved-range blocklist — not just link-local. That blocklist covers RFC1918 private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback, link-local (`169.254.0.0/16`, `fe80::/10`), CGNAT (`100.64.0.0/10`), several IETF-reserved IPv4 blocks, and IPv6 loopback/link-local/unique-local/reserved ranges. This is broader than "link-local + metadata hosts only" — re-read `assertSafeIPv4`/`assertSafeIPv6` in the shared module rather than trusting a summary if the exact boundary matters.
- **`INTERNAL_AI_ALLOW_HOSTS` only affects the `http://` path.** It does **not** exempt an `https://` request from the metadata/private-range checks above — a hostname on the allowlist that resolves to a private IP over `https://` is still rejected. (An earlier version of this doc claimed the allowlist bypasses checks "for both `http:` and `https:`" — that's not what the code does; the wrapper only ever passes the allowlist as `allowedHttpHostnames`, which the shared module only consults on the `http://` branch.)
- Any other protocol (`file:`, `ftp:`, etc.) is rejected.

### `ROUTER_REQUIRE_AUTH`

The reference router (`apps/web/scripts/internal-ai-router.ts`) reads `ROUTER_REQUIRE_AUTH` to decide whether `/route` requires the bearer token in `INTERNAL_AI_ROUTER_TOKEN`.

- In **non-production** (`NODE_ENV !== 'production'`): `ROUTER_REQUIRE_AUTH=0|false|no` disables auth, as before. Useful for local development against an unset `INTERNAL_AI_ROUTER_TOKEN`.
- In **production** (`NODE_ENV === 'production'`): the explicit `0`/`false`/`no` override is **ignored**. The router logs `[internal-ai-router] WARN: ROUTER_REQUIRE_AUTH=0 ignored in production` on startup and keeps bearer auth on. There is no supported way to run the router without auth in production.

### Target health probing

- Resource route: [`/internal/ai-assistant/probe`](../apps/web/app/routes/internal.ai-assistant.probe.tsx) returns `{ localMachine, modalRemote, parseError? }` where each side has `health` (liveness) and `chatProbe` (chat-endpoint validation) results, via the shared `probeAssistantTargets()` service (`apps/web/app/services/ai/assistant-probe-route.server.ts`) — the same function backing the dashboard KPI tile. Both `GET` and `POST` are admin-gated via `requireInternalAdmin`.
- [`/internal/ai-assistant`](../apps/web/app/routes/internal.ai-assistant.tsx) shows the probe result from its own loader (refreshed on ordinary Remix revalidation — e.g. after sending a chat message or switching session) and offers a manual **"Recheck"** button next to the status pill that calls the probe route on demand and overlays the fresh result until the next loader revalidation.
- **Correction:** an earlier version of this doc described an automatic 20-second background poll while chat is blocked. No such interval-based auto-poll exists in the current route — re-verify against `apps/web/app/routes/internal.ai-assistant.tsx` before restating that claim; as of this writing, recovery requires either a manual "Recheck" click or an action that triggers a loader revalidation.

### Safe switching runbook

Use this sequence when promoting `modalRemote`:

1. Save endpoint/token/model for both targets in **Setup the Model**.
2. Run health probe (`/healthz`) on candidate target.
3. Run route-contract probe (`/route`) and confirm schema validity.
4. Switch active target (auto-enables shadow mode).
5. Observe router metrics by target (schema rejects, timeouts, fallback rate, p95).
6. Disable shadow mode only after metrics remain within your promotion thresholds.
7. If errors spike, rollback to previous target (keeps shadow mode on as safety rail).

## Support ticket triage (separate local Qwen model)

Distinct from the internal prompt router above — this is a **different** local-first Qwen deployment, used only to triage merchant support tickets (severity/category/summary/suggested reply), not to route module-generation requests. Implemented in `apps/web/app/services/support/triage.server.ts`.

- **Local-first default**: targets a machine-local Ollama model (`qwen3.5:9b`) at `http://127.0.0.1:11434` (localhost-only — `SUPPORT_TRIAGE_URL` is rejected if it doesn't resolve to a local host). `think: false` and a strict JSON `format` schema are mandatory on the Ollama call — thinking mode was measured burning far more tokens than the visible output on this model, so it's disabled outright rather than budgeted around.
- **Cloud toggle**: `AppSettings.supportTriageMode` (`local | cloud`, default `local`) plus an optional `AppSettings.supportTriageProviderId` to pin the cloud call to a specific `AiProvider`, both set from the same **Support triage** card on `/internal/ai-providers`. When `cloud`, triage runs through the ordinary `getLlmClient()`/`FallbackLlmClient` chain described above instead of the local Ollama call.
- **Env overrides win over the DB toggle**: `SUPPORT_TRIAGE_PROVIDER` (`local | cloud`) overrides `supportTriageMode`; `SUPPORT_TRIAGE_URL` and `SUPPORT_TRIAGE_MODEL` override the local Ollama endpoint/model; `SUPPORT_TRIAGE_TIMEOUT_MS` (default 25000, clamped 5000–55000 to stay under the Cloudflare tunnel ceiling) overrides the request budget. This mirrors the internal copilot's "self-hosted by default, cloud opt-in" posture.
- Cold model load on the reference hardware (16 GB M1 Pro, 2026-07-14 measurement) dominates end-to-end latency, so the Ollama call sets a 30-minute `keep_alive` to keep the model resident between requests rather than reloading it per ticket.

## Fallback chain

`FallbackLlmClient.generateRecipe()` catches any error from the client it wraps and retries the next client in the chain; if every leg fails, the **first** (primary) error is re-thrown (more informative for debugging than the last leg's error). See [§ Default & fallback selection](#default--fallback-selection) for how the chain itself is built — it varies by whether cost routing, a DB-configured fallback, or the plain env-key pair (Claude primary / OpenAI fallback, when both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set and no DB provider exists) is in play.

## Token limits per call type

| Call | Anthropic | OpenAI |
|------|-----------|--------|
| Recipe generation | `max_tokens: 8192` (default) | `max_output_tokens: 8192` (default; "visible" budget, see below) |
| Hydration (`hydrateRecipeSpec`) | `HYDRATE_TOKEN_BUDGET = 16000` | `HYDRATE_TOKEN_BUDGET = 16000` |

These are passed via `hints.maxTokens` through `LlmClient.generateRecipe`. Individual client functions accept `maxTokens` and pass it to the provider API.

**OpenAI reasoning models get extra headroom.** `openai-responses.client.server.ts` caps `max_output_tokens` at the visible-JSON budget above for ordinary models, but reasoning models (`gpt-5*`, `o1`/`o3`/`o4*`) spend output tokens on hidden reasoning *before* the visible answer, and Shopify's/OpenAI's cap covers both combined — so the client adds a fixed `REASONING_HEADROOM` (6000 tokens) on top of the caller's budget for those models specifically, rather than letting reasoning silently eat the visible JSON's allowance. The configured default model (`gpt-4o-mini`) is not a reasoning model, so this only matters if `OPENAI_DEFAULT_MODEL`/a DB provider's model is switched to one.

## Common pitfalls

- **Do not set `max_output_tokens` below 8192 for OpenAI** — the hydration envelope easily exceeds 4096 tokens and the response will be truncated (invalid JSON). See debug.md §17.
- **Do not add large generative tasks (HTML, reports) to the hydration prompt** — they inflate output size and push response time past the Cloudflare tunnel timeout (~90s). See debug.md §18.
- **Model name must be `gpt-4o-mini`, not `gpt-5-mini`** — check `OPENAI_DEFAULT_MODEL` in `.env` or the DB `AiProvider.model` field.
- **There is no production stub fallback.** `StubLlmClient` exists in `llm.server.ts` but is only ever constructed by the eval/tournament harnesses (`evals.server.ts`, `tournament.server.ts`) — `getLlmClient()`'s production path throws `AiProviderNotConfiguredError` when no provider (DB or env-key) resolves. Don't assume an unconfigured shop silently gets stub/placeholder output.

## Notes
If you enable a “debug capture” mode later, store it per shop and time-bound it (e.g. 15 minutes) to avoid retaining sensitive data.

## 2026-06-14 — Module-generation uplift: call budget + guardrails (specs 022/023)

Source of truth: [`generation.md`](./generation.md) §4 "Module System v2". Contracts: `packages/platform-contracts/src/{requirement-spec,generation-guardrails}.ts`.

### Per-create call budget (WS1 / 022)
Asserted and logged via `AiUsage`:
- ≤ 1 classify-LLM (conditional, only when keyword+embedding confidence is low)
- ≤ 1 router (optional)
- N generation (one per approach hint) + per-option repair
- RequirementSpec extraction adds **0** always-on hops (deterministic from classify + IntentPacket + control-pack manifest); at most **1** conditional LLM escalation when `confidenceScore < CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES`.
- Search-augment (`solution-search.server.ts`) adds **0** LLM hops (deterministic ranking of `MODULE_TEMPLATES`).
- **2026-07-03 (spec 027):** the create path passes no `escalate` callback, so RequirementSpec extraction is **fully deterministic in production** (the escalation seam is unused, `source: 'deterministic'`). The earlier v2-only create-time "auto-fill on incomplete coverage" hop was **removed** (it was built on a broken coverage comparison — see `debug.md §21`), so create adds no coverage/fill hop; "fill missing" is a separate post-hydrate action.

### Guardrails (WS2 / 023)
- Merchant text is wrapped in a delimited `<user_request>` envelope (`PromptEnvelopeSchema`) in every prompt compiler, with a system rule declaring the wrapped text is data, not instructions.
- `injection-scan.server.ts` flags + strips known override patterns (flag, never hard-block).
- Schema-bound invariant: `assertKnownDiscriminator` rejects unknown/contradictory `type` **before** `RecipeSpecSchema.parse`, so `generateValidatedRecipe` short-circuits repair (reject, not repair).
- SSRF (`assertSafeTargetUrl` + connector allowlist) and escape-hatch sanitisation (`assertGeneratedPreviewHtmlIsSafe`, `sanitizeCustomCss`) are unchanged and test-proven.
