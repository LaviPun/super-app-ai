# Feature Specification: Platform V2 Phase 28 — Recipe Vocabulary Study & Reality Reconciliation

**Feature Directory**: `028-recipe-vocabulary`

**Created**: 2026-07-03

**Last updated**: 2026-07-03

**Status**: **Research** on `feat/superapp-redesign`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`docs/module-system-v2.md`](../../docs/module-system-v2.md). Related: [`docs/superapp-surface-inventory.md`](../../docs/superapp-surface-inventory.md), [`packages/core/src/extension-eligibility.ts`](../../packages/core/src/extension-eligibility.ts), [`packages/core/src/control-packs/`](../../packages/core/src/control-packs/).

## Goal

The recipe system is a constrained-generation sandbox: the AI emits a validated `RecipeSpec`, a deterministic compiler turns it into real Shopify artifacts. This is the correct anti-slop architecture. Its quality ceiling, however, is the **expressiveness of the recipe vocabulary** — and today that vocabulary is hand-authored from one person's knowledge, static, and thin. Symptoms observed: shallow/templated visuals (not YC-tier), too few merchant controls, and an inability to express a full multi-surface plugin (e.g. a product bundler spanning product page + cart transform + checkout).

This phase does **not** build the new vocabulary. It produces the **honest, reality-grounded foundation** the vocabulary work will be built from, via two research tracks and one reconciliation:

- **Track A — External study:** the top ~50 Shopify plugins → the *target* vocabulary (settings taxonomies, data models, surface coverage, visual/interaction patterns, and merchant-praise/complaint signal that defines "up to the mark").
- **Track B — Internal reality audit:** what is genuinely built and wired vs aspirational, what is required vs dead weight, and what is already executed — so we never rebuild what exists and never trust a doc claim the live path doesn't honour.
- **Synthesis:** `target − current = the honest gap`. Output a re-planned set of documents (accurate current-state + prioritized target vocabulary) that all downstream phases (#2 visuals, #3 control-packs, #4 composites) build from. "Then we make it real."

## Non-goals

- No product code, schema changes, or migrations in this phase. This is research + reconciled documentation only.
- Not loosening the constraint into freeform codegen. The vocabulary gets *richer*; the constraint stays. (Merchant-facing "Custom CSS" is a single scoped escape hatch, not raw codegen — see [`#2`](#downstream-phases).)
- Not a generic market report. Every artifact is structured to be directly consumable by the vocabulary build.

## Scope

### Track A — External plugin study (~55 plugins + full Bold suite)

**Selection.** Diverse across categories and surfaces, weighted to top-rated / high-install (learn from winners). Target categories: bundles, upsell/cross-sell, reviews/UGC, loyalty & rewards, popups/email capture, subscriptions, wishlists, discounts/promotions, delivery & shipping, checkout customization, product options/personalization, back-in-stock, search & filtering, trust/urgency, page builders. Includes named references (Loox, Rebuy, Foxkit, Moon Bundles) and the **complete Bold Commerce catalog** (Subscriptions, Upsell, Product Options, Discounts, Memberships, Custom Pricing/Wholesale, Brain, Checkout, Bundles). **Product bundler receives a deep-dive** as the flagship multi-surface case. Roster of 58 (3 pilot records already written: `loox`, `rebuy`, `fast-bundle`).

**Per-plugin record schema** (`research/plugins/<slug>.md`, one per plugin, all identical shape so they merge):

| Field | Contents |
|-------|----------|
| `identity` | name, vendor, category, Shopify App Store URL, rating, review count, install signal |
| `surfaces` | which surfaces it renders on (product page, storefront widget, cart, checkout, thank-you, admin, POS, customer account, flow) — mapped to our `extension-eligibility` type names |
| `functional_model` | core entities it manages + relationships (e.g. `bundle = { products[], pricing_rule, display_block }`) |
| `settings_taxonomy` | the actual knobs exposed to merchants, grouped `content / style / targeting / behavior / data`, each with a type — raw material for control-packs |
| `data_model` | what it persists (variables, datasets, records) and where |
| `visual_patterns` | layout archetypes, component states, motion/interaction patterns |
| `reviews_signal` | top praise + top complaints from reviews — defines "up to the mark" and common failure modes |
| `mapping_note` | how this maps onto (or exceeds) today's `RecipeSpec` for its type |

### Track A2 — Design-vocabulary study (visual fidelity)

Directly targets the #1 pain (shallow visuals). Mines **38 creative-frontend / component libraries** (deduped from the two reference lists the user supplied — shadcn, Radix/Base UI, Untitled UI, MUI, Mantine, HeroUI, daisyUI, Magic UI, Aceternity, Cult UI, Motion.dev, animata, Hover.dev, etc.) plus the **UI-Layouts block taxonomy** (hero / testimonials / pricing / FAQ / feature / carousel / footer …). Libraries are batched (~5 per agent). Each extraction captures, per library: type, styling approach, aesthetic signature (what makes it read premium/YC-tier), standout components/effects, and motion/interaction patterns — then distils transferable **design tokens** (color, typography scale, spacing, radius, shadow, motion timing/easing) and component/motion archetypes. Consolidated into `research/design/design-vocabulary.md`, the direct input to phase #2. Reference sources:

- `https://pro.ui-layouts.com/blocks` (block taxonomy)
- `https://dev.to/hadil/the-ultimate-list-of-27-frontend-libraries-for-creative-developers-15go`
- `https://www.untitledui.com/blog/react-component-libraries`
- User-supplied design library (folds in on arrival)

### Track A3 — Shopify Editions Spring '26 (platform target deltas)

Captured in [`research/shopify-editions-spring-2026.md`](research/shopify-editions-spring-2026.md). All 216 Spring '26 updates enumerated, with the ~55 developer/extensibility items foregrounded as changes to our **target** vocabulary — new surfaces (agentic commerce / UCP / Catalog API), Functions capabilities (metaobject reads, BXGY prerequisites, billing/PO in validation), admin App-Home-without-backend, POS UI extension APIs (camera/offline/cash), customer-account extensions, theme color palettes + standard storefront events, new Collections API, field-level webhooks. Section 3 of that file lists 10 concrete additions to the gap analysis / roadmap. Because the running workflow's `gap-analysis.md` is scoped to the plugin + audit corpus, these are folded in during the post-workflow regroup.

### Track B — Internal reality audit

**Per-subsystem record schema** (`research/reality/<subsystem>.md`):

| Field | Contents |
|-------|----------|
| `claim` | what the docs/specs say it does (with file + line refs) |
| `reality` | what the code actually does on the live path (with file + line refs) |
| `wired` | `live` / `built-not-wired` / `stub` / `absent` |
| `verdict` | `required` / `not-required` / `already-executed` / `partial` |
| `action` | keep / wire-up / prune / rebuild / document-honestly |

Priority subsystems to audit (from prior exploration — treat as starting set, not exhaustive): flow-automation (DAG engine built, **not on live path**; cron resume, DLQ, rate-limit records have **zero callers**); control-packs (defined, **not wired into generation or rendering**; no `SchemaForm` renderer); `moduleSystemVersion` v1/v2 flag (planning placeholder, changes nothing today); interactive-widget runtime (spin-to-win etc. — **no runtime**, fixed template allowlist); backend data layer (`DataStore.schemaJson` dormant, no export routes); hydrate outputs (`adminConfigSchemaJson`, `themeEditorSettingsJson`, `uiTokensJson` — generated but **never rendered** in v1); blueprints (`BLUEPRINTS_ENABLED`, off by default); extension-eligibility (20 types — verify each type's claimed runtime is real).

### Synthesis (`research/synthesis.md`)

1. **Consolidated settings vocabulary** — union of all Track A `settings_taxonomy` → dedup → candidate control-packs.
2. **Consolidated visual/pattern vocabulary** — the design primitives for phase #2.
3. **Surface × capability matrix** — which plugin archetypes touch which surfaces (feeds #4 composites).
4. **Honest gap analysis** — target vocabulary (A) minus verified current state (B): what's missing, what's already there, what to prune. Ranked by leverage.
5. **Re-planned documentation** — corrections to the canonical docs so they state reality, plus the prioritized target that #2–#4 build from.

## Downstream phases

This phase feeds a decomposed initiative (each gets its own spec → plan → build):

- **#2 Visual/design vocabulary + styling architecture** — deep design tokens, layout/motion primitives; builder-level full control + merchant-facing scoped **Custom CSS** field (storefront surfaces only — Shopify sandboxes checkout/POS). Fixes the #1 pain (shallow visuals).
- **#3 Compositional control-packs** — turn the static recipe into per-type composable packs, wired into generation *and* rendering.
- **#4 Multi-surface composites** — coordinated modules across product page + cart transform + checkout (the bundler).

## Inputs & dependencies

- **User-provided design library** — folds into Track A + phase #2 as a first-class visual-vocabulary source. The one hard external dependency. The plugin study can start without it; the library slots in on arrival.
- Tooling: Shopify App Store + reviews (web), plugin docs, `shopify-dev-mcp` (extension/API grounding), codebase (Track B).

## Execution plan

Run as a single orchestrated workflow (`recipe-vocabulary-study`, run `wf_e03b8f50-e3e`), ~71 agents:

- **Plugins / Design / Reality Audit (concurrent):** ~55 plugin records + 38 design libraries (batched) + 8 code-evidenced reality audits, each agent writing its own file under `research/`.
- **Synthesis wave 1 (parallel):** `settings-vocabulary.md`, `surface-matrix.md`, `design/design-vocabulary.md`.
- **Synthesis wave 2:** `gap-analysis.md` + `re-planned-docs.md` (target − verified current state, ranked by leverage; every roadmap item cites a plugin AND a code file:line).
- **Verify:** completeness critic writes `research/README.md` index + a coverage/gaps report.
- **Hand-off:** `writing-plans` for phase #2 (visual/styling architecture).

## Success criteria

- **SC-001**: ~50 plugin records exist, all conforming to the Track A schema, diverse across the target categories, weighted to top-rated apps.
- **SC-002**: Product bundler deep-dive documents every surface it touches and the coordination between them.
- **SC-003**: Track B audit covers every priority subsystem with `wired`/`verdict`/`action`, each backed by file+line refs — no claim accepted without code evidence.
- **SC-004**: `synthesis.md` delivers all 5 artifacts; the gap analysis is ranked by leverage and cites both A and B.
- **SC-005**: Re-planned documentation corrects at least the known doc-vs-reality gaps (flow engine, control-packs, interactive widgets, data export, hydrate-never-rendered) to match the live path.
- **SC-006**: Output is directly consumable by phase #2 with no re-derivation.

## Risks & open questions

- **Design library timing** — if it arrives late, Track A visual-vocabulary is provisional and revised on arrival. Non-blocking.
- **App Store opacity** — some settings taxonomies aren't fully visible without installing; records mark `confidence` where inferred vs confirmed.
- **Scope creep into the build** — this phase stops at reconciled docs + plan. Building is #2 onward.
