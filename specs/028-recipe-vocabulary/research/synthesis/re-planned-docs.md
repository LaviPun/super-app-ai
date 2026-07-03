# DOC-CORRECTION — Canonical docs vs. verified reality (re-planned)

**Phase 28 · Synthesis artifact #4.** Regenerated 2026-07-03 against the freshly
re-audited reality (`research/reality/*`, HEAD `4f056da`) and the **current** doc
text on disk. This list is scoped to corrections that are **STILL NEEDED** — the
user already edited `implementation-status.md`, `module-settings-modernization.md`,
`superapp-surface-inventory.md`, `shopify-dev-setup.md`, and `debug.md`, so
anything those edits already fixed is intentionally omitted. Each fix gives an
exact **BEFORE** block (copied verbatim from the current file so it string-matches)
and an exact **AFTER** block.

Ground truth used (from the reality audits):

- **21** RecipeSpec types (not 20); `admin.discountUi` is the 21st (`allowed-values.ts:530-559`).
- The **only** `needs_runtime` types are exactly three: `functions.orderRoutingLocationRule`, `flow.automation`, `admin.discountUi` (`module-deployability-audit.test.ts:33-41`; registry `runtimeShipped`).
- `checkout.block` / `postPurchase.offer` / `integration.httpSync` / `platform.extensionBlueprint` are marked `deployable` but hit the bare-AUDIT fallthrough and **write nothing** (false-published).
- `pos.extension` and `functions.fulfillmentConstraints` are genuinely `deployable`.
- Flow DAG engine, `FLOW_ENGINE_V2`, `resumeDueWorkflowRuns`, generic `topicToTrigger` webhook dispatch, `DeadLetterService`, `recordAdminThrottle`, "Waiting (parked)" tile: all **built-not-wired / absent** on the live path.
- `publishBlueprint` / `injectResolvedBundle` / `composeBlueprint`: zero real callers / does-not-exist.
- `moduleSystemVersion` v2: plumbing without payoff — generation never reads it, `?engine=v2` doesn't exist, `ConfigEditor`/`StyleBuilder` now unmounted, coverage is 1 manifest (`theme.section`).
- `adminConfigSchemaJson` is generated + persisted but **no longer rendered** (`ConfigEditor` imported, never mounted); the `'pass'`/`'PASS'` casing bug is unfixed; `computeRepublishDiff` was **deleted** from `modules.$moduleId.tsx`.
- Typed data-model provisioning is vapor: `provisionFromModuleSpec` does not exist; `ensureTypedStore` has zero non-test callers.

---

### /Users/lavipun/Work/ai-shopify-superapp/docs/flow-automation.md

The §8 status note (lines 138–143) is honest, but §9a/§9b/§9c and §10 still assert
built-not-wired primitives as live, and §10 states the wrong `needs_runtime` set.

**Fix 1 — §9a: the generic dispatcher / "subscribes every topic" claim is false; `/webhooks` hardcodes 2 topics.**

BEFORE:
```
1. **`shopify.app.toml`** subscribes every topic whose scope is granted (the always-on
   set) → all route to `/webhooks`. Validated with `shopify app config validate` (✅).
   Added commerce read-scopes: fulfillments, inventory, draft_orders, returns,
   fulfillment_orders (merchant/assigned/third-party), discounts, price_rules, locations.
2. **`/webhooks` generic dispatcher** (`routes/webhooks.tsx`): any incoming topic →
   `topicToTrigger()` → idempotency → `runForTrigger(trigger)`. Add a topic to the
   registry + toml and it fires — no new route.
```

AFTER:
```
> **Reality (2026-07 audit): NOT WIRED.** `shopify-webhook-topics.ts` exists in
> `packages/core`, but the live Remix `/webhooks` route does **not** use it. On the
> live path only two flow topics are wired.

1. **`shopify.app.toml`** subscribes a **fixed** set — `app/uninstalled`,
   `app/scopes_update`, `orders/create`, `products/update`, plus 3 GDPR compliance
   topics (`shopify.app.toml:15-41`) — **not** "every granted topic."
2. **`/webhooks`** (`routes/webhooks.tsx`) is a **hand-written switch over 4 topics**,
   not a generic dispatcher: it gates on `orders/create`/`products/update` →
   `runForTrigger`, and handles `app/uninstalled`/`app/scopes_update` inline as
   lifecycle. There is **no** `topicToTrigger()` call in `apps/web`. Adding a topic to
   the registry does **not** make it fire — you must edit the route.
```

**Fix 2 — §9b: the "Waiting (parked)" tile does not exist.**

BEFORE:
```
- **Flows hub** (`flows._index.tsx`): real trigger labels, real run counts (7d), a
  **Waiting (parked)** tile (durable-wait visibility), and a real success rate — all from
  `WorkflowRun`.
```

AFTER:
```
- **Flows hub** (`flows._index.tsx`): real trigger labels, real run counts (7d), and a
  real success rate — all from `WorkflowRun`. **There is no "Waiting (parked)" tile**
  (durable-wait park is engine-only and never surfaced); the hub buckets only
  `SUCCEEDED`/`FAILED`/`TIMED_OUT`.
```

**Fix 3 — §9c: rate-limit tracking + DLQ are built-not-wired (zero callers, empty tables).**

BEFORE:
```
- **Shopify API rate-limit tracking** (`services/shopify/rate-limit.service.ts`): every
  Admin call through the Shopify connector records `extensions.cost.throttleStatus`
  (currentlyAvailable / maximumAvailable / restoreRate) + `actualQueryCost` into
  `ShopApiRateLimit` (best-effort, never throws into the call). Exposed live at
  **`/api-usage`** (real data, empty state until the first call) for the API-limit
  threshold dashboard. `RateLimitService.backoffMs` gives proactive throttle backoff;
  the connector already honors 429 `Retry-After`.
- **Dead-letter queue** (`services/flows/dead-letter.service.ts` + `FlowDeadLetter`):
  a flow run that fails after in-run retries is dead-lettered (keyed to its flow). Cron
  (`replayDeadLetters`) replays PENDING entries with **bounded** exponential backoff via
  `runFlowById` (re-runs only that flow, never re-fires siblings); after `maxAttempts`
  it is **DISCARDED** — no infinite loop. Replay state lives in the row.
```

AFTER:
```
> **Reality (2026-07 audit): both are built-not-wired — zero callers, tables stay empty.**

- **Shopify API rate-limit tracking** (`services/shopify/rate-limit.service.ts`): the
  `recordAdminThrottle` writer exists but has **zero callers** — nothing persists
  `throttleStatus` into `ShopApiRateLimit`, so the table stays empty (the connector
  reads `throttleStatus` inline for its own 429 backoff but never records it). The
  `/api-usage` dashboard therefore shows an empty state in production.
- **Dead-letter queue** (`services/flows/dead-letter.service.ts` + `FlowDeadLetter`):
  `DeadLetterService.record`/`replayDeadLetters` are fully implemented but have **zero
  callers**; `flow-runner.service.ts` only leaves a comment on failure. `FlowDeadLetter`
  stays empty and no cron replays it.
```

**Fix 4 — §10: the "only remaining needs_runtime type" statement is wrong (there are three).**

BEFORE:
```
them). Eligibility flipped to `runtimeShipped: true`; the only remaining `needs_runtime`
type is `functions.orderRoutingLocationRule` (no CLI template yet — built as a flow action).
```

AFTER:
```
them). Eligibility flipped to `runtimeShipped: true`. The remaining `needs_runtime`
types are **three**: `functions.orderRoutingLocationRule` (no CLI template — built as a
flow action), `flow.automation` (workflow-definition publish wiring pending), and
`admin.discountUi` (Spring-2026 discount-details extension not yet built in `extensions/`).
```

---

### /Users/lavipun/Work/ai-shopify-superapp/docs/blueprints.md

The generation half is genuinely wired (behind `BLUEPRINTS_ENABLED`, off
everywhere), but the doc narrates co-deploy (`publishBlueprint`) as if it runs,
cites an archived migration filename, and points routing at the batch route
(streaming is now primary).

**Fix 1 — Flow diagram implies co-deploy runs; it does not (`publishBlueprint` = zero callers).**

BEFORE:
```
                                              → BlueprintService.createDraft (Recipe + N draft Modules)
                                              → publish each member to its surface (existing PublishService)
```

AFTER:
```
                                              → BlueprintService.createDraft (Recipe + N draft Modules)
                                              → (members stay DRAFT; publish one-at-a-time via the ordinary per-module publish UI —
                                                 coordinated co-deploy `publishBlueprint` is built but has ZERO callers)
```

**Fix 2 — migration filename is stale (archived); live schema is the baseline.**

BEFORE:
```
- Migration: `prisma/migrations/20260616120000_add_recipe_summary_blueprint`
  (`ALTER TABLE "Recipe" ADD COLUMN "summary" TEXT`).
```

AFTER:
```
- Migration: `Recipe.summary TEXT` lives in the single baseline
  `prisma/migrations/20260702000000_baseline/migration.sql`. (The originally-cited
  `20260616120000_add_recipe_summary_blueprint` was folded into the baseline and now
  exists only under `migrations-archive/` / `_archived_migrations_pre_baseline/`.)
```

**Fix 3 — `publishBlueprint` co-deploy is described as live; it has no caller.**

BEFORE:
```
- `publishBlueprint(admin, shop, recipeId, { themeId })` → loops the existing
  per-module `PublishService.publish`, routing theme members to a `THEME` target
  and others to `PLATFORM`, each writing to its surface's
  `list.metaobject_reference`. **Best-effort, NOT atomic** (Shopify writes can't
  be transactional across surfaces): failed members stay `DRAFT` and are
  retryable; results report `{ published[], failed[] }`.
```

AFTER:
```
- `publishBlueprint(admin, shop, recipeId, { themeId })` is **implemented but
  built-not-wired — it has ZERO callers** (no route, UI button, or job invokes it),
  so coordinated co-deploy does not run today. As designed it would loop the existing
  per-module `PublishService.publish` (theme members → `THEME`, others → `PLATFORM`),
  best-effort and non-atomic, reporting `{ published[], failed[] }`. `injectResolvedBundle`
  (the bundle-GID resolver it would call) is likewise test-only, so bundle members would
  deploy with placeholder GIDs until it is wired. Until a "Publish all N" action exists,
  members publish one-at-a-time via the ordinary per-module publish UI.
```

**Fix 4 — routing: the UI now calls the streaming route first; batch is the fallback.**

BEFORE:
```
- `api.ai.create-module` (flag on + plan is a blueprint): also returns a
  `blueprint` field alongside the single-module `options`.
```

AFTER:
```
- `api.ai.create-module.stream` (flag on + plan is a blueprint): the **primary** UI
  call site — streams a `blueprint` SSE event alongside the single-module options.
  `api.ai.create-module` (batch) is the fallback and returns a `blueprint` field the
  same way.
```

**Fix 5 (optional) — the "Out of scope" line implies co-deploy already ships; re-frame it as unwired.** *(The body fixes above already resolve the contradiction; apply only if minimizing residual ambiguity.)*

BEFORE:
```
- Atomic / rollback co-deploy; blueprint-level progressive rollout.
```

AFTER:
```
- Co-deploy itself (`publishBlueprint` is built but unwired), then atomic / rollback
  co-deploy and blueprint-level progressive rollout.
```

---

### /Users/lavipun/Work/ai-shopify-superapp/docs/module-system-v2.md

A design doc, but three present-tense claims contradict reality: the backend-data
"Gap" line is now pessimistic (export/captures shipped), and the `SchemaForm`
"closes the generate-but-never-render gap" claim is false (`ConfigEditor`
unmounted). Line 9's parenthetical ("generated but never rendered") is now
accurate and needs no change.

**Fix 1 — Backend-data "Gap" line understates a now-live surface.**

BEFORE:
```
- **Gap:** `DataStore.schemaJson` dormant; `DataCapture` no admin UI; no CSV/PDF/print export.
```

AFTER:
```
- **Gap (updated 2026-07):** only `DataStore.schemaJson` typed provisioning is still
  dormant (`ensureTypedStore` has zero non-test callers; `provisionFromModuleSpec` does
  not exist). CSV export, browser print-to-PDF, `DataCapture` ingestion, and the
  captures admin view are **all live** (`data.$storeKey_.export.tsx`,
  `data.$storeKey_.print.tsx`, `api.module-captures.tsx`, `modules.$moduleId_.captures.tsx`).
```

**Fix 2 — `SchemaForm` "closing the generate-but-never-render gap" is false; the renderer is unmounted.**

BEFORE:
```
`app/components/SchemaForm.tsx` renders any `{ jsonSchema, uiSchema, defaults }`:
- Replaces hardcoded `ConfigEditor.tsx` + `StyleBuilder.tsx`.
- **Consumes the `adminConfigSchemaJson` the hydrate step already generates** — closing the generate-but-never-render gap.
```

AFTER:
```
`app/components/SchemaForm.tsx` renders any `{ jsonSchema, uiSchema, defaults }`:
- **Intended** to replace hardcoded `ConfigEditor.tsx` + `StyleBuilder.tsx` — but as
  of 2026-07 both are imported-but-never-mounted (`<ConfigEditor`/`<StyleBuilder` JSX =
  0 app-wide), and the live builder (`generate._index.tsx`) reads `recipe.config`
  scalars directly.
- **Does NOT yet consume the hydrate `adminConfigSchemaJson`** on any merchant-facing
  path — that field is generated + persisted but no longer rendered, so the
  generate-but-never-render gap is **still open**. `SchemaForm`'s only live mount is the
  unrelated backend-data record form (`data.$storeKey.tsx`).
```

**Fix 3 (optional) — the A/B / flag section describes a comparison that cannot run (generation never branches; render is discarded). Correct only if this doc should reflect current wiring rather than original design intent.**

BEFORE:
```
- Add `AppSettings.moduleSystemVersion` (`'v1' | 'v2'`) or a per-request `?engine=v2`.
- Keep v1 path intact. Compare on latency, token cost (`AiUsage`), validation/repair rate, control richness. Promote v2 when metrics win.
```

AFTER:
```
> **Reality (2026-07): plumbing without payoff.** `AppSettings.moduleSystemVersion`
> is settable, but generation never reads it, `?engine=v2` does not exist, only
> `theme.section` has a manifest, and the v2 renderer (`ConfigEditor`→`SchemaForm`) is
> unmounted — so flipping the flag changes nothing observable and there is nothing to
> A/B. The below is the original intent, not current behavior.

- Add `AppSettings.moduleSystemVersion` (`'v1' | 'v2'`) or a per-request `?engine=v2`.
- Keep v1 path intact. Compare on latency, token cost (`AiUsage`), validation/repair rate, control richness. Promote v2 when metrics win.
```

---

### /Users/lavipun/Work/ai-shopify-superapp/docs/module-settings-modernization.md

The user edited the 2026-06-15 note (line 191, "Auto-fill at create — removed"),
which is now honest. But two claims the user did **not** touch are still false at
HEAD:

**Fix 1 — line 184: `SchemaForm` "closes the generate-but-never-render gap" is false (renderer unmounted).**

BEFORE:
```
- **Schema-driven form** — `SchemaForm.tsx` renders `{ jsonSchema, uiSchema, value }` from the hydrate `adminConfigSchemaJson` (closes the generate-but-never-render gap); derives widgets from JSON-schema when no hint is given; tier + conditional visibility. `ConfigEditor` stays as the v1 fallback behind the flag.
```

AFTER:
```
- **Schema-driven form** — `SchemaForm.tsx` can render `{ jsonSchema, uiSchema, value }` from a hydrate `adminConfigSchemaJson`, but **is not wired to it on any merchant path** as of 2026-07: `ConfigEditor` (its host under the v2 flag) is imported-but-never-mounted, so the generate-but-never-render gap is **still open**. The live builder edits `recipe.config` scalars directly (`generate._index.tsx`). `SchemaForm`'s only live mount is the unrelated backend-data record form.
```

**Fix 2 — line 190: the RepublishDiff preview / `computeRepublishDiff` compute was DELETED.**

BEFORE:
```
- **RepublishDiff preview** renders in the module-detail Publish card: the loader computes `computeRepublishDiff(draft.config vs published.config)` and shows `First publish` / `No changes (safe no-op)` / `Will update <fields>` before the merchant republishes.
```

AFTER:
```
- **RepublishDiff preview — removed (2026-07-03, spec 027).** The dead
  `computeRepublishDiff` loader compute was deleted from `modules.$moduleId.tsx`; the
  module-detail Publish card no longer renders a pre-republish diff. (`computeRepublishDiff`
  now exists only inside `publish.service.ts`/its test, not on the module-detail loader.)
```

---

### /Users/lavipun/Work/ai-shopify-superapp/docs/superapp-surface-inventory.md

The user's 2026-07-03 update note (line 192) is fine, but the audit-appendix count
(line 174) and the publish-status matrix (line 211) were not corrected and are
materially wrong.

**Fix 1 — line 174: "20 types" → 21.**

BEFORE:
```
| Canonical RecipeSpec parity (`allowed-values` vs `recipe`) | PASS | 20 types align. |
```

AFTER:
```
| Canonical RecipeSpec parity (`allowed-values` vs `recipe`) | PASS | 21 types align (adds `admin.discountUi`). |
```

**Fix 2 — line 211: the `needs_runtime` set is wrong. `pos.extension` and `functions.fulfillmentConstraints` are deployable; `checkout.block`/`postPurchase.offer`/`integration.httpSync`/`platform.extensionBlueprint` are marked deployable but write nothing (false-published); the real needs_runtime set is 3 and must include `admin.discountUi`.**

BEFORE:
```
- **needs_runtime** ("not publishable yet") — the runtime extension isn't shipped: the remaining AUDIT-only types (`checkout.block`, `postPurchase.offer`, `pos.extension`, `integration.httpSync`, `flow.automation`, `platform.extensionBlueprint`, `functions.fulfillmentConstraints`, `functions.orderRoutingLocationRule`) and any function type with no deployed extension. `willDeploy === false` always carries a reason; the merchant Builder shows it before publish.
```

AFTER:
```
- **needs_runtime** ("not publishable yet") — the registry marks exactly **three** types
  `runtimeShipped:false`: `functions.orderRoutingLocationRule` (no CLI template),
  `flow.automation` (workflow-definition publish wiring pending — note a linear
  `FlowRunnerService` runtime *is* live, so this label is pessimistic), and
  `admin.discountUi` (Spring-2026 discount-details extension not yet built). `willDeploy
  === false` carries a reason; the Builder shows it before publish.
- **⚠ Known false-published bug** — `checkout.block`, `postPurchase.offer`,
  `integration.httpSync`, and `platform.extensionBlueprint` are marked `deployable` but
  their compiler hits the bare-AUDIT fallthrough and **writes nothing**, yet publish
  still flips them PUBLISHED. `pos.extension` and `functions.fulfillmentConstraints` are
  genuinely deployable (POS via a DB-read path, not a metaobject write).
```

---

## Already accurate (no change)

- **/Users/lavipun/Work/ai-shopify-superapp/DESIGN.md** — §H (line 126) correctly
  states the interactive-widget gap ("cannot render an interactive spinning wheel…
  a platform build, not a prompt change"). The audit confirms this is exactly true.
  (The remaining action — trimming the spin/scratch examples in
  `intent-examples.ts:37-38` so the classifier stops implying the capability — is a
  **code** change, not a DESIGN.md edit.)

- **/Users/lavipun/Work/ai-shopify-superapp/docs/data-models.md** — its `schemaJson`
  statements ("reserved for future typed schemas; currently unused by the service
  layer", line 51; "No schema enforcement — `schemaJson` column exists but is
  unused", line 269) **match** reality (typed provisioning is vapor at HEAD). The doc
  simply omits the shipped CSV/print/captures surface; that is an omission, not a
  false claim, and the authoritative correction of the pessimistic export/captures
  line lives in `module-system-v2.md` above. No string-match edit required here.

- **/Users/lavipun/Work/ai-shopify-superapp/docs/implementation-status.md** — the
  dated changelog entries (2026-06-13/-14 "Module System v2", line 52 "derive the
  Zod schema… admin form", line 53 "typed `DataStore.schemaJson` validation") describe
  what was *believed shipped on that date*; they are historical log entries, not
  current-state assertions, and the current-state 2026-07-03 section already carries
  the honest 027 framing. The one live-state token still stale is "all 20 types"
  (line 8) — **left out of the required-edits list because it sits inside a dated
  changelog row**; correct it only if you want the changelog retro-fixed
  (`(all 20 types)` → `(all 21 types)`). No behavioral doc claim depends on it.

---

## One-line summary

**5 docs still need edits** — `flow-automation.md`, `blueprints.md`,
`module-system-v2.md`, `module-settings-modernization.md`, and
`superapp-surface-inventory.md`; `DESIGN.md`, `data-models.md`, and
`implementation-status.md` are already accurate (or only carry a stale count inside
a dated changelog).
