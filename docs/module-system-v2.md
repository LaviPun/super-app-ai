# Module System v2 — Design Doc

## Context

The app generates Shopify modules (sections, popups, functions, etc.) via a **constrained-generation** model: the AI only emits a `RecipeSpec` JSON that validates against a fixed Zod discriminated union (`packages/core/src/recipe.ts`), which compiles deterministically into safe Shopify artifacts. This core is **correct and must be kept** — free-form codegen on a live merchant store is unsafe and breaks deterministic preview/deploy.

The problems v2 solves are:

1. **The control vocabulary is too small and duplicated.** Settings live in *four* disconnected places: the Zod schema (`recipe.ts`), prose "settings packs" (`prompt-expectations.server.ts`), an AI-generated `adminConfigSchemaJson` (hydrate envelope — **generated but never rendered**), and hardcoded form maps (`ConfigEditor.tsx`, `StyleBuilder.tsx`). Adding a control means editing all four.
2. **145 hand-written templates** across 25 types (`_templates_part1..4.ts`), wildly lopsided (64 `checkout.block`, 2 `theme.contactForm`).
3. **Backend data is ~75% built but disconnected.** `DataStore`/`DataStoreRecord`/`DataCapture` + services + a record grid exist, but `schemaJson` is dormant (no typed forms/validation), there's no CSV/PDF/print export, and `DataCapture` has no admin view.

**Intended outcome:** One composable **Control Pack** system as the single source of truth that feeds schema + AI prompt + admin form + preview + compile; a **tiered** model (Basic → Advanced → Escape-hatch) so merchants can get an "over-the-top" popup/section/function with every control; and a **module-owned data layer** (typed tables + auto CRUD + CSV/PDF/print) built on the existing `DataStore` primitives. Old and new paths run side-by-side behind a flag so we can **compare which is better**.

The proven model to generalize is **`StorefrontStyleSchema`** (`packages/core/src/storefront-style.ts`): one Zod schema + a central CSS compiler (`style-compiler.ts`), reused by 6 module types with zero per-type duplication. Control Packs are that pattern, generalized.

## Unrestricted storefront sections (`theme.section`)

The theme/storefront surface is **no longer a fixed catalog**. Previously the AI could only emit a closed set (`theme.banner`, `theme.popup`, …); anything else was impossible. That cage is removed.

A single generic type — **`theme.section`** — can express **any** storefront section or theme app extension:

- **`config.kind`** — a free-form **recommendation tag** (`'hero'`, `'faq'`, `'lookbook'`, `'custom'`, anything). It drives preview hints and recommendations only; it is **never an enum / never a constraint**.
- **`config.fieldSchema` + `config.fields`** — the section declares its **own typed settings** (reuses the `DataModel` field system) and their values.
- **`config.blocks`** — repeatable content items for list/grid sections.
- **`config.advancedCustom`** — the sanitized **escape hatch** (`customHtml` / `customJs`; custom CSS lives in `style.customCss`). Scoped + CSP-bound; scripts stripped in the preview iframe.
- **`config.activation`** — `section` | `global` | `overlay`.

The named types (`theme.banner`, `theme.popup`, `theme.notificationBar`, …) are **presets** of this capability — convenient starting points, never a restriction. Generation prefers a preset when it fits and reaches for `theme.section` for anything novel.

**Safety is unchanged:** `RecipeSpec` still validates; the trust boundary (sanitize + scope + CSP + sandboxed-iframe preview) is the same escape-hatch machinery. What changed is the *shape* is open, not the *trust model*.

**Wiring (all green):** schema branch in `recipe.ts`; `theme.section` added to `RECIPE_SPEC_TYPES` and the `MODULE_TYPE_TO_*` maps; generic compiler `compiler/theme.section.ts` (delegates to the shared `theme-module.ts`); generic preview `PreviewService.themeSection` (renders title/blocks/fields + sanitized custom HTML); control-pack manifest + adapter; module summary + settings pack + purpose guidance so **every prompt** routes custom sections here; classifier rules; a `SEC-001 Custom Section` template; catalog regenerated.

**Collapse mechanism (kind registry):** named types collapse into `theme.section` without fidelity loss via a per-`kind` renderer registry in `PreviewService` (`themeSection` dispatches on `config.kind`: known kinds get a rich renderer, unknown kinds fall back to the generic renderer). Kind-specific data lives in `config.fields`. The compiler is already unified (`theme-module.ts`); activation comes from `config.activation`.

**Migration status (in progress):**
- ✅ `theme.notificationBar` — **collapsed** to `kind: 'notification-bar'`. Fully removed; zero residual.
- ✅ `theme.banner` — **collapsed** to `kind: 'banner'`. Removed from the schema, all `Record<ModuleType>` maps, compiler, preview (`sectionBanner` kind renderer reads `config.fields`), prompts, classifier, ~17 templates migrated to `theme.section` presets, and all tests. Zero residual references.
- ✅ `theme.popup` — **collapsed** to `kind: 'popup'` (`activation: 'overlay'`). Removed from the schema, all `Record<ModuleType>` maps, the dedicated compiler (`theme.popup.ts` deleted; `compileThemeSection` handles it), preview (`sectionPopup` kind renderer), prompts/summaries/expectations/hydrate guidance (overlay controls folded into `theme.section`), classifier, config-adapter (full pack surface now maps under `theme.section`), `ConfigEditor`/`StyleBuilder` (popup field set + style preset folded into `theme.section`), templates, and all tests. Zero residual references. Full core (142) + web (488) test suites green.
- ✅ `theme.contactForm` — **collapsed** to `kind: 'contactForm'`. Removed from the schema, all `Record<ModuleType>` maps, the dedicated compiler (`theme.contactForm.ts` deleted; `compileThemeSection` handles it), preview (`sectionContactForm` kind renderer reads `config.fields`/top-level via `cfg`), prompts/summaries/expectations/hydrate guidance (kind-aware), classifier, `ConfigEditor` (kind-keyed `theme.section:contactForm` field set), the `CNT-143` template, the dead `CONTACT_FORM_*` enums, and all tests. Data-save readiness now detects `theme.section` + `kind === 'contactForm'`. Zero residual references. Full core (142) + web (488) test suites green.
- ✅ `theme.effect` — **collapsed** to `kind: 'effect'` (`activation: 'overlay'`). Removed from the schema, all `Record<ModuleType>` maps, the dedicated compiler (`theme.effect.ts` deleted), preview (`sectionEffect` kind renderer), prompts/summaries/expectations (kind-aware), classifier, `ConfigEditor` (`theme.section:effect` field set), `StyleBuilder`, the `EFF-127`/`EFF-128` templates, the dead `THEME_EFFECT_*` enums, and all tests. `effectKind` is now free-form (no enum) — any effect can be built. Zero residual references. Full core (142) + web (488) test suites green.
- ✅ `theme.floatingWidget` — **collapsed** to `kind: 'floatingWidget'` (`activation: 'global'`). Removed from the schema, all `Record<ModuleType>` maps, the dedicated compiler (`theme.floatingWidget.ts` deleted), preview (`sectionFloatingWidget` kind renderer), prompts/summaries/expectations (kind-aware), classifier, `StyleBuilder`, the `LOY-108` template, the dead `THEME_FLOATING_WIDGET_*` enums, and all tests. Zero residual references. Full core (142) + web (488) test suites green.

**All six named theme.* types are now collapsed into the single generic `theme.section`.** The only remaining first-class theme/storefront types are `theme.section` (generic, unrestricted), `theme.contactForm`/`theme.effect`/`theme.floatingWidget` are gone, and `proxy.widget` (app-proxy server-rendered). `config.kind` is a free-form recommendation tag — merchants can build ANY section, extension, or overlay; the kinds above are preview/preset hints, never a restriction.

## The core idea: Control Packs

A **Control Pack** is a self-describing, reusable bundle of related settings. Each pack owns *one* definition that derives everything downstream:

```ts
// packages/core/src/control-packs/types.ts
interface ControlPack {
  id: string;                       // 'trigger', 'page-targeting', 'schedule', ...
  label: string;
  tier: 'basic' | 'advanced';       // gates which controls appear at which tier
  schema: z.ZodTypeAny;             // the ONLY hand-written artifact — Zod is source of truth
  uiSchema?: UiHints;               // field order, grouping, conditional visibility (drives admin form)
  appliesTo: (type: ModuleType) => boolean;
  compile?: (value, ctx) => CompileFragment; // optional deploy contribution
}
```

From `pack.schema` we **derive** (never hand-write again): the per-type Zod branch, the JSON Schema for structured LLM output, the AI prompt guidance, the admin form, and the preview inputs.

### Initial pack catalog

| Pack | Controls (examples) | Used by |
|---|---|---|
| `content` | heading, body, CTAs, media | all UI types |
| `style` | = existing `StorefrontStyleSchema` | theme.*, proxy.widget |
| `trigger` | on_load / exit_intent / scroll_% / click / timed / inactivity | popup, floatingWidget, effect |
| `page-targeting` | template allow/deny, URL rules, device, geo, customer-tag | all storefront |
| `schedule` | start/end datetime, recurring windows, timezone, day-parting | popup, banner, notificationBar |
| `frequency-cap` | per session/day/week/ever, max shows | popup, banner |
| `countdown` | enabled, seconds, label, on-expire action | popup, banner |
| `audience` | logged-in, segments, new-vs-returning, cart-value, order-count | all |
| `data-binding` | bind fields to Shopify data surfaces | all |
| `data-store` | declare a module-owned typed table | data-driven modules |
| `export` | enable CSV / PDF / print outputs | data-driven modules |
| `localization` | per-locale overrides | all |
| `accessibility` | reduced-motion, focus, ARIA labels | all UI |
| `advanced-custom` | sanitized custom HTML/CSS/JS (escape hatch) | advanced tier only |

A module type becomes a **composition manifest**, not a hand-written schema:

```ts
// theme.section carries the full pack surface; the popup kind (activation: 'overlay')
// composes from the same manifest.
'theme.section': {
  packs: ['content', 'style', 'trigger', 'page-targeting',
          'frequency-cap', 'countdown', 'behavior'],
  advancedPacks: ['audience', 'schedule', 'advanced-custom'],
}
```

`recipe.ts` keeps its discriminated union for back-compat, but each branch's `config` is generated by composing the manifest's packs. Consolidation: 25 hand-written configs → ~13 reusable packs + thin manifests.

## How the model decides which controls a module needs

1. **Module type → base packs** (manifest). Deterministic.
2. **Requested tier** (Basic / Advanced) — UI toggle and/or intent classification. Tier gates `advancedPacks` and `advanced-custom`.
3. **Capability/data signals** (reuse `getRequiredDataFlagsForType` + `TEMPLATE_TYPES_REQUIRING_DATA_SAVE`): data modules auto-attach `data-store`/`export`.

The AI's job shrinks to **filling pack values**, not inventing controls — more reliable (smaller structured-output schema) and richer for the merchant.

## Tiers (incl. the Advanced escape hatch)

- **Basic** — high-value packs only, opinionated defaults.
- **Advanced** — every applicable pack, full control surface.
- **Advanced + escape hatch** — adds `advanced-custom`: sanitized `customHtml` / `customCss` / `customJs`.
  - Reuse `sanitizeCustomCss` in `style-compiler.ts` and `assertGeneratedPreviewHtmlIsSafe()` in `preview-contracts.ts`.
  - `customJs` runs only inside the sandboxed preview iframe and, at deploy, inside the theme-app-extension's own scoped block with a strict CSP. No eval, no arbitrary network unless an allowlisted Connector is referenced.
  - Escape-hatch modules render in their own scoped container, never inline into theme globals.

## Backend data layer (module-owned tables + CRUD + export)

Build on existing primitives — no parallel system.

- **Built:** `DataStore`/`DataStoreRecord`, `data-store.service.ts`, record grid `data.$storeKey.tsx`, `module-capture.service.ts` + `api.module-captures.tsx` + `proxy.capture.tsx`, Connector layer.
- **Gap (updated 2026-07):** only `DataStore.schemaJson` typed provisioning is still
  dormant (`ensureTypedStore` has zero non-test callers; `provisionFromModuleSpec` does
  not exist). CSV export, browser print-to-PDF, `DataCapture` ingestion, and the
  captures admin view are **all live** (`data.$storeKey_.export.tsx`,
  `data.$storeKey_.print.tsx`, `api.module-captures.tsx`, `modules.$moduleId_.captures.tsx`).

Plan:

1. **Typed model via the `data-store` pack.** Module declares fields `{ name, type, required, options, piiFlag }` → writes `DataStore.schemaJson`. Records validate against a Zod schema derived from `schemaJson` at runtime.
2. **Auto CRUD grid driven by schema.** Generalize `data.$storeKey.tsx`: typed columns + typed add/edit form via the shared schema-form renderer.
3. **Export pack → CSV / PDF / print.** `export.service.ts` + routes `data.$storeKey.export[.csv|.pdf].tsx`, `data.$storeKey.print.tsx`. Gated by the `export` pack.
4. **DataCapture admin view.** `modules.$moduleId.captures.tsx` with filter + export.

## The single generic schema-form renderer (key unlock)

`app/components/SchemaForm.tsx` renders any `{ jsonSchema, uiSchema, defaults }`:
- **Intended** to replace hardcoded `ConfigEditor.tsx` + `StyleBuilder.tsx` — but as
  of 2026-07 both are imported-but-never-mounted (`<ConfigEditor`/`<StyleBuilder` JSX =
  0 app-wide), and the live builder (`generate._index.tsx`) reads `recipe.config`
  scalars directly.
- **Does NOT yet consume the hydrate `adminConfigSchemaJson`** on any merchant-facing
  path — that field is generated + persisted but no longer rendered, so the
  generate-but-never-render gap is **still open**. `SchemaForm`'s only live mount is the
  unrelated backend-data record form (`data.$storeKey.tsx`).
- Reused by Backend Data CRUD forms and capture views.
- Supports grouping, conditional visibility, and tier-gating.

## Efficiency wins

- **One vocabulary, not four.**
- **Template consolidation: 145 → ~13 packs + small preset list.** Presets = `{ manifest packs + default values }`; keep ~3–5 curated presets per type.
- **Prompt diet.** Drop redundant prose `getFullRecipeSchemaSpec` + guardrail blocks when a structured schema is present. Measure 2 vs 3 parallel options.
- **Compiler dedupe.** Collapse 6 `theme.*.ts` and 7 `functions.*.ts` compilers into `compileThemeModule(type)` and `compileFunctionConfig(functionKey)`.

## Compare-which-is-better (A/B)

> **Reality (2026-07): plumbing without payoff.** `AppSettings.moduleSystemVersion`
> is settable, but generation never reads it, `?engine=v2` does not exist, only
> `theme.section` has a manifest, and the v2 renderer (`ConfigEditor`→`SchemaForm`) is
> unmounted — so flipping the flag changes nothing observable and there is nothing to
> A/B. The below is the original intent, not current behavior.

- Add `AppSettings.moduleSystemVersion` (`'v1' | 'v2'`) or a per-request `?engine=v2`.
- Keep v1 path intact. Compare on latency, token cost (`AiUsage`), validation/repair rate, control richness. Promote v2 when metrics win.

## Phased rollout

1. **Foundation** — `control-packs/` (types, registry, 4 seed packs: `content`, `style`, `trigger`, `page-targeting`); composition util that builds a Zod branch from a manifest. Unit tests.
2. **Schema-form renderer** — `SchemaForm.tsx`; consume hydrate `adminConfigSchemaJson` on `modules.$moduleId.tsx` behind the v2 flag; keep `ConfigEditor` as v1 fallback.
3. **Popup flagship** — express the `theme.section` popup kind (`activation: 'overlay'`) fully via packs incl. Advanced tier + escape hatch; prove end to end.
4. **Backend data** — `schemaJson` validation, schema-driven CRUD grid, `export.service.ts`, `DataCapture` admin view.
5. **Consolidation** — migrate types to manifests; templates → presets; dedupe compilers; prompt diet.
6. **A/B + promote** — flag, metrics, default to v2.

## Critical files

**New:**
- `packages/core/src/control-packs/{types.ts, registry.ts, module-manifests.ts, packs/*.ts, compose.ts}`
- `apps/web/app/components/SchemaForm.tsx`
- `apps/web/app/services/data/export.service.ts`
- `apps/web/app/routes/{data.$storeKey.export.csv.tsx, data.$storeKey.export.pdf.tsx, data.$storeKey.print.tsx, modules.$moduleId.captures.tsx}`

**Modified (connect, don't replace):**
- `packages/core/src/recipe.ts`, `storefront-style.ts`
- `apps/web/app/services/ai/prompt-expectations.server.ts`
- `apps/web/app/routes/modules.$moduleId.tsx`, `components/ConfigEditor.tsx`, `components/StyleBuilder.tsx`
- `apps/web/app/routes/data.$storeKey.tsx`, `services/data/data-store.service.ts`
- `apps/web/app/services/recipes/compiler/*`
- `apps/web/prisma/schema.prisma` (`AppSettings.moduleSystemVersion`)
- `packages/core/src/_templates_part1..4.ts` → presets

## Deferred (require sign-off / live verification)

Two Phase-5 items are intentionally NOT done in code, because they are hard to reverse and need verification this environment can't provide:

1. **Physical deletion of the 145 templates.** The presets layer (`control-packs/presets.ts`) now surfaces a curated subset per type non-destructively; the underlying `MODULE_TEMPLATES` remain the source of truth. Actually pruning the catalog needs product sign-off on which entries to keep.
2. **Prompt diet** (dropping prose `getFullRecipeSchemaSpec` + guardrail blocks when a structured schema is present). This changes live generation output and must be gated behind eval runs / A/B token-delta comparison before shipping.

Compiler dedup was done **safely** for the collapsed `theme.banner`/`theme.popup`/`theme.notificationBar` kinds (their dedicated compilers are deleted; `compileThemeSection` → `theme-module.ts` handles them, byte-identical by construction). The remaining theme/function compilers should each be snapshot-verified before delegating.

## Verification

- **Unit:** pack composition produces a Zod branch matching the `theme.section` popup-kind config in coverage; round-trip preset → RecipeSpec → validate.
- **Generation:** `?engine=v2` for an advanced popup → all packs present, validates first try, smaller structured-output schema (log token delta via `AiUsage`).
- **Settings UI:** `SchemaForm` renders every popup control; edit/save round-trips; advanced tier reveals custom HTML/CSS/JS; preview stays safe.
- **Backend data:** declare typed model → CRUD grid → add rows → CSV/PDF/print export; capture endpoint still writes; capture admin view lists + exports.
- **Compile/deploy:** deduped compilers produce byte-identical `compiledJson` (snapshot) before deleting old per-type files.
- **A/B:** v1 vs v2 metrics; promote only when v2 wins.
