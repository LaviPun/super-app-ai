# M12 — Sidekick App Extension for the SuperApp

**Phase #4 · Piece: Sidekick App Extension (data + action)**
**Status:** design (buildable). **Substrate:** flat-pin `RecipeSpec.config` + `generate._index.tsx` builder + `/api/agent/*` REST surface (the control-pack composer / `moduleSystemVersion` were pruned in `a17a748` — do **not** resurrect them).

## 0. TL;DR of the approach

Shopify Sidekick "app extensions" (Spring '26, editions item 12; `shopify.dev/docs/apps/build/sidekick`) let an app declare **data tools** (read-only) and **action tools** (staged, merchant-confirmed) in a JSON `tools` file referenced from a `sidekick` extension's `shopify.extension.toml`, plus a consolidated `extensions_summary` in `shopify.app.toml` so Sidekick knows when to route a merchant question to us. When a tool fires, Sidekick POSTs a signed request to our app's `runtime_url`; we verify the HMAC, resolve the tool, and execute.

**Key insight from the codebase:** we already ship a complete, stable, agent-facing JSON REST surface at `/api/agent/*` (self-described by `GET /api/agent`, see `apps/web/app/routes/api.agent.tsx:1`). Every capability a Sidekick tool needs already exists as an agent route with Zod-validated bodies, plan gating, and pre-publish validation. **The Sidekick extension is therefore a thin declaration + a single HMAC-authenticated dispatcher that maps each declared tool to an existing agent operation** — not a new capability layer. Action tools additionally write to a new `SidekickStagedAction` table so the mutation happens only after the merchant confirms in-conversation.

This keeps the piece almost entirely additive: one new extension dir, one new runtime route, one new dispatcher service, one new Prisma model, and a summary block appended to `shopify.app.toml`.

---

## 1. Current state (file:line)

- **App config:** `shopify.app.toml` — `client_id`, `application_url` (line 6, Cloudflare tunnel), `[access_scopes]` (line 43), `[app_proxy]` (line 49), `[metaobjects.app.*]` (line 57+). **No `extensions_summary`, no `sidekick` extension.**
- **Extension toml pattern (tool-declaring analog):** `extensions/superapp-flow-action-send-http/shopify.extension.toml` — shows `[[extensions]]` with `type`, `handle`, `uid`, `runtime_url`, `[settings]` fields. The `runtime_url` caveat (CLI does not auto-rewrite it on tunnel rotation) applies verbatim to the Sidekick extension.
- **Extension runtime auth pattern:** `apps/web/app/routes/api.flow.action.tsx:20-63` — POST-only route that reads the raw body, pulls `x-shopify-hmac-sha256`, verifies with `verifyFlowActionHmac(rawBody, hmac, SHOPIFY_API_SECRET)`, resolves a `handle`→internal id, delegates. **This is the exact shape the Sidekick runtime route copies.**
- **Agent REST surface (the tool backends):** `apps/web/app/routes/api.agent.tsx` self-describes 20+ operations. Concrete ones the tools wrap:
  - `GET /api/agent/modules` → list (`api.agent.modules.tsx:19-45`) returns `{ id, name, type, category, status, latestVersion, activeVersion, updatedAt, createdAt }`.
  - `GET /api/agent/modules/:moduleId` (`api.agent.modules.$moduleId.tsx`) → full spec per version.
  - `POST /api/agent/generate-options` (`api.agent.generate-options.tsx:25`) → 3 RecipeSpec options from a prompt, **no persistence**.
  - `POST /api/agent/modules` (`api.agent.modules.tsx:46-90`) → create DRAFT from a validated `RecipeSpec` via `ModuleService.createDraft`.
  - `POST /api/agent/modules/:moduleId/spec` → new DRAFT version (configure).
  - `POST /api/agent/modules/:moduleId/publish` (`api.agent.modules.$moduleId.publish.tsx`) → full publish path: preflight scopes, `PublishPolicyService`, feature flags, `validateBeforePublish`, `PublishService.publish`, `markPublishedWithTransition`, progressive canary. **We reuse this wholesale — no re-implementation.**
- **Performance data (data extension backend):** `apps/web/app/services/analytics/module-events.server.ts:54` `getModuleMetricsDaily(shopId, moduleId, days=30)`, `:65` `getRecentModuleEvents(...)`. **There is no aggregated per-module performance *route* yet** — see §5, this is the one real gap the data extension needs filled.
- **Auth:** all `/api/agent/*` use `shopify.authenticate.admin(request)` (session-token / embedded auth). Sidekick calls arrive HMAC-signed, **not** with an admin session — so the dispatcher cannot call these routes over HTTP; it calls the underlying **services** directly with a shop-scoped context it derives from the verified payload (§5).
- **Prisma:** `apps/web/prisma/schema.prisma` — `Shop` (line 13), `Job` (line 313), `ModuleEvent` (line 798). No staging model.
- **Spec dir:** `specs/031-composites-and-surfaces/design/` exists.

---

## 2. Target shape (exact types + example)

### 2.1 `extensions_summary` in `shopify.app.toml` (append)

```toml
# --- appended after [app_proxy] block, before [auth] ---
[extensions_summary]
# One-paragraph routing hint Sidekick uses to decide when to invoke our tools.
summary = """
Super App AI generates and publishes Shopify storefront, checkout, admin, POS, \
customer-account, and Shopify Functions modules from a natural-language prompt \
(popups, banners, bundles, upsells, discount/cart-transform functions, \
recommendation blocks). Use its tools to see how a merchant's generated modules \
are performing, and to create, configure, or publish a module from a conversation. \
All create/configure/publish actions are STAGED and require the merchant to confirm \
before anything changes in their store.
"""
```

### 2.2 New extension: `extensions/superapp-sidekick/shopify.extension.toml`

```toml
api_version = "2026-04"

[[extensions]]
name = "Super App AI Sidekick"
uid = "GENERATE-A-UUID-LIKE-THE-FLOW-EXTS"   # see §3 note on uid generation
type = "sidekick"
handle = "superapp-sidekick"
description = "Lets Sidekick view module performance and stage module create/configure/publish for Super App AI."

# Runtime endpoint Sidekick POSTs signed tool-invocation payloads to.
# SAME caveat as flow extensions: CLI does NOT auto-rewrite this on tunnel rotation.
# Keep in sync with application_url in ../../shopify.app.toml — prefer a stable prod host.
runtime_url = "https://distribution-episode-editors-ordinary.trycloudflare.com/api/sidekick/invoke"

# JSON file declaring the tools (data + action). Path is relative to this toml.
tools = "tools.json"
```

> **NOTE — verify the exact field names against the live spec at build time.** The public Sidekick-extension schema was still stabilizing at Spring '26. `type`, `tools`, `runtime_url` and the top-level `extensions_summary` are the documented mechanism per the research (`ai-leverage.md` §B1) and editions item 12, but the CLI validation is the source of truth. If the CLI rejects `type = "sidekick"`, run `shopify app generate extension` and pick the Sidekick template to get the canonical toml, then port the tool list below into whatever file it references. **This is DECISION #1 in §8.**

### 2.3 Tool declaration: `extensions/superapp-sidekick/tools.json`

Two kinds. Each tool is scoped and intent-specific (never a generic "do anything"). Data tools are read-only. Action tools set `"staged": true` so Sidekick renders a confirmation card before dispatch.

```json
{
  "tools": [
    {
      "name": "list_modules",
      "kind": "data",
      "description": "List the merchant's Super App AI modules with type, status, and version. Use to answer 'what modules do I have / are they published'.",
      "input_schema": {
        "type": "object",
        "properties": {
          "status": { "type": "string", "enum": ["ANY", "DRAFT", "PUBLISHED"], "default": "ANY" }
        },
        "additionalProperties": false
      }
    },
    {
      "name": "get_module_performance",
      "kind": "data",
      "description": "Get impressions, interactions, conversions and conversion rate for a module over the last N days. Use to answer 'how is my <module> performing'.",
      "input_schema": {
        "type": "object",
        "properties": {
          "moduleId": { "type": "string" },
          "days": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 }
        },
        "required": ["moduleId"],
        "additionalProperties": false
      }
    },
    {
      "name": "stage_create_module",
      "kind": "action",
      "staged": true,
      "description": "Generate a new module from a natural-language description and STAGE it for the merchant to review. Does NOT publish. Returns a preview + a stagedActionId to confirm.",
      "input_schema": {
        "type": "object",
        "properties": {
          "prompt": { "type": "string", "minLength": 4 },
          "preferredType": { "type": "string", "default": "Auto" }
        },
        "required": ["prompt"],
        "additionalProperties": false
      }
    },
    {
      "name": "stage_configure_module",
      "kind": "action",
      "staged": true,
      "description": "Apply a natural-language change to an existing module (e.g. 'make the countdown 24h') as a new DRAFT and STAGE it for confirmation. Does NOT publish.",
      "input_schema": {
        "type": "object",
        "properties": {
          "moduleId": { "type": "string" },
          "instruction": { "type": "string", "minLength": 3 }
        },
        "required": ["moduleId", "instruction"],
        "additionalProperties": false
      }
    },
    {
      "name": "stage_publish_module",
      "kind": "action",
      "staged": true,
      "description": "Publish a module's latest draft. STAGED — the merchant confirms before it goes live. For theme modules a themeId is required (Sidekick will ask).",
      "input_schema": {
        "type": "object",
        "properties": {
          "moduleId": { "type": "string" },
          "themeId": { "type": "string" }
        },
        "required": ["moduleId"],
        "additionalProperties": false
      }
    }
  ]
}
```

### 2.4 New Zod contract: `apps/web/app/services/sidekick/sidekick-tools.contract.ts`

Mirrors `tools.json` server-side so the dispatcher validates input the same way the agent routes do. (Single source of truth = this file; `tools.json` is the declaration Shopify reads, this is what we enforce.)

```ts
import { z } from 'zod';

export const SidekickToolName = z.enum([
  'list_modules',
  'get_module_performance',
  'stage_create_module',
  'stage_configure_module',
  'stage_publish_module',
]);
export type SidekickToolName = z.infer<typeof SidekickToolName>;

export const ToolInputSchemas = {
  list_modules: z.object({ status: z.enum(['ANY', 'DRAFT', 'PUBLISHED']).default('ANY') }),
  get_module_performance: z.object({ moduleId: z.string().min(1), days: z.number().int().min(1).max(90).default(30) }),
  stage_create_module: z.object({ prompt: z.string().min(4), preferredType: z.string().default('Auto') }),
  stage_configure_module: z.object({ moduleId: z.string().min(1), instruction: z.string().min(3) }),
  stage_publish_module: z.object({ moduleId: z.string().min(1), themeId: z.string().optional() }),
} as const;

/** Sidekick invocation envelope (verify exact field names vs live payload — see §8 DECISION #1). */
export const SidekickInvokeSchema = z.object({
  tool: SidekickToolName,
  shop_domain: z.string().min(1),          // snake_case, like Flow's payload
  input: z.record(z.unknown()).default({}),
  /** Present only for a confirm dispatch of an already-staged action. */
  staged_action_id: z.string().optional(),
  /** Sidekick sets true on the second call, after the merchant confirmed the card. */
  confirmed: z.boolean().optional(),
  conversation_id: z.string().optional(),
});
export type SidekickInvoke = z.infer<typeof SidekickInvokeSchema>;
```

### 2.5 New Prisma model: `SidekickStagedAction`

```prisma
model SidekickStagedAction {
  id             String   @id @default(cuid())
  shopId         String
  shop           Shop     @relation(fields: [shopId], references: [id])
  tool           String   // stage_create_module | stage_configure_module | stage_publish_module
  input          String   // JSON of validated tool input
  /// Populated at STAGE time so the confirmation card can show a real preview
  /// (module name/type + PreviewService output for create/configure).
  preview        String?  // JSON
  /// For create/configure we generate the spec at stage time and store it,
  /// so confirm just persists — no second AI call, no drift.
  stagedSpec     String?  // JSON RecipeSpec
  /// For configure/publish: the module the action targets.
  moduleId       String?
  status         String   @default("STAGED") // STAGED | CONFIRMED | EXECUTED | EXPIRED | CANCELLED
  conversationId String?
  createdAt      DateTime @default(now())
  expiresAt      DateTime // stage TTL, e.g. now + 30 min
  executedAt     DateTime?

  @@index([shopId, status])
  @@index([expiresAt])
}
```

Add `sidekickStagedActions SidekickStagedAction[]` to `model Shop`.

### 2.6 Example round-trip (stage_create → confirm)

```
Merchant (in Sidekick): "Add a spin-to-win popup that matches my brand."
  → Sidekick invokes tool `stage_create_module` { prompt: "spin-to-win popup matching my brand" }
  → POST /api/sidekick/invoke  (HMAC signed, confirmed:false)
  → dispatcher: verify HMAC → resolve shopId from shop_domain
     → StagedActionService.stageCreate(): calls generateSidekickCreateOptions(prompt)
       (reuses the generate-options pipeline), picks option[0], runs PreviewService,
       writes SidekickStagedAction{ status:STAGED, stagedSpec, preview }
     → returns { staged_action_id, confirmation: { title:"Spin-to-win popup",
         summary:"theme.popup · matches store palette", previewHtml } }
  → Sidekick shows a confirmation card with the preview.

Merchant taps "Create":
  → Sidekick re-invokes `stage_create_module` { staged_action_id, confirmed:true }
  → dispatcher: load staged row → ModuleService.createDraft(shop, stagedSpec)
     → mark row EXECUTED → return { moduleId, status:"DRAFT",
         message:"Draft created. Want me to publish it?" }
```

---

## 3. Files to change

**New files**
- `extensions/superapp-sidekick/shopify.extension.toml` — extension declaration (§2.2).
- `extensions/superapp-sidekick/tools.json` — tool list (§2.3).
- `apps/web/app/routes/api.sidekick.invoke.tsx` — HMAC-verified runtime route (§5).
- `apps/web/app/services/sidekick/sidekick-tools.contract.ts` — Zod contracts (§2.4).
- `apps/web/app/services/sidekick/sidekick-dispatcher.server.ts` — tool→handler map + HMAC verify (§5).
- `apps/web/app/services/sidekick/staged-action.service.ts` — stage/confirm/expire lifecycle (§5).
- `apps/web/app/services/sidekick/sidekick-context.server.ts` — derives an admin GraphQL client for a shop **without** a live merchant session (offline token), needed by publish (§5, DECISION #2).
- `apps/web/app/routes/api.agent.modules.$moduleId.performance.tsx` — **also** exposes the aggregated performance read as an agent route (fills the §1 gap; the dispatcher calls the shared service, this route makes it testable/reusable) (§5).
- `apps/web/app/services/analytics/module-performance.server.ts` — `getModulePerformanceSummary(shopId, moduleId, days)` aggregation over `getModuleMetricsDaily` (§5).
- Tests (§7).

**Modified files**
- `shopify.app.toml` — append `[extensions_summary]` (§2.1).
- `apps/web/prisma/schema.prisma` — add `SidekickStagedAction` (line ~798 area) + relation on `Shop` (line 13). New migration.
- `apps/web/app/routes/api.agent.tsx` — add `get_module_performance` to the discovery index (keeps the self-describing surface honest; additive).

**Explicitly NOT changed:** `generate._index.tsx`, `RecipeSpec`, the compiler, `PublishService`, `PublishPolicyService`, `ModuleService`. Sidekick composes them; it does not modify them.

**uid note:** the flow extensions use hand-shaped uids (`227312df-…8af1fdb7`). Generate a fresh v4 UUID for the Sidekick extension's `uid`; the CLI will otherwise assign one on first `deploy`. Do not reuse an existing uid.

---

## 4. Generation wiring

The action tools reuse the **existing** classify→generate pipeline; no new generator.

- `stage_create_module` → wrap the same code path as `POST /api/agent/generate-options` (`api.agent.generate-options.tsx`): `classifyUserIntent` → `generateValidatedRecipeOptions` → get 3 options. Extract a shared function `generateModuleOptions(shopRow, prompt, preferredType)` from that route into `apps/web/app/services/ai/generate-options.server.ts` and call it from **both** the agent route and the staged-action service (small refactor, keeps one pipeline). Sidekick picks `options[0]` for the card (merchant can regenerate by re-asking; multi-option selection inside a Sidekick card is a follow-up, §8).
  - Apply store-aesthetic palette exactly as `create-module` does (`ensureStoreAesthetic` / `applyStorePalette`) so "matches my brand" is real, not a promise — these already run inside the create pipeline; ensure the shared function includes them.
- `stage_configure_module` → reuse the modify pipeline behind `POST /api/agent/modules/:moduleId/modify` (proposes 3 options against the current spec); take `options[0]`, store as `stagedSpec`. Confirm persists via `ModuleService.createNewVersion` (same as `modify-confirm`).
- `stage_publish_module` → **no generation.** Pure orchestration over the publish path (§5).

**Design-QA / validation gates are inherited:** because we go through the same generate + `validateBeforePublish` + `PublishPolicyService` gates, the DESIGN.md/design-QA and plan-gating guarantees from Phase #3 apply to Sidekick-originated modules with zero extra work. A Sidekick create is indistinguishable downstream from an agent-API create except for the `source` tag.

---

## 5. Runtime / compile / render / publish wiring (make-or-break)

This is where a Sidekick extension usually dies: **the runtime call is HMAC-signed and carries no admin session**, so you cannot just proxy to `/api/agent/*` (those call `shopify.authenticate.admin(request)` and would 302 to OAuth). The dispatcher must (a) verify the signature, (b) resolve a shop, (c) call the underlying **services** with a shop-scoped context, and (d) for publish, mint an **offline** admin client.

### 5.1 Route — `apps/web/app/routes/api.sidekick.invoke.tsx`

Structural copy of `api.flow.action.tsx:20-63`:

```ts
export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const rawBody = await request.text();
  const hmac = request.headers.get('x-shopify-hmac-sha256')
            ?? request.headers.get('http-x-shopify-hmac-sha256') ?? '';
  const secret = process.env.SHOPIFY_API_SECRET ?? '';
  if (!secret) return json({ error: 'Server misconfiguration' }, { status: 500 });
  if (!hmac) return json({ error: 'Missing HMAC' }, { status: 401 });
  if (!(await verifySidekickHmac(rawBody, hmac, secret)))   // reuse Flow's HMAC impl
    return json({ error: 'Invalid HMAC' }, { status: 401 });

  const parsed = SidekickInvokeSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) return json({ error: 'Bad payload', details: parsed.error.flatten() }, { status: 400 });

  return dispatchSidekickTool(parsed.data);   // returns a normalized ToolResult
}
```

- **HMAC:** reuse `verifyFlowActionHmac` (rename-export as `verifySidekickHmac` or import directly) from `~/services/workflows/shopify-flow-bridge` — same `SHOPIFY_API_SECRET` base64 HMAC-SHA256 scheme Shopify uses for extension callbacks. **Verify Sidekick signs identically to Flow — DECISION #1.** If Sidekick uses OAuth-token auth instead of shared-secret HMAC, swap in `shopify.authenticate.public` / the documented Sidekick verifier; the rest of the dispatcher is unchanged.
- **Idempotency:** reuse `checkAndMarkWebhookEvent` (already imported by the flow route) keyed on `conversation_id + tool + staged_action_id` so a retried confirm doesn't double-publish.

### 5.2 Dispatcher — `sidekick-dispatcher.server.ts`

```ts
export async function dispatchSidekickTool(inv: SidekickInvoke): Promise<Response> {
  const shopRow = await getPrisma().shop.findUnique({ where: { shopDomain: inv.shop_domain } });
  if (!shopRow) return json({ error: 'Unknown shop' }, { status: 404 });

  const input = ToolInputSchemas[inv.tool].safeParse(inv.input);
  if (!input.success) return json({ error: 'Invalid input', details: input.error.flatten() }, { status: 400 });

  switch (inv.tool) {
    case 'list_modules':            return dataListModules(shopRow, input.data);
    case 'get_module_performance':  return dataPerformance(shopRow, input.data);
    case 'stage_create_module':
    case 'stage_configure_module':
    case 'stage_publish_module':
      return inv.confirmed && inv.staged_action_id
        ? confirmStagedAction(shopRow, inv)          // second call → execute
        : stageAction(shopRow, inv.tool, input.data);// first call → stage + preview
  }
}
```

### 5.3 Data tools (read-only — safe, no session needed)

- `dataListModules` → `prisma.module.findMany` scoped by `shopId` (same query as `api.agent.modules.tsx:20`), filter by `status` when not `ANY`. Returns `{ modules: [...] }`.
- `dataPerformance` → new `getModulePerformanceSummary(shopId, moduleId, days)` in `module-performance.server.ts`: reads `getModuleMetricsDaily` rows and aggregates `{ impressions, interactions, conversions, conversionRate, byDay[] }`. **This is the only genuinely new read logic**; everything else it needs (`moduleMetricsDaily`) already exists (`module-events.server.ts:54`). Also surfaced as `GET /api/agent/modules/:moduleId/performance` for reuse + tests.
  - **Honesty note:** if `moduleMetricsDaily` is not yet being populated for a given surface, return `{ available: false, reason: "No metrics recorded yet" }` rather than zeros — do not fabricate performance. (Whether metrics ingestion is wired for every surface is out of scope here; the data tool reports truthfully on whatever exists.)

### 5.4 Action tools — stage phase

`stageAction(shopRow, tool, input)`:
- **create:** `generateModuleOptions(shopRow, prompt, preferredType)` (§4) → `spec = options[0].recipe` → `PreviewService.render(spec)` for `previewHtml` → write `SidekickStagedAction{ tool, input, stagedSpec: spec, preview, expiresAt: +30min }` → return `{ staged_action_id, confirmation:{ title: spec.name, summary: \`${spec.type} · ...\`, previewHtml } }`.
- **configure:** load module, run modify pipeline → `options[0]` → store as `stagedSpec` + preview diff → same envelope.
- **publish:** no generation. Load module + latest DRAFT, run **read-only preflight checks now** so the card can warn early: `runPublishPreflight`, `PublishPolicyService.evaluate`, `validateBeforePublish`. If any fail, return `{ blocked, reasons }` as the card body (merchant sees "can't publish: plan X / missing scope Y") instead of staging. If it's a `theme.*` module and no `themeId`, return `{ needs: "themeId", themes:[...] }` so Sidekick asks. Otherwise stage `{ tool, moduleId, input:{themeId} }`.

### 5.5 Action tools — confirm phase (`confirmStagedAction`)

- Load the staged row; reject if `status != STAGED` or `expiresAt < now` (→ `{ error: "This action expired, ask me again" }`).
- **create:** `ModuleService.createDraft(shop, stagedSpec)` → `EXECUTED` → `{ moduleId, status:"DRAFT" }`.
- **configure:** `ModuleService.createNewVersion(shop, moduleId, stagedSpec)` → `EXECUTED`.
- **publish (make-or-break):** re-run the **exact** body of `api.agent.modules.$moduleId.publish.tsx` — but that route needs an `admin` GraphQL client from `authenticate.admin`, which we don't have here. Two options:
  - **DECISION #2 (recommended): offline-session admin client.** Build `sidekick-context.server.ts::getOfflineAdmin(shopDomain)` that loads the stored offline access token for the shop (the app already persists `Shop.accessToken`, schema line 13; the embedded app installs offline tokens) and constructs an admin GraphQL client via the same `@shopify/shopify-app-remix` server config used in `shopify.server`. Then call a shared `publishModule({ admin, session:{shop}, moduleId, themeId })` extracted from the agent publish route into `apps/web/app/services/publish/publish-orchestrator.server.ts`. **Refactor: lift the publish route body into that orchestrator, have the agent route call it too** (route becomes a thin auth+delegate wrapper). This is the single biggest code move in the piece and the main risk (§8).
  - Fallback if offline-token client is not readily constructible: stage the publish as a `Job{ type:'PUBLISH', payload:{ source:'sidekick', moduleId, target } }` (the model already supports this, schema line 313) and let the existing worker execute it with its own admin context; the confirm response is then "Publishing now — I'll let you know." This trades synchronous feedback for zero new auth surface. **Pick one in §8.**
- Log via `ActivityLogService` with `source:'sidekick'` (mirrors `source:'agent_api'` at `api.agent.modules.$moduleId.publish.tsx`).

### 5.6 Compile / render

No new compile or render path. `stagedSpec` is a plain `RecipeSpec`; create/configure persist it through `ModuleService`, and publish runs the identical `PublishService.publish(spec, target)` + progressive-canary machinery. Preview HTML for the confirmation card comes from the existing `PreviewService` (deterministic, no AI) — reuse whatever `modules.$moduleId.tsx` / hydrate already calls. If Sidekick cards can't render arbitrary HTML, degrade to a text summary (`spec.name`, `spec.type`, key config pins); **DECISION #1** (card capabilities).

---

## 6. Back-compat

- **Purely additive.** No existing route, service, schema field, or extension changes behavior. The `extensions_summary` and new extension only add capability.
- **Refactors preserve signatures:** extracting `generateModuleOptions` and `publishModule`/`publish-orchestrator` must leave `/api/agent/generate-options` and `/api/agent/modules/:id/publish` returning byte-identical JSON — they become thin wrappers. Guard with the existing agent-route tests plus a "wrapper returns same shape" assertion.
- **Feature-flag the extension runtime:** gate `api.sidekick.invoke.tsx` behind `SIDEKICK_EXTENSION_ENABLED` (default off) like other in-flight surfaces, so deploying the code before the extension is approved/registered is inert. The extension itself can be added to the app without enabling the runtime.
- **Prisma migration is additive** (new table + new nullable relation) — no data backfill, safe on live DB.
- **No pruned-composer dependency.** Everything rides flat-pin `RecipeSpec` + `generate._index` pipeline + `/api/agent` services, per the substrate constraint.

---

## 7. Test plan

**Unit / contract (`apps/web/app/__tests__/`)**
- `sidekick-hmac.test.ts` — valid sig passes; tampered body / missing header → 401 (mirror any existing flow-action HMAC test).
- `sidekick-contract.test.ts` — `SidekickInvokeSchema` + each `ToolInputSchemas[*]`: happy path, missing required, out-of-range `days`, extra props rejected.
- `sidekick-tools-json-parity.test.ts` — parse `extensions/superapp-sidekick/tools.json` and assert every tool `name` ∈ `SidekickToolName` and required-props match `ToolInputSchemas` (prevents declaration/enforcement drift — the classic Sidekick footgun).
- `sidekick-dispatcher.test.ts` (mocked services) — routing table hits the right handler; unknown shop → 404; invalid input → 400.
- `staged-action.test.ts` — stage writes row with `stagedSpec`+`expiresAt`; confirm on STAGED executes and flips to EXECUTED; confirm on EXPIRED/EXECUTED rejected; TTL boundary.
- `module-performance.test.ts` — aggregation math over fixture `moduleMetricsDaily` rows; `available:false` when none.

**Integration**
- `sidekick-create-roundtrip.test.ts` — stage_create (mock `generateModuleOptions`) → row STAGED with preview → confirm → `ModuleService.createDraft` called once; second confirm is idempotent (no double create).
- `sidekick-publish-roundtrip.test.ts` — stage_publish blocked by plan → card shows `reasons` (assert `validateBeforePublish`/`PublishPolicyService` invoked); allowed path → confirm → `publishModule` orchestrator called with correct `target`; theme module without themeId → `needs:themeId`.
- `agent-publish-wrapper-parity.test.ts` — after the orchestrator refactor, `POST /api/agent/modules/:id/publish` returns the same JSON shape as before (guards §6).

**Manual / CLI**
- `shopify app config validate` (or `deploy --dry-run`) accepts `[extensions_summary]` + the `sidekick` extension + `tools.json` — **this is the first real gate** (validates DECISION #1 field names). If it rejects, regenerate via `shopify app generate extension` and reconcile.
- Deploy to a dev store, open Sidekick, ask "what modules do I have" (data), "how is X performing" (data), "add a countdown banner" (stage_create → confirm card), confirm → module appears as DRAFT in `/modules`.

---

## 8. Risks + decisions the human must make

**DECISION #1 (blocking, do first): confirm the live Sidekick-extension contract.** The exact toml (`type = "sidekick"`, `tools = "tools.json"`, top-level `extensions_summary`), the **signing scheme** of the runtime callback (shared-secret HMAC like Flow vs OAuth token), the **payload field names** (`tool`/`shop_domain`/`confirmed`/`staged_action_id`), and whether confirmation cards render HTML previews or text-only — all are taken from the research doc + Flow analogy and **must be verified** against `shopify.dev/docs/apps/build/sidekick` and, authoritatively, `shopify app generate extension` output at build time. The design is structured so only three small seams change if reality differs: the toml field names, `verifySidekickHmac`, and `SidekickInvokeSchema`. Everything downstream (dispatcher, staging, service reuse) is contract-independent.

**DECISION #2 (biggest engineering risk): how publish executes without a merchant session.** Recommended is the offline-token admin client + a `publish-orchestrator.server.ts` refactor lifted from `api.agent.modules.$moduleId.publish.tsx` (synchronous, best UX). Fallback is enqueuing a `Job{type:PUBLISH, source:'sidekick'}` for the existing worker (async, zero new auth surface, but no in-conversation success confirmation). This determines whether the publish route gets refactored into an orchestrator; do it once and both the agent route and Sidekick share it. **If unsure, ship the Job-enqueue fallback first** (fully real today — the model and worker exist) and mark the synchronous offline-admin orchestrator as a fast-follow, rather than block M12 on the refactor.

**Other risks**
- **Declaration/enforcement drift** — mitigated by `sidekick-tools-json-parity.test.ts`.
- **runtime_url staleness** — same Cloudflare-tunnel footgun as the flow extensions (`superapp-flow-action-send-http/shopify.extension.toml` warns about it). Point at a stable prod host, not the dev tunnel, before submitting.
- **Multi-option selection** — Sidekick create picks `options[0]`; letting the merchant choose among 3 inside a card is a **follow-up**, not M12.
- **Metrics honesty** — `get_module_performance` must report `available:false` where ingestion isn't wired, never fabricate zeros as success.
- **Approval/review** — Sidekick app extensions are subject to Shopify review; the `extensions_summary` copy and tool descriptions are merchant-facing and reviewed. Keep them accurate and scoped.

---

## Appendix — why this is small

The heavy lifting (classify→generate, spec validation, plan gating, pre-publish validation, publish + progressive canary, module list, metaobject config, preview render) is **already built and tested** behind `/api/agent/*` and the module/publish services. M12 adds a **declaration** (what Sidekick can call), a **verified front door** (HMAC route), a **confirmation gate** (staged-action table), and **two small reads** (list scope + performance aggregation). The named surface is new; the machinery is entirely reused.
