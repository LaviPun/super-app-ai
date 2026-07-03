# Program Plan 027 — Unified Builder, Stabilization, Speed/Accuracy & Spring 2026 Leverage

**Created**: 2026-06-16 · **Status**: DRAFT — awaiting review before execution
**Owner decisions (locked 2026-06-16)**: (1) Build a **new unified Builder surface**; (2) **Stabilize first**, then build; (3) **Remove** the broken create-time coverage/auto-fill.

> Collision note: a second session is editing shared source concurrently. This plan file lives in a **new folder** and touches no shared source. **Execute Phase 0+ in a dedicated git worktree** (or after the other session lands) to avoid the clobber that already dropped some UI wiring once.

---

## 0. Why this plan

Two things converged:
1. A deep, adversarially-verified review found real defects in the 022–026 wiring, and a redesign refactor silently dropped several of the UI pieces.
2. The product goal sharpened: **one front where a merchant describes what they want and gets it** — matching mainstream AI builders (v0, Lovable, Bolt) and Shopify's own Spring 2026 direction (Sidekick app editing, side-by-side theme+settings editor, agentic commerce).

This plan stabilizes the foundation, then delivers the unified Builder, then raises speed/accuracy, then leverages Spring 2026.

---

## 1. Ground truth (verified 2026-06-16)

**Intact & working (server/route/service layer):**
- 022 `api.ai.create-module.tsx`: RequirementSpec extraction + RAG grounding + (broken) coverage/auto-fill.
- 024 `api.ai.fill-settings.tsx` route + `buildFillMissingDiff` + `republishDiff` **loader compute**.
- 025 `api.preview.tsx` simulation server (validated `PreviewSimulationInputSchema`).
- 026 `publish.service.ts` gate (`ModuleNotPublishableError`) + `metaobject.service.ts getFunctionConfigByKey`.
- `llm.server.ts` grounding threading + `servedProviderId`/`attributeServedCost` (currently the only dirty working-tree file).

**Lost when the Merchant Dashboard redesign refactored components:**
- 024 UI: **Fill-missing button** and **republish-diff panel** (loader computes `republishDiff`, `ModuleDetailBody` never renders it).
- 025 UI: **Function simulation panel**.
- Assistant **double-render fix** (`streamedAssistantId`) in `internal.ai-assistant.tsx`.

**Confirmed bugs (adversarially verified):**
- **B1 — 022 coverage vocabulary mismatch.** `mustHaveControlsForType` returns manifest pack **ids** (`content`, `page-targeting`, `frequency-cap`); the generated `theme.section` config is a **bespoke schema** (`kind, activation, title, subtitle, fields, blocks, audience?, schedule?, advancedCustom?`) that never uses control-pack composition (`composeConfig` is admin-form-only). Coverage compares disjoint vocabularies → never "complete" → on v2, auto-fill fires a wasted `modifyRecipeSpec` call on every create that can never match. **Decision: remove.**
- **B2 — 026 duplicate `deployedFunctionExtensions()`.** Canonical `deployed-extensions.server.ts` returns *manifest ∪ env* (detects handles actually built in `extensions/`). `publish.service.ts` re-implements an **env-only** version that defaults empty → **blocks all Function publishes by default**. **Decision: use the canonical helper, delete the dup.**

**Refuted (leave as-is):** "cost attribution does 2 redundant DB reads" (two different tables); "025 needs a dedicated simulate endpoint" (no per-toggle re-POST problem exists in the shipped code).

---

## 2. Phase 0 — Reconcile & stabilize (do first, isolated worktree)

Small, surgical, green-gated. Each item lands atomically.

- **0.1 Fix B2 (026 dup).** In `publish.service.ts`, delete the private `deployedFunctionExtensions()` and import the canonical one from `services/publish/deployed-extensions.server.ts`. Verify `publish-functions-reliability.test.ts` still green; add a case asserting a manifest-declared handle is deployable with an empty env var.
- **0.2 Remove B1 (022 coverage/auto-fill).** In `api.ai.create-module.tsx`: delete the coverage computation, the v2 auto-fill block, and the now-unused imports (`fillMissingSettings`, `modifyRecipeSpec`, `SettingsService`, `computeCoverageReport`, unused types). **Keep** `RequirementSpec` extraction, `searchSolutions` grounding, and `startFrom` in the response (these are useful and free). Drop `coverage`/`autoFilled` from the response. Update `requirement-search-generation.test.ts` (remove the auto-fill composition test; keep extraction + grounding tests). Fix `mustHaveControlsForType` to return pack **namespaces** (resolve each id via `getPack(id).namespace`) so the `RequirementSpec.mustHaveControls` field is at least internally honest for any future consumer. Note: "fill missing" now lives only post-hydrate (024), where the hydrate admin schema is the aligned vocabulary.
- **0.3 Re-apply lost UI + double-render fix — but only if the current pages survive Phase 1.** Since Phase 1 replaces the create→detail flow with the Builder, **fold** the fill-missing action, republish-diff panel, and simulation panel **into the Builder** rather than re-patching `modules.$moduleId.tsx`. Exception: re-apply the **assistant double-render fix** now (it's an independent surface, `internal.ai-assistant.tsx`) — clear the transient bubble when the persisted message id lands in revalidated loader data. If we keep the module-detail page as a fallback, re-apply its three UI bits there too.
- **0.4 Commit `llm.server.ts`.** Verify the cost-attribution + grounding threading is coherent and green, then commit it with the Phase 0 fixes.
- **Gate:** `tsc --noEmit` + `vitest run` green in `apps/web`, `packages/core`, `packages/platform-contracts`. Commit on a branch off `master` (or the redesign branch tip, coordinated with the other session).

**Acceptance 0:** No wasted LLM call on create; Function publishes work when the extension is built; republish-diff + fill-missing + simulation reachable from *some* surface; assistant renders once; all suites green.

---

## 3. Phase 1 — The unified Builder (`/build`)

**North star:** one surface, four moves, progressive disclosure — **Describe → Preview → Refine → Publish** — collapsing today's `create → pick option → detail → hydrate → publish` into a single flow. Model: v0/Lovable/Bolt chat-to-live-preview, plus Shopify's Spring 2026 side-by-side theme+settings editor and Sidekick app editing.

### 1.1 Layout (Polaris, per DESIGN.md)
- **Left rail — Intent/Chat:** prompt box; conversation of refinements ("make the CTA bolder", "trigger on scroll"); shows classification, confidence, and `startFrom` grounding suggestions.
- **Center — Live preview:** streaming `PreviewService` render in the sandboxed iframe; tabs for the 3 approach variants (Conservative/High-conversion/Targeted); Function/checkout modules show the **simulation panel** (currency/country/Plus) inline.
- **Right rail — Settings:** `SchemaForm` bound to the hydrate admin schema; **Fill-missing** and **Regenerate** actions; validation report; a completeness indicator driven by the *hydrate schema* (aligned), not manifest packs.
- **Top/footer — Publish bar:** plan/capability status, **republish-diff preview**, the honest **gated/blocked** preflight, one Publish action.

### 1.2 Reuse (no new generation/publish engines)
| Need | Reuse |
|---|---|
| Stream options as they generate | `generateValidatedRecipeOptionsStream` + `api.ai.create-module.stream.tsx` |
| Live preview + simulation | `PreviewService.render`, `api.preview.tsx` (`PreviewContext.simulation`) |
| Settings form | `SchemaForm.tsx`, `buildAdminFormConfig`, hydrate `adminConfigSchemaJson` |
| Refine via chat | `modifyRecipeSpec` / `modifyRecipeSpecOptions`, `api.ai.modify-module.tsx` |
| Fill missing / regenerate | `api.ai.fill-settings.tsx` |
| Save draft version | `api.modules.$moduleId.spec.tsx` (`createNewVersion`) |
| Publish + gate + diff | `api.publish.tsx`, `PublishService`, `computeRepublishDiff` |

### 1.3 Build sub-steps
1. Route + shell `/build` (and `/build/$moduleId` for editing an existing draft); wire streaming generate → preview.
2. Right-rail settings (SchemaForm) with live-preview updates (debounced re-render via `api.preview`).
3. Chat-refine loop (modify) + variant tabs + "start from" grounding.
4. Publish bar: preflight gate, republish-diff, gated/blocked messaging.
5. Persistence + version history + rollback; deep-link back-compat from the old routes (redirect create/detail → Builder).

**Acceptance 1:** A merchant can go prompt → live preview → tweak (settings + chat + simulation) → publish **without leaving `/build`**; every old capability (hydrate, fill-missing, republish-diff, gate, rollback) is reachable inline; DESIGN.md-compliant; e2e smoke for `theme.section`, a Function, a checkout block.

---

## 4. Phase 2 — Speed & accuracy

**Accuracy**
- **Runtime pre-publish validation gate** (extends 026 preflight): validate generated Liquid via `@shopify/theme-check-node`; validate Admin GraphQL via schema introspection; validate admin/Polaris components. Fail loudly, same channel as gated/blocked.
- **Dev-time grounding & evals:** use the **Shopify Dev MCP** (`search_docs_chunks`, `validate_theme`, `validate_graphql_codeblocks`, `validate_component_codeblocks`) in the eval harness and to enrich `MODULE_TEMPLATES` grounding offline (Dev MCP is a build/dev tool, not a runtime dependency).
- **Coverage, done right:** completeness measured against the **hydrate admin schema properties** (the vocabulary that matches `spec.config`), surfaced in the Builder right rail; "fill missing" already aligns there.

**Speed**
- Remove wasted calls (B1 already gone); read the engine/settings flags **once** per request; cache provider/settings reads.
- Stream generation to **first visible preview** ASAP; render variants progressively.
- Keep every generative handler under the Cloudflare ~60s budget (per memory); never bundle.

**Acceptance 2:** invalid Liquid/GraphQL/components cannot be published; measured create-to-first-preview latency drops; eval schema-validity ≥ 0.9 maintained.

---

## 5. Phase 3 — Shopify Spring 2026 leverage (incremental)

Grounded in the Spring 2026 edition + changelog (agentic + AI-everywhere).

- **New generation targets** (extend `RECIPE_SPEC_TYPES` + compiler + Builder): **Discount UI Extensions** (admin UI for `functions.discountRules`), **App Home UI Extension / "no-backend" apps**, **Bulk Editing (Admin Action) Extensions**; expand `customerAccount.*` (subscription payment-method replacement, Customer Account web component).
- **Functions enhancements** in the compiler: **metaobject data in checkout Functions** (first-class blessing of the 026 two-layer config metaobject), billing-address & PO inputs, discount **prerequisites**.
- **Publish path**: adopt **scopeless app-owned metaobjects** + the **streamlined Metaobjects GraphQL**; wire **safer deploys / app automation tokens** for the wasm layer; **enhanced event control** (field-scoped webhooks) into the flow/webhook catalog.
- **Theme generation**: emit the **composable color-palette** system and **standard storefront events/actions** so generated `theme.section` modules are agent- and app-interoperable; align with existing live-store-aesthetic palette extraction.
- **Distribution / agent surface**: expose the Builder as a **Sidekick App Extension**; make generated modules **agent-ready** (Catalog/Universal Commerce Protocol awareness); adopt the **Shopify AI Toolkit + Dev MCP** in dev.

**Acceptance 3:** at least the top 2 new extension types generate → preview → publish end-to-end; Function compiler uses metaobject inputs; one agent-readiness affordance shipped.

---

## 6. Sequencing, milestones, risk

**Order:** Phase 0 (stabilize) → Phase 1 (Builder) with Phase 2 accuracy/speed interleaved as the Builder consumes them → Phase 3 leverage incrementally.

**Milestones:** M0 green stabilized tree · M1 Builder MVP (prompt→preview→publish) · M2 Builder full parity (settings/chat/simulation/diff/rollback) · M3 validation gate + speed · M4 first Spring 2026 extension type live.

**Risks & mitigations:**
- *Concurrent-session collisions* → execute in a **git worktree**; coordinate on `modules.$moduleId.tsx`, `internal.ai-assistant.tsx`, `llm.server.ts`. Re-verify ground truth at the start of execution (files may have moved again).
- *Builder scope creep* → strict MVP (M1) before parity (M2); reuse-only, no new engines.
- *Dev MCP vs runtime* → Dev MCP is dev/eval-time; ship runtime validation via theme-check libs.
- *Spring 2026 preview features* (e.g. new Hydrogen) → treat as watch-list, don't build on preview.

**Docs to sync on execution:** master index (`specs/000-platform-v2-master/spec.md`), `docs/module-system-v2.md`, `docs/ai-providers.md`, `docs/shopify-dev-setup.md`, and mark 022/024/025/026 tasks reflecting the Builder consolidation + B1/B2 fixes.

---

## 7. Definition of Done — YC-grade, fully working, clean

Ship as if a YC company's flagship product depends on it. Every phase must clear this bar before it's "done":

**Actually works (no demos, no dead ends)**
- Real end-to-end: prompt → generate → preview → settings → publish verified on a dev store for `theme.section`, a Function, and a checkout block. No placeholder data — real data or an honest empty state (repo already purged `placeholder-data.ts`; keep it that way).
- Every button does something; every failure has a visible, recoverable state.

**Every UI state designed** (Builder especially)
- Loading/streaming (skeletons + token streaming to first preview), empty (first-run guidance), error (typed, actionable — provider-not-configured → setup CTA, rate-limited → retry, gated/blocked → clear reason), success, and offline/timeout. No spinners-forever; respect the Cloudflare ~60s budget.

**Clean code**
- No dead/duplicate/residual code (B2 is exactly this class); remove the old create/detail paths once the Builder replaces them (redirect, don't orphan). No commented-out blocks, no unused exports.
- Reuse-only for generation/preview/publish; one source of truth per concern (e.g. one `deployedFunctionExtensions`).
- Reads like the surrounding code: Polaris-first, DESIGN.md tokens, matched naming/idiom.

**Correctness & safety**
- Escape-hatch HTML/JS stays sanitized + CSP-bound + sandboxed-iframe only. Trust-boundary/prompt-injection envelope preserved (023). Publish never reports "published" unless it deployed (026).
- Idempotent publish/republish; no duplicate metaobjects.

**Tested & green**
- `tsc --noEmit` + `vitest run` green in `apps/web`, `packages/core`, `packages/platform-contracts`. New logic has unit tests; the Builder has an e2e smoke (`/browse`).
- `pnpm --filter web evals` ≥ 0.9 schema validity; regenerate catalog if manifests change.

**Accessible & polished**
- Keyboard-navigable, ARIA-labelled, focus states, color-contrast (DESIGN.md). Responsive; no horizontal page scroll. Design-QA gate satisfied.

**Observable**
- AI usage/cost recorded with correct provider attribution; publish + generation emit activity logs; errors are logged with enough context to debug.

**Reviewed**
- Runs through `/review` (trust-boundary, SQL, conditional side-effects) and a design pass before merge; adversarially self-verified like this review was.
