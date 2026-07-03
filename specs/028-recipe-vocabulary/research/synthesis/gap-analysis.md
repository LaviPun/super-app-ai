# Honest Gap Analysis — Target Vocabulary MINUS Verified Reality

**Phase 28 · Synthesis artifact #3.** This reconciles what the market demands
(the 58 plugin records, the surface matrix, the design vocabulary) and what
Shopify's platform now offers (Spring '26 Editions) against what the codebase
*actually runs on the default production path* (the eight code-evidenced reality
audits in `research/reality/`, freshly re-audited at HEAD `4f056da` on
`feat/027-unified-builder`, 2026-07-03).

The equation this document computes:

```
GAP  =  target-vocabulary (market + design study + Spring-26 platform)
        − verified-current-state (reality audits, live-path only)
```

**Ground rule inherited from the audits:** a capability counts as "we have it"
only if it is **wired on the live path** — not "a file/type/flag exists,"
not "built-not-wired behind a default-off flag," not "a paper spec in a doc."
The audits are unanimous that this repo has a large **built-not-wired** layer
(control-pack composer, DAG flow engine, blueprint co-deploy, five of six
hydrate outputs, the `v2` module-system flag) that the docs narrate as if live.
Treating those as "done" is the single biggest way this analysis could lie, so
they are all scored **MISSING (or dormant)**, not "exists."

**Quality bar (owner directive).** Whatever the system generates must be
**top-notch on BOTH UI and function — at least at parity with the studied apps**
(Rebuy, Justuno, GemPages, Fast Bundle, Kaching, …). Merchants then extend via
*generate settings*. So the roadmap is framed around **parity-or-better as the
baseline, not a stretch goal**: every tier below asks "does this reach the
studied app's ceiling?" and the token/rule/discount work exists because *without
it we are visibly below parity*, not merely "missing a nice-to-have."

Legend for each item: **[EXT]** = external evidence (a plugin record);
**[INT]** = internal code evidence (`file:line`); **wired** state uses the
audits' vocabulary (`live | built-not-wired | stub | absent`).

---

## 0. Closed by the 027 builder work (what the recent commits actually FIXED)

Verified against the freshly re-audited reality (HEAD `4f056da`). These items
**move out of** the MISSING / PRUNE lists below. The 027 series was mostly a
builder/preview/eligibility campaign; its concrete, code-confirmed wins are:

| Closed | What changed | Audit evidence (file:line) |
|---|---|---|
| **`admin.discountUi` type added (21st type)** | New discriminated-union variant + registry row + allowed-values entry; honestly gated `needs_runtime`. | `extension-eligibility.md:28` (registry `extension-eligibility.ts:191-197`; schema `recipe.ts:357-380`; `allowed-values.ts:530-559` = 21 entries). |
| **`admin.discountUi` compiler `default: never` hazard → FIXED** | Compiler now has an **explicit `case 'admin.discountUi'`** (bare-AUDIT group), closing the prior "un-gated direct callers get the spec cast to CompileResult" hazard. | `extension-eligibility.md:29,108-119` (`compiler/index.ts:55-58`). |
| **Config-driven settings for non-storefront modules** | A real, always-on settings form (`NonStorefrontSettingsForm` / `GenConfigControls`) now renders scalar config for non-storefront types straight off `recipe.config`. | `module-system-version.md:22` (NEW-A; `generate._index.tsx:1086-1130,1134-1135`); `control-packs.md:26` (N1). |
| **Real module rendered in the /generate preview** | Builder canvas POSTs the merged recipe to `/api/preview` and renders **real deterministic `PreviewService` output** in a sandboxed iframe (was a hardcoded CSS mock). Includes a new deterministic `discountUiSurfacePreview`. | `hydrate-outputs.md:26` (strengthened); `interactive-widget-runtime.md:24`; `preview.service.ts:647-687`. |
| **Streaming generation path** | New `api.ai.create-module.stream` SSE route is now the primary builder call site (batch `create-module` is the fallback); blueprint generation fires from both. | `blueprints.md:30` (N1); `generate._index.tsx:459,499`. |
| **Dead `republishDiff` loader compute removed** | The prior audit's "stale doc line / dead loader compute" note is resolved by deletion. | `hydrate-outputs.md:34` (N2); `modules.$moduleId.tsx` −25 lines. |
| **`mustHaveControls` correctness refinement** | Now maps pack ids → **config namespaces** via `getPack(id)?.namespace` (matching spec `config` keys) instead of raw manifest ids. | `control-packs.md:17` (finding #4; `requirement-spec.server.ts:35-41`). |
| **Type count is now honest (21, not "20")** | Registry / schema / audit test all encode 21 types, 18 `runtimeShipped` (`21 − 3 needs_runtime`). | `extension-eligibility.md:30,41-48`. |
| **Paused-flow guard on targeted runs** | `runFlowById` now throws unless `status === 'PUBLISHED'`, aligning "Run now" with the fan-out's PUBLISHED-only contract. | `flow-automation.md:31` (N2; `flow-runner.service.ts:154`). |

**Explicitly NOT closed by 027 (do not mistake for fixed):**
- The `'pass'` vs `'PASS'` **validation-report casing bug** is **still open,
  verbatim** — every check still paints red (`hydrate-outputs.md:23`,
  `modules.$moduleId.tsx:617-618`).
- The **false-published bug** (checkout.block / postPurchase.offer /
  integration.httpSync / platform.extensionBlueprint marked `deployable`, hit
  bare-AUDIT, write nothing, still flip PUBLISHED) is **still open** for all four
  types; only the *unrelated* `admin.discountUi` compiler case was added
  (`extension-eligibility.md:37,140-141,147-149`).
- `adminConfigSchemaJson` rendering **regressed**: `ConfigEditor`/`StyleBuilder`
  are now imported-but-never-mounted, and the live builder reads `recipe.config`
  directly, so the hydrate envelope's admin config is generated-and-dropped
  (`control-packs.md:18-19`, `hydrate-outputs.md:24`).

---

## 1. What is MISSING — market/platform capability our vocabulary cannot express (ranked by leverage)

Ranked by leverage = (breadth of market demand) × (how much it unlocks "generate
a full plugin at parity") × (how cheaply it plugs onto a *real* seam we have).
"Parity" here means: the studied app can express it and we cannot.

### M1 — A rule-builder primitive `{object, attribute, operator, value}` — **highest leverage, hard parity gap**
- **Gap:** The recipe has *no* vocabulary for a merchant-authored condition. The
  single highest-recurrence target-vocabulary shape in the corpus is an ordered
  list of condition rows combined AND/OR, evaluated top-to-bottom. Without it we
  are categorically below every studied targeting/upsell/discount app.
- **[EXT]** Rebuy Data Sources (`plugins/rebuy.md:32-36`: `rule = {IF: condition[], logic, RETURN, exit_if_matched}`, `condition = {object, attribute, operator, value}`); Justuno 80+ conditions + Workflow engine (`plugins/justuno.md:34-37`); Intuitive Shipping 40+ conditions; ReConvert first-match funnels. ~25 records at depth (`settings-vocabulary.md:274-291`, pack #14).
- **[INT]** `packages/core/src/recipe.ts:120-166` — the `theme.section` config is flat `title/subtitle/kind/blocks[]` fields with an open `.catchall`; no condition-row type. No `rule-builder` field type in `control-packs/types.ts` (re-confirmed unchanged at HEAD, `control-packs.md:14-24`).
- **Why #1:** unlocks upsell targeting, discount conditions, shipping conditions, popup targeting, search merchandising, and intra-widget show/hide — the bulk of "express a full plugin." Nothing else has this fan-out. **Spring-26 amplifies it:** the new Collections API (variant-level conditions + exclusion rules, `shopify-editions-spring-2026.md:53`) is a native targeting substrate this primitive should compile toward.

### M2 — Discount / pricing family (`discount`, `tiers`, `bogo`, `gift`, `mechanism`)
- **Gap:** Zero pricing vocabulary. The atomic discount primitive
  (type/value/min/combinable) and its four relatives are P0/P1 across
  bundles/upsell/discounts/loyalty/cart and have **no pack today**.
- **[EXT]** `settings-vocabulary.md:357-409` packs #20–24; ~35 records reference a discount type. Kaching/Fast Bundle/Discount Ninja volume tiers; Bold BOGO; slide-cart/Candy Rack GWP.
- **[INT]** No pricing pack in `packages/core/src/control-packs/packs/`. The *enforcement* side is real — `functions.discountRules`/`functions.cartTransform` compile and publish real metaobjects (`extension-eligibility.md:132-133`, rows 3-4 `already-executed`) — but there is **no merchant-facing discount vocabulary** feeding them.
- **Why high:** the runtime to enforce discounts is real and shipped; the *vocabulary* to author them is missing — a wired runtime with no words. **Spring-26 expands the target:** BXGY prerequisites in product discount functions and stacking multiple product discounts (`shopify-editions-spring-2026.md:27,77` #32,195) mean the pricing pack should model prerequisites + stacking to hit parity with Fast Bundle / BOGO.

### M3 — `recommendation.source` strategy select
- **Gap:** No vocabulary for "how are the offered/recommended products chosen."
- **[EXT]** `settings-vocabulary.md:411-426` pack #25; Rebuy endpoints (`plugins/rebuy.md:36`: Recommended/Similar/Top-Sellers/Trending/Buy-It-Again/Recently-Viewed/Custom); ReConvert, Selleasy, Candy Rack, upcart. ~18 records.
- **[INT]** No recommendation field in `recipe.ts`; blueprint catalog resolves upsell intents to a fixed 2-entry composite only (`blueprints.md:18`, `blueprint-catalog.ts:41-90`).
- **Why high:** the other half (with M1) of "express a full upsell/cross-sell plugin," the largest market category.

### M4 — Style-token depth (the #1-pain lever; parity-or-better on UI)
- **Gap:** `StorefrontStyle` is a **coarse-enum** system, not a token system. It exposes `padding: small|medium|large`, `radius: md`, `shadow: none|…`, and a 5-color object — exactly the "styling is thin / CSS-only / can't vary per page" complaint the corpus names most. This is the clearest place we render *below parity* on pure UI polish.
- **[EXT]** GemPages/PageFly full token systems: ≤15-color palette, H1–H6 + 3 paragraph typography presets, 10 responsive spacing tokens, shadow(color+blur+spread+offset), corner-radius S/M/L (`plugins/gempages.md:34,58-64,105`). `design-vocabulary.md:13-131` formalizes the OKLCH 12-step ramp, `-content` pairing, two-track radius, four elevation idioms, motion tokens.
- **[INT]** `packages/core/src/storefront-style.ts:34-96` — `spacing`/`typography`/`colors`/`shape` are 3–7 coarse enums each; `colors` is 5 flat hexes — no palette scale, type scale, shadow idioms, or motion tokens.
- **Why high, not #1:** the *seam* is real (6 style packs at `style-packs.server.ts:72`, `StyleBuilder`, `--sa-*` compiler — `design-vocabulary.md:230-260`), so this is "widen enums + wire the design tokens," not new infra. **Spring-26 gift:** native **theme color palettes** (`shopify-editions-spring-2026.md:47` #215) give a store-native palette to match against — feed it into the token system so generated modules inherit the merchant's theme colors by default.

### M5 — Messaging surface (email / SMS / web-push) — **the biggest surface hole**
- **Gap:** The single most common *action* in the corpus (fan-out messaging) has **no extension-type slot**. It is routed through `flow.automation` as a proxy — a poor fit *and* itself only reachable via the linear runner.
- **[EXT]** `surface-matrix.md:149` — Klaviyo, Omnisend, Privy, PushOwl, Appikon back-in-stock, subscription dunning; bold-upsell flags this explicitly. **Spring-26:** WhatsApp marketing channel + SMS/marketing automations + consent APIs (`shopify-editions-spring-2026.md:83` #68,69,76) are now native channels a messaging module could target.
- **[INT]** No messaging type in `RECIPE_SPEC_TYPES` (the 21 types, `extension-eligibility.md:123-125`). Email/slack *connectors* exist only as linear `FlowRunnerService` step kinds `SEND_EMAIL_NOTIFICATION`/`SEND_SLACK_MESSAGE` (`flow-automation.md:84`), not a first-class module.
- **Why high:** load-bearing for loyalty, subscription, popup/email, and back-in-stock archetypes.

### M6 — Durable background scheduler
- **Gap:** Timed/cron automation (subscription dunning, prepaid orders, loyalty expiry, review sequences, back-in-stock fan-out) requires a durable scheduler. The nearest type is `flow.automation` (Shopify Flow event-hooks, not a scheduler) — and the DAG engine that *would* provide durable-wait is entirely unwired.
- **[EXT]** `surface-matrix.md:150`; subscriptions composite (`surface-matrix.md:92-97`).
- **[INT]** `flow-automation.md:19` — `resumeDueWorkflowRuns` is a **code comment, not a function** (`workflow-engine.service.ts:426`); `api.cron.tsx` has no resume sweep; parked waits never auto-resume.
- **Why high:** the composites (subscriptions esp.) *require* it; unbuilt code stands in for it today.

### M7 — Interactive / stateful widget runtime (spin-to-win, scratchcard, multi-frame)
- **Gap:** The storefront runtime is a hard six-kind allowlist + popup engine; it cannot render a spinning wheel, per-segment odds, or a discount-code pool. **The 027 preview work made this downgrade *visible* (real recipe now rendered) but did not fix it** — a "spin the wheel" prompt truthfully renders a static popup.
- **[EXT]** Gamified promo is a recognized category; dossier §H specs it. Justuno lists `game` as a promotion type (`plugins/justuno.md:32`).
- **[INT]** `interactive-widget-runtime.md:16` — repo-wide grep for `spinToWin|scratchcard|wheel|probability|codePool` = **zero runtime symbols** (re-confirmed at HEAD); `recipe.ts:122` `kind` is free-form with no probability/pool field; `superapp-modules.js` does exactly two things (popup engine + contact-form POST). **The intent classifier still accepts "spin the wheel" and silently downgrades to a static popup** (`interactive-widget-runtime.md:80`, Claim 7).
- **Why medium:** high-wow but narrower demand than rules/discounts/style; DESIGN.md §H already honestly labels it a platform gap. **Spring-26 enabler:** "standard storefront events and actions" (`shopify-editions-spring-2026.md:48` #211) is the native event system a stateful widget runtime should sit on.

### M8 — Typed data-model provisioning (schema writer)
- **Gap:** Modules that persist first-party entities (reviews DB, subscriber lists, wishlists, loyalty ledgers) need a typed schema. The validation machinery is fully built but a **permanent no-op** because nothing ever writes `DataStore.schemaJson`.
- **[EXT]** `settings-vocabulary.md:671-680` pack #45; ~15 records persist state.
- **[INT]** `backend-data-layer.md:12` — `ensureTypedStore` (the only `schemaJson` writer, `data-store.service.ts:109-143`) has **zero non-test callers**; `parseDataModel(null)→null→validateRecord` is a guaranteed no-op; two runtime paths auto-create stores but always **untyped** (`backend-data-layer.md:20`). `provisionFromModuleSpec` **does not exist** (grep=0) — the stale memory claiming publish-time typed provisioning is **false** at HEAD.
- **Why medium:** the whole CRUD/export/capture layer around it is already live (see EXISTS); only the schema writer is missing — a *wire-up*, not a build. **Spring-26 tailwind:** streamlined Metaobjects API + declarative metaobjects without scopes (`shopify-editions-spring-2026.md:52` #173,177) make the typed-config substrate cheaper.

### M9 — Per-type enums (`layout`, `optionType`, `widgetKind`) supplied by the module type
- **Gap:** The same field recurs everywhere with a *type-specific* option set, but the vocabulary has no way for a pack to declare a field whose enum is supplied by the module type.
- **[EXT]** `settings-vocabulary.md:162-173,788` pack #5 (`style.layout-archetype`).
- **[INT]** `control-packs/types.ts` field types are fixed widget hints; no per-type enum indirection. Only `theme.section` has a manifest (`module-system-version.md:17`, `module-manifests.ts:13-20`).
- **Why medium:** the *architectural* enabler for the composable per-type vocabulary this phase targets; delivers value only once M1/M2/M4 give it fields to carry.

### M10 — CarrierService rate provider (shipping)
- **Gap:** Intuitive-shipping's entire product is a carrier-calculated rate endpoint. `functions.deliveryCustomization` only renames/reorders/hides — the wrong mechanism. No type models "compute and return shipping rates."
- **[EXT]** `surface-matrix.md:54-57,148`.
- **[INT]** No such type in the 21 (`extension-eligibility.md:123-125`).
- **Why low:** single-category (2 records), self-contained; correct to park.

### M11 — AI generation grounding + validation gate (NEW — Spring-26 AI leverage) ⭐
- **Gap:** Generation is still constrained by the model's hand-authored knowledge of Shopify's API — the exact problem that launched phase 028 ("vocabulary limited by my knowledge → shallow/wrong output"). We do **not** ground prompts in, or validate output against, the live Shopify API surface.
- **[EXT]** Shopify **Dev MCP** — token-optimized, all API versions, doc chunks + code validation (`shopify-editions-spring-2026.md:61` #186,187; `ai-leverage.md:29-36`). Already connected in our tooling (`shopify-dev-mcp`: `learn_shopify_api`, `search_docs_chunks`, `validate_graphql_codeblocks`, `validate_theme`, `validate_component_codeblocks`).
- **[INT]** The compiler gate today is Zod + design-QA only — no live-API validation. Generation prompt is compiled in `apps/web/app/services/ai/` with no MCP grounding call (`ai-leverage.md:33-34`); the deterministic compiler (`apps/web/app/services/recipes/compiler/index.ts`) has no `validate_*` step.
- **Why high:** this is the **direct lever on the quality bar** — turns "constrained by hand-authored knowledge" into "constrained by the actual, current Shopify API," which is the correct ceiling for parity-or-better *function*. Cheap to wire (MCP already available), highest quality payoff (`ai-leverage.md:74`).

### M12 — Sidekick App Extension for the SuperApp (NEW — Spring-26 distribution) ⭐
- **Gap:** Our app is a Shopify app but exposes **nothing** to Sidekick, Shopify's native merchant AI front door. **Every top plugin we're studying (Klaviyo, Loop, Smile, Judge.me, Yotpo) already shipped one** — so for an *AI module generator* this is now a parity/table-stakes gap on distribution, not a stretch.
- **[EXT]** Sidekick App Extensions (`shopify-editions-spring-2026.md:74` #12; `ai-leverage.md:48-57`): data extension (read-only "how are my modules performing?") + action extension (staged, merchant-confirmed "add a spin-to-win popup that matches my brand" → routes into our generator).
- **[INT]** No `tools` field / Sidekick extension in `shopify.app.toml` or `extensions/` (grep=0; `ai-leverage.md:55`). No `extensions_summary` for Sidekick routing.
- **Why high:** our differentiator *is* AI generation, and Sidekick is where merchants now ask for it. Likely its own sibling spec (029), but it belongs on the roadmap as a first-class item (`ai-leverage.md:75`).

### M13 — Agentic-commerce target surface (NEW — Spring-26 strategic, phase-later)
- **Gap:** Our `extension-eligibility` model has **no "agentic/AI-channel" surface** — a whole new channel class Shopify just shipped (UCP + Catalog/Cart/Checkout MCPs). Modules that optimize a merchant's catalog for AI channels (structured data, compliance disclosures, syndication) are a new module *category* we cannot express.
- **[EXT]** UCP + Catalog API + Checkout MCPs (`shopify-editions-spring-2026.md:16-22`, items #2-11; `ai-leverage.md:59-62`).
- **[INT]** All 21 types are storefront/admin/checkout/POS surfaces (`extension-eligibility.md:123-150`); no product-data-syndication or MCP-endpoint surface.
- **Why medium/deferred:** strategic and higher-effort; a phase #4 decision — "add an agentic surface or explicitly scope it out with a reason" (`shopify-editions-spring-2026.md:106`).

**Cross-cutting modifiers also missing** (envelopes, not leaf packs — `settings-vocabulary.md:798`): `experiment.ab` (now natively backed by Rollouts, `shopify-editions-spring-2026.md:49` #24), `content.i18n`, `responsive` per-breakpoint, `accessibility`. Model as pack modifiers when M1/M4 land.

---

## 2. What ALREADY EXISTS and works — do NOT rebuild

Verified `live` / `already-executed` on the merchant path by the re-audits at HEAD `4f056da`.

| Capability | Evidence (audit + code) | Note |
|---|---|---|
| **13 of 21 extension types deploy for real** | `extension-eligibility.md:152` — #1-8,10,13,14,17,21 write real metaobjects/functions on publish. | The core deploy fleet is genuinely wired. |
| **theme.section + proxy.widget render pipeline** | `extension-eligibility.md:130-131`; `interactive-widget-runtime.md:36-40` (Liquid → snippet → `superapp-modules.js`). | The universal, highest-leverage surface — real. |
| **Real wasm Functions: discountRules, cartTransform, delivery/payment/validation/fulfillment** | `extension-eligibility.md:132-137,207-210` — 6 shipped wasm handles → `FUNCTION_CONFIG_UPSERT` metaobjects. | The *enforcement* engine the market fakes with draft-orders — our differentiation, real. |
| **checkout.upsell, customerAccount.blocks, analytics.pixel (web pixel), admin.block/action, pos.extension** | `extension-eligibility.md:139-150`. | pos.extension works via a DB-read path, not the compiler (`:145`) — works, just attribute it correctly. |
| **Deterministic PreviewService (now the /generate canvas too)** | `hydrate-outputs.md:26,84`; `preview.service.ts`. | The real, working preview; 027 wired it into the builder iframe. No AI preview HTML — do not resurrect `previewHtmlJson`. |
| **Config-driven settings form for non-storefront types** | `module-system-version.md:22`; `generate._index.tsx:1086-1130`. | **NEW (027).** Real always-on scalar form off `recipe.config`; ignores the v2 flag (that's fine). Extend, don't rebuild. |
| **DataStore CRUD + record grid + CSV export + browser print-to-PDF + DataCapture ingestion + captures admin view** | `backend-data-layer.md:13,42` — all live and reachable. | Docs are *pessimistic* here; do not rebuild export/capture. |
| **Blueprint generation half (plan→classify→fan-out→persist→UI), now from 2 routes** | `blueprints.md:35-37` — wired end-to-end behind `BLUEPRINTS_ENABLED`; streaming + batch fallback. | The *generation* stack is real; only co-deploy is a facade (PRUNE). Flag is false everywhere → dark in prod. |
| **Live linear FlowRunnerService** | `flow-automation.md:17,45` — webhooks + cron + run-now, real Email/Slack, per-step retry, atomic cron claim; now paused-flow-guarded. | The linear runner *works*; the DAG engine is vapor. |
| **requirement-spec `mustHaveControls` namespace list** | `control-packs.md:17` — live on create-module, feeds template grounding; now returns pack namespaces. | Low-value (`theme.section` only) but genuinely live. Keep. |
| **Eligibility registry + `needs_runtime` gate** | `extension-eligibility.md:52-68,188-205` — real, load-bearing; honestly blocks orderRouting + discountUi + (via gate) flow. | Keep; fix the stale booleans (PRUNE P5). |
| **Six style packs + StyleBuilder + `--sa-*` compiler + scoped Custom-CSS sanitizer** | `design-vocabulary.md:230-260`; `style-packs.server.ts:72`. | The style *plumbing* is real; it carries thin values (M4). Extend, don't rebuild. |
| **`admin.discountUi` type + gate + deterministic preview** | `extension-eligibility.md:28-29,144`; `preview.service.ts:647-687`. | **NEW (027).** Honestly `needs_runtime`; wire a real compiler only when the discount-details extension ships. |

---

## 3. What to PRUNE — aspirational / dead code and doc claims not on the live path

Ordered by how load-bearing the false claim is. (Re-verified at HEAD; the 027
series closed none of these except where noted in §0.)

| # | Prune target | Evidence | Recommended action |
|---|---|---|---|
| P1 | **`composeBlueprint(moduleTypes)` API** — cited as "turns any set of module types into a coordinated blueprint" | `blueprints.md:18,43-46` — grep = **zero hits**; reality is a hardcoded 2-entry catalog. | Purge the name from all prose; describe the real 2-row catalog. |
| P2 | **DAG flow engine "reliability layer"** — `FLOW_ENGINE_V2`, `resumeDueWorkflowRuns`, generic `topicToTrigger` webhook dispatch, `DeadLetterService`, `recordAdminThrottle`, §9b "Waiting (parked) tile" | `flow-automation.md:18-25,48-80` — `FLOW_ENGINE_V2`=0 hits, resume is a comment, `/webhooks` hardcodes 2 topics, DLQ + rate-limit tables permanently empty, the parked tile does not exist. | Reconcile `docs/flow-automation.md` §9a/§9b/§9c with its honest §8 note; then decide per-primitive wire-up vs delete. **Reassess vs leaning on Shopify Flow** — Spring-26 Flow gained code editor + ShopifyQL/Admin-API + version history (`shopify-editions-spring-2026.md:57`), the exact DAG-adjacent ergonomics this doc claimed. |
| P3 | **`previewHtmlJson`** — "prefer AI-generated preview HTML" | `hydrate-outputs.md:78-85` — never generated (removed from prompt), never rendered on any path; 027 preview work uses deterministic `PreviewService`. | Prune the field, its loader read, and the two null-writes; document preview as deterministic-only. |
| P4 | **`publishBlueprint` co-deploy + `injectResolvedBundle`** | `blueprints.md:24,27,69-83` — `publishBlueprint` has **zero callers**; `injectResolvedBundle` test-only → bundles deploy with placeholder GIDs. | Wire-up (a "Publish all N" action) OR honestly de-scope; fix the optimistic comment. |
| P5 | **False-published set: `checkout.block` / `postPurchase.offer` / `integration.httpSync` / `platform.extensionBlueprint`** — a real bug | `extension-eligibility.md:22-25,140-149` — marked `deployable`, hit bare-AUDIT fallthrough, write nothing, still flip PUBLISHED. Orphaned `compileCheckoutBlock`/`compilePostPurchaseOffer` are dead code. | **Wire-up** the orphaned compiler cases (small, local); add an audit assertion "deployable ⇒ compiler emits non-AUDIT op/payload" (the seam is un-tested, `extension-eligibility.md:33`). Spring-26 "metaobject data in checkout functions" (`shopify-editions-spring-2026.md:25`) is first-class support for exactly this write pattern. |
| P6 | **`moduleSystemVersion` v2 flag** — "v2 renders settings from control packs" | `module-system-version.md:14-18` — computes `v2Form`, consumed by nothing; generation never reads the flag; `?engine=v2` doesn't exist; only 1 manifest; no A/B; `ConfigEditor`/`StyleBuilder` now fully unmounted. | Either finish wire-up (mount `ConfigEditor` with `v2Form`) or **prune the flag + dead branch**; correct docs that call it an active switch. |
| P7 | **Control-pack "single source of truth" claim** — "one pack schema derives the recipe schema, LLM JSON Schema, prompt, and admin form" | `control-packs.md:14-24` — only 3/10 packs hand-pinned into `RecipeSpecSchema`; `composeConfig` has no production caller; JSON Schema built from `RecipeSpecSchema` with no pack imports; `presets.ts`/`getPresetsForType` no callers. | Downgrade the doc to "built-not-wired behind a default-off flag"; the live builder reads `recipe.config` scalars directly. |
| P8 | **`SuperAppConnector`** dead code + false "typed provisioning" memory | `backend-data-layer.md:14,16` — class never registered in `connectors/index.ts`; `provisionFromModuleSpec` does not exist. | Register the connector OR prune; **correct the memory line** asserting publish-time typed provisioning (it's false). |
| P9 | **Dossier §H Spin-to-Win services** (`RouletteCampaignService`, `SpinService`, `CodeIssuanceService`, …) | `interactive-widget-runtime.md:63-76` — **zero** corresponding code; a paper spec. | Keep as an honest "to-build" spec; **trim the spin/scratch intent examples** (`intent-examples.ts:37-38`) so the classifier stops implying a capability that renders as a static popup. |
| P10 | **`themeEditorSettingsJson`, `uiTokensJson`, `implementationPlanJson`** (persisted-but-inert; last two lossy on version copy) | `hydrate-outputs.md:88-116` — no render/consume path; `implementationPlanJson`+`previewHtmlJson` dropped on version copy; `internal.stores` over-fetches all six blobs. | Prune or wire; at minimum document as inert. |

---

## 4. DOC CORRECTIONS needed (concrete list lives in `re-planned-docs.md`)

Summary of the doc-reality deltas the re-audits surfaced. Full edit list in the
companion file.

1. **Flow engine** (`docs/flow-automation.md`): reconcile §9a/§9b/§9c with the honest §8 note — DAG engine, `FLOW_ENGINE_V2`, cron resume, generic webhook dispatch, DLQ, rate-limit tracking, and the "Waiting (parked) tile" are all **not on the live path**. Live = linear `FlowRunnerService` (now paused-guarded). Note the webhook route *consolidation* (deleted lifecycle routes inlined into `webhooks.tsx`), not new dispatch.
2. **Control-packs** (`docs/module-system-v2.md`): "single source of truth / everything derived" → "3/10 packs hand-pinned; composer built-not-wired behind default-off `v2`; `ConfigEditor`/`StyleBuilder` now unmounted; live editing is `generate._index.tsx` reading `recipe.config`."
3. **Interactive widgets** (`DESIGN.md` §H): keep the honest gap; **trim `intent-examples.ts:37-38`** so spin/scratch prompts don't downgrade silently.
4. **Data export / capture** (`docs/module-system-v2.md`, `docs/data-models.md`): reverse the *pessimistic* lie — CSV export, browser print-to-PDF, DataCapture ingestion, captures admin view are **all live**; "PDF endpoint" → "browser Save-as-PDF from print HTML."
5. **Hydrate-never-rendered** (`docs/module-settings-modernization.md`): the "generate-but-never-render gap is closed" claim is **re-opened** — `ConfigEditor` imported but never mounted; fill-settings has no UI trigger; `adminConfigSchemaJson` generated-and-dropped; the `'pass'`/`'PASS'` casing bug is **unfixed**.
6. **moduleSystemVersion** (`docs/implementation-status.md`, `docs/module-system-v2.md`): "plumbing without payoff — setting v2 changes nothing observable; generation never reads it; `?engine=v2` does not exist; coverage is 1 type; the 027 config-driven settings arrived via a *separate* always-on branch."
7. **Blueprints** (`docs/blueprints.md`): purge `composeBlueprint`; note co-deploy (`publishBlueprint`) unshipped (zero callers); drop "additive data-model provisioning" from the blueprint story; point the migration reference at the baseline, not the archived filename; note the new streaming entry point.
8. **Extension count / eligibility** (`MEMORY.md`, `docs/extension-eligibility.md`): "20 types / 18 deploy" → **21 types** (`admin.discountUi` added); flag the false-published set and the *pessimistic* mislabel (flow.automation has a live runtime but is marked `needs_runtime`).
9. **Backend data** (`MEMORY.md`): **correct the false claim** of "additive data-model provisioning for single+complex modules" — `provisionFromModuleSpec` does not exist; no publish/blueprint path provisions typed stores; runtime auto-provisioning is untyped only.
10. **AI leverage / Spring-26** (new doc note): record that Dev MCP grounding+validation (M11) and a Sidekick App Extension (M12) are approved roadmap items, and that Spring-26 platform deltas (metaobject-in-checkout-functions, nested cart lines, App Home no-backend, theme palettes, Collections API, field-level webhooks) are folded into the tiers below.

---

## 5. Ranked ROADMAP — feeding downstream phases

Each item cites **[EXT]** (a plugin OR a Spring-26 platform capability) and
**[INT]** (`file:line`), states the downstream phase it feeds (#2 visuals/styling
· #3 compositional control-packs · #4 multi-surface composites/bundler), and
whether it is **BUILD**, **WIRE** (machinery exists), or **PRUNE/DOC**. The bar
for every item is **parity-or-better** with the studied apps.

### Tier 0 — Truth-in-docs + bugfixes (do first; cheap, unblocks trust)
- **R0.1 — Fix the false-published bug** (WIRE). Wire the orphaned `checkout.block` / `postPurchase.offer` compiler cases (and confirm `integration.httpSync` / `platform.extensionBlueprint` either write or gate); add the audit assertion "deployable ⇒ compiler emits a non-AUDIT op/payload." **[EXT]** upsell/post-purchase archetype (`surface-matrix.md:35`); Spring-26 metaobject-in-checkout-functions (`shopify-editions-spring-2026.md:25`). **[INT]** `extension-eligibility.md:140-149`; `compiler/index.ts:49-59`. Feeds **#4**.
- **R0.2 — Fix validation-report casing bug** (WIRE, one line). `modules.$moduleId.tsx:617-618` `'pass'`→`'PASS'`. **[INT]** `hydrate-outputs.md:23`. (Still open after 027.)
- **R0.3 — Reconcile the doc deltas** (DOC). Per `re-planned-docs.md` + §4 above, including the corrected §0 "closed" items and the false backend-provisioning memory. Feeds **all** phases (removes the built-not-wired mirage).

### Tier 1 — Phase #2 (visuals / styling) — reach UI parity-or-better
- **R1.1 — Widen `StorefrontStyle` from coarse enums to a token system** (BUILD on a real seam). OKLCH 12-step ramp + `-content` pairing, size-aware type scale, 9-step spacing, two-track radius + `scaling`, four elevation idioms, motion tokens. Ingest Spring-26 **native theme color palettes** so modules inherit the store palette. **[EXT]** GemPages/PageFly token systems (`plugins/gempages.md:34,105`); theme palettes (`shopify-editions-spring-2026.md:47` #215). **[INT]** `storefront-style.ts:34-96`. Feeds **#2**. Highest visual-quality leverage (M4).
- **R1.2 — Wire the design-vocabulary tokens into the six style packs** (WIRE). `design-vocabulary.md:244-256` maps each pack onto `style-packs.server.ts` + `--sa-*`; add the Tailark sub-mood dropdown. **[EXT]** `design-vocabulary.md` §4. **[INT]** `style-packs.server.ts:72`. Feeds **#2**.
- **R1.3 — Harden the scoped Custom-CSS sanitizer** (WIRE). Extend denylist (`position:fixed`, `expression()`, off-origin `url()`), keep root-scope. **[INT]** `style-compiler.ts` (`design-vocabulary.md:249-252`). Feeds **#2**.
- **R1.4 — Dev-MCP grounding + validation in generation** (WIRE — the quality gate) ⭐. Ground the prompt in live Shopify schemas/doc-chunks pre-generation; run generated GraphQL/Liquid/components through `validate_*` as a hard compiler gate alongside Zod + design-QA. This is the direct lever on the "top-notch function" bar. **[EXT]** Dev MCP (`shopify-editions-spring-2026.md:61` #186,187; `ai-leverage.md:29-36`). **[INT]** generation prompt in `services/ai/`; compiler `recipes/compiler/index.ts` (no validate step today). Feeds **#3** + quality of every generated module (M11). *Placed in Tier 1 because it raises the floor under everything downstream.*

### Tier 2 — Phase #3 (compositional control-packs) — reach FUNCTION parity
- **R2.1 — Build the rule-builder primitive** (BUILD — the flagship). `rule-builder` field type + `targeting.rule-engine` pack; `{object, attribute, operator, value}` rows + AND/OR + ordering; compile toward the Spring-26 **Collections API** (variant conditions + exclusions) where applicable. **[EXT]** Rebuy (`plugins/rebuy.md:32-36`), Justuno 80+ (`plugins/justuno.md:34`); Collections API (`shopify-editions-spring-2026.md:53` #216). **[INT]** `control-packs/types.ts` (no rule type); `recipe.ts:120-166`. Feeds **#3** + #4. Highest overall leverage (M1).
- **R2.2 — Build the discount/pricing packs** (BUILD, connects to a live runtime). `pricing.discount` + `tiers`/`bogo`/`gift`/`mechanism` + **prerequisites** + **stacking**; compile into the *already-shipped* `functions.discountRules`/`cartTransform`. **[EXT]** `settings-vocabulary.md:357-409`; Kaching/Discount Ninja; Spring-26 BXGY prerequisites + discount stacking (`shopify-editions-spring-2026.md:27,77` #32,195). **[INT]** no pricing pack; runtime at `extension-eligibility.md:132-133`. Feeds **#3** + **#4** (M2).
- **R2.3 — Build `recommendation.source`** (BUILD). Strategy select + per-strategy config. **[EXT]** `plugins/rebuy.md:36`. **[INT]** `blueprint-catalog.ts:41-90` (2 fixed composites). Feeds **#3** + **#4** (M3).
- **R2.4 — Resolve the composer: wire OR prune** (WIRE/PRUNE, decision). `composeConfig`→`SchemaForm` is tested but dark behind default-off `v2`, and its fronting components (`ConfigEditor`/`StyleBuilder`) are now unmounted. Either make packs the source of truth (mount `ConfigEditor` with `v2Form`, expand manifests beyond `theme.section`) or delete the flag + dead branch and standardize on the live `recipe.config` builder. **[INT]** `control-packs.md:18-19`, `module-system-version.md:14-18`. Feeds **#3** (the architecture the phase is named for — resolve, don't narrate).
- **R2.5 — Per-type enums** (BUILD, architectural enabler). Let a pack declare a field whose enum the module type supplies. **[EXT]** `settings-vocabulary.md:162-173`. **[INT]** `module-manifests.ts` (only `theme.section`). Feeds **#3** (M9).
- **R2.6 — Admin surface upgrade for `admin.block`/`admin.action`** (BUILD, Spring-26 unlock). Model "App Home without a backend" + admin UI discount-config extensions so generated admin modules get a real surface without provisioning a server. **[EXT]** App Home no-backend + discount config via admin UI extensions (`shopify-editions-spring-2026.md:34-35` #174,175,196). **[INT]** `admin.block`/`admin.action` already deploy real metaobjects (`extension-eligibility.md:142-143`) — this is vocabulary, not new runtime. Feeds **#3**.

### Tier 3 — Phase #4 (multi-surface composites / bundler) — reach COMPOSITE parity
- **R3.1 — Model composites as manifests over a shared record** (BUILD). The four irreducible composites (bundle, cart-drawer, loyalty ledger, subscription contract) = one authoritative record + N thin render surfaces + a checkout-time enforcement Function. **[EXT]** `surface-matrix.md:67-97`; `settings-vocabulary.md:754-759`. **[INT]** `module-manifests.ts` (right shape, one entry); blueprint generation stack real (`blueprints.md:35-37`). Feeds **#4**.
- **R3.2 — Wire blueprint co-deploy** (WIRE). "Publish all N" → `publishBlueprint`; wire `injectResolvedBundle` so bundle members deploy against live GIDs; leverage Spring-26 **nested cart lines** so add-on/BAP bundles flow through accelerated checkout, and **cart→order metafield carryover** so bundle identity threads to the order. **[EXT]** bundle archetype (`surface-matrix.md:76-80`); nested cart lines + `cartToOrderCopyable` (`shopify-editions-spring-2026.md:28-29` #176,208). **[INT]** `blueprints.md:69-83` (zero callers). Feeds **#4**.
- **R3.3 — Wire typed data-model provisioning** (WIRE). Call `ensureTypedStore` from module publish so `schemaJson` is set → typed forms + validation activate; route the two untyped auto-create paths through it. **[EXT]** `settings-vocabulary.md:671-680`; streamlined Metaobjects API (`shopify-editions-spring-2026.md:52` #173,177). **[INT]** `backend-data-layer.md:12,20` (writer has zero non-test callers). Feeds **#4** (M8) — the shared-record substrate composites need.
- **R3.4 — Messaging surface** (BUILD — biggest surface hole). A first-class email/SMS/push module type, not a `flow.automation` proxy; target Spring-26 native WhatsApp/SMS channels + consent APIs. **[EXT]** `surface-matrix.md:149`; WhatsApp/SMS (`shopify-editions-spring-2026.md:83` #68,69). **[INT]** no messaging type in the 21 (`extension-eligibility.md:123-125`). Feeds **#4** (M5).
- **R3.5 — Durable scheduler** (BUILD/WIRE). Either wire the built DAG engine's durable-wait (add `resumeDueWorkflowRuns` + cron sweep) or build a scheduler — but **first reassess build-vs-lean-on-Shopify-Flow** (Spring-26 Flow gained code editor + ShopifyQL/Admin-API + version history + automation tests). **[EXT]** `surface-matrix.md:150`, subscriptions (`surface-matrix.md:92-97`); Flow deltas (`shopify-editions-spring-2026.md:57`). **[INT]** `flow-automation.md:19` (resume is a comment). Feeds **#4** (M6).
- **R3.6 — Sidekick App Extension for the SuperApp** (BUILD — distribution parity) ⭐. Data extension (read-only module performance) + action extension (staged, merchant-confirmed generate/configure/publish) so our generator is AI-invocable from Shopify's native merchant AI. Likely its own sibling spec (029). **[EXT]** Sidekick App Extensions (`shopify-editions-spring-2026.md:74` #12; `ai-leverage.md:48-57`) — every studied competitor already shipped one. **[INT]** no `tools` field in `shopify.app.toml`/`extensions/` (`ai-leverage.md:55`). Feeds **#4** / a dedicated spec (M12).

### Tier 4 — deferred (lower leverage / narrow / strategic-later)
- **R4.1** Interactive/stateful widget runtime (spin-to-win) — BUILD from dossier §H, sitting on Spring-26 "standard storefront events and actions" (`shopify-editions-spring-2026.md:48` #211); **[EXT]** `plugins/justuno.md:32`; **[INT]** `interactive-widget-runtime.md:63-76`. (M7)
- **R4.2** CarrierService rate provider — BUILD, single-category; **[EXT]** `surface-matrix.md:148`. (M10)
- **R4.3** Agentic-commerce target surface (generate-for-AI-channel + optional agent profile) — DECISION for #4: add to extension-eligibility or scope out with a reason. **[EXT]** UCP + Catalog API (`shopify-editions-spring-2026.md:16-22`; `ai-leverage.md:59-62`). (M13)
- **R4.4** POS vocabulary upgrade — model Spring-26 camera/offline/localized/cash-management POS APIs (`shopify-editions-spring-2026.md:39` #202-205) to move `pos.extension` from "thin" to a real capability set.
- **R4.5** Cross-cutting modifiers (A/B via Rollouts, i18n, responsive, a11y) as pack envelopes once M1/M4 land — `settings-vocabulary.md:798`.
- **R4.6** Adopt AI Toolkit + deploy-safety (no-extension-deletion, app automation tokens, CLI semver) for our own dev/CI loop — compounding, low effort (`ai-leverage.md:38-42,76`).

---

## Executive summary (the biggest gaps)

- **027 closed real ground, but no headline bug.** It added `admin.discountUi` (21st type, honest gate, explicit compiler case closing the `default: never` hazard), shipped config-driven non-storefront settings, wired the **real deterministic preview** into the /generate builder, added a streaming generation path, and made the type count honest (`extension-eligibility.md:28-29`, `module-system-version.md:22`, `hydrate-outputs.md:26`). It did **not** fix the `'pass'`/`'PASS'` casing bug, the four-type false-published bug, or the hydrate-never-rendered regression — and it *regressed* control-pack rendering by unmounting `ConfigEditor`/`StyleBuilder`.
- **The rule-builder is still the #1 missing primitive — a hard parity gap.** A single `{object, attribute, operator, value}` condition-row type (Rebuy/Justuno) unlocks upsell targeting, discount conditions, shipping, popup targeting, and search — most of "generate a full plugin at parity." The recipe has *no* vocabulary for it, and Spring-26's Collections API is a native substrate to compile it toward. (`recipe.ts:120-166`.)
- **Discounts and recommendations remain whole missing families that a *live* runtime is waiting for.** `functions.discountRules`/`cartTransform` publish real metaobjects today; there is still no merchant-facing pricing/recommendation vocabulary — a wired runtime with no author-side words. Spring-26 BXGY prerequisites + discount stacking raise the parity target. (`extension-eligibility.md:132-133`; empty packs dir.)
- **Style is still a coarse-enum system, not a token system — the clearest below-parity UI gap.** `StorefrontStyle` exposes `padding: small|medium|large` + 5 flat hexes; GemPages/PageFly ship full token systems. The seam is real, so this is "widen + wire the design tokens," now feedable by Spring-26 native theme palettes. (`storefront-style.ts:34-96`.)
- **Two approved AI-leverage moves are first-class, not optional.** Dev-MCP grounding+validation (M11 / R1.4) is the direct lever on the "top-notch function" bar — it constrains generation to the *real current* Shopify API instead of model memory; and a Sidekick App Extension (M12 / R3.6) is now table-stakes distribution (every studied competitor shipped one). Both are cheap-to-medium and high-payoff. (`ai-leverage.md:29-36,48-57`.)
- **A large "built-not-wired" layer is still narrated as live and must be pruned or wired before planning against it.** The DAG flow engine, `composeBlueprint`, blueprint co-deploy, 5 of 6 hydrate outputs, the `v2` flag (now with unmounted components), and the false-published set are all dark on the default path; the two real surface holes behind them are **messaging** and a **durable scheduler**, both currently proxied by the unwired `flow.automation`. (`flow-automation.md`, `blueprints.md`, `hydrate-outputs.md`, `module-system-version.md`, `extension-eligibility.md`.)
