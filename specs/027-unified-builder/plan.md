# Program Plan 027 — Unified Builder, Stabilization, Speed/Accuracy & Spring 2026 Leverage

**Created**: 2026-06-16 · **Status**: DRAFT — awaiting review before execution
**Owner decisions (locked 2026-06-16)**: (1) Build a **new unified Builder surface**; (2) **Stabilize first**, then build; (3) **Remove** the broken create-time coverage/auto-fill.

> Collision note: a second session is editing shared source concurrently. This plan file lives in a **new folder** and touches no shared source. **Execute Phase 0+ in a dedicated git worktree** (or after the other session lands) to avoid the clobber that already dropped some UI wiring once.

## Execution status (2026-07-03) — branch `feat/027-unified-builder`

- ✅ **Phase 0 committed** (`143300f`): removed the broken create-time coverage/auto-fill (it fired a wasted LLM call on every v2 create and could never match); `mustHaveControlsForType` now returns config namespaces; deleted the dead `republishDiff` loader compute. Suites green.
- ✅ **Phase 1 — big discovery + first landing** (`f459b49`): the unified Builder **already exists** as `app/routes/generate._index.tsx` (1079 lines: prompt → generating → choosing → ready, per-concept chat refine, settings, validation tab, blueprints, save/publish, credits). Its one critical flaw: the center preview was a **hardcoded CSS mock** (same fake storefront + add-to-cart bar for every type). **Fixed** — `GenPreview` now renders the real merged recipe through `PreviewService` via `/api/preview` in a sandboxed iframe (all 20 types) with a Function/checkout simulation panel and loading/empty/error/json states. Mock code + dead CSS removed. Preview is now WYSIWYG vs publish.
- Tree state: `tsc` clean in all three packages; web **668 passed / 16 skipped**; core 148; contracts 55.
- Note: a true interactive e2e of the embedded builder needs a dev store + tunnel (the merchant smoke is a no-5xx contract that skips without a running server); the `/api/preview` path it depends on is unit-tested.

**Landed (all green, branch `feat/027-unified-builder`):**
- `143300f` — Phase 0: removed broken coverage/auto-fill; honest `mustHaveControls`; killed dead `republishDiff` compute.
- `f459b49` — Phase 1b: real `PreviewService` preview in a sandboxed iframe for all types + Function simulation; mock + dead CSS removed.
- `ba30bea` — Phase 2 (accuracy slice): 026 deployability preflight surfaced in the Builder validation tab ("Valid — but not publishable yet").
- `fc6905c` — Phase 1c (slice): storefront controls gated to storefront types; non-storefront modules get honest "refine via chat" guidance.
- `f11d910` — plan/status doc.

**Landed 2026-07-03 (the three deferred items, all green, batch/fallback-safe):**
- ✅ **Feature A — stream to first preview** (`0d9ac77`): Builder generates via the SSE `create-module/stream` route so concepts paint as each option validates; the stream route was brought to parity (RAG grounding + live store-palette per option + `blueprint` event); **falls back to the batch route on any stream error**, so never worse than before.
- ✅ **Feature B — config-driven settings** (`84417b1`): non-storefront types now edit the generated `recipe.config`'s real fields (scalars → inputs; structured → chat), not the storefront projection; fixed a latent bug where `mergeSettingsIntoRecipe` overlaid storefront fields onto every type.
- ✅ **Feature C — Spring 2026 `admin.discountUi`** (`d42c9ff`): new Discount UI Extension type wired end-to-end (recipe schema, eligibility `needs_runtime`, compiler AUDIT, dedicated preview renderer, summary, template, regenerated catalog, tests).

**Still remaining (genuinely larger, specced):**
- **2-accuracy — runtime artifact validation.** Add `@shopify/theme-check-node` (Liquid) + Admin GraphQL introspection validation into the `validate` action + publish preflight. New dep; unit-testable per validator.
- **1c-full — SchemaForm on hydrate schema.** Feature B drives settings off the generated config shape; the richer path (hydrate `adminConfigSchemaJson` → `SchemaForm` with widget hints/validation) still needs the hydrate step wired into the create flow.
- **3-more — additional Spring 2026 targets** (App Home / no-backend, Bulk Action Admin Extension) following the `admin.discountUi` pattern; composable color palettes + standard storefront events in generated `theme.section`; Sidekick App Extension distribution.
- Interactive dev-store smoke for the streaming first-paint + non-storefront settings edit flow (both are tsc + unit green and fallback-safe, but the live UX needs eyeballing).

---

## 0. Why this plan

Two things converged:
1. A deep, adversarially-verified review found real defects in the 022–026 wiring, and a redesign refactor silently dropped several of the UI pieces.
2. The product goal sharpened: **one front where a merchant describes what they want and gets it** — matching mainstream AI builders (v0, Lovable, Bolt) and Shopify's own Spring 2026 direction (Sidekick app editing, side-by-side theme+settings editor, agentic commerce).

This plan stabilizes the foundation, then delivers the unified Builder, then raises speed/accuracy, then leverages Spring 2026.

---

## 1. Ground truth (re-verified 2026-07-03, after the parallel "audit-driven repair" pass)

The whole tree is **green**: `tsc --noEmit` clean in all three packages; tests **core 148 · contracts 55 · web 669 passed / 16 skipped**. The concurrent session committed a large repair pass (`3ca5ca7`, `a949bb5`, `0fc5c95`, `a948f1c`) that resolved two of the items this plan originally owned and evolved the publish model.

**Already fixed by the repair pass — remove from our scope:**
- **B2 (026 duplicate `deployedFunctionExtensions`) — DONE.** `publish.service.ts` now imports the canonical `deployed-extensions.server.ts` (manifest ∪ env); the env-only dup is gone, so the default-blocks-all footgun is closed.
- **Assistant double-render — DONE (better design).** `internal.ai-assistant.tsx` was rewritten: a single local `thread` state is the source of truth while streaming; the loader→thread re-sync effect is guarded by `streamingRef` and **replaces** the thread post-stream (`if (streamingRef.current) return; setThread(messagesToThread(data.messages))`). No transient+persisted duplication. Do **not** re-apply the old `streamedAssistantId` patch.
- **Publish model evolved.** `026` preflight is now `deployable | needs_runtime` (the old `gated`/`blocked` split collapsed into `needs_runtime`), and `analytics.pixel` is now **deployable** via a real `WEB_PIXEL_UPSERT` op + `WebPixelService`. Update our terminology accordingly; the gate semantics (never report "published" unless `willDeploy`) are unchanged.

**Still outstanding — our scope:**
- **B1 — 022 coverage vocabulary mismatch (STILL PRESENT).** `mustHaveControlsForType` returns manifest pack **ids** (`content`, `page-targeting`, `frequency-cap`); the generated `theme.section` config is a **bespoke schema** (`kind, activation, title, subtitle, fields, blocks, audience?, schedule?, advancedCustom?`) that never uses control-pack composition (`composeConfig` is admin-form-only). Coverage compares disjoint vocabularies → never "complete" → on v2, auto-fill fires a wasted `modifyRecipeSpec` call on every create that can never match. **Decision: remove** (keep RequirementSpec + RAG grounding + `startFrom`). Re-verify the root cause at execution — the repair pass may have shifted files.
- **Lost 024/025 UI (STILL LOST).** `modules.$moduleId.tsx` still computes `republishDiff` in the loader but never renders it (dead compute); the **Fill-missing** and **simulation** actions are unreachable. Per §3, these **fold into the Builder**; in the interim, either render or delete the dead compute (no orphaned code — YC bar).

**Refuted (leave as-is):** "cost attribution does 2 redundant DB reads" (two different tables); "025 needs a dedicated simulate endpoint" (no per-toggle re-POST problem exists in the shipped code).

---

## 2. Phase 0 — Reconcile & stabilize (do first, isolated worktree)

Small, surgical, green-gated. Scope shrank after the repair pass (B2 + double-render already done). Each item lands atomically.

- **0.1 Remove B1 (022 coverage/auto-fill).** In `api.ai.create-module.tsx`: delete the coverage computation, the v2 auto-fill block, and now-unused imports (`fillMissingSettings`, `modifyRecipeSpec`, `SettingsService`, `computeCoverageReport`, unused types). **Keep** `RequirementSpec` extraction, `searchSolutions` grounding, and `startFrom` in the response (useful and free). Drop `coverage`/`autoFilled` from the response. Update `requirement-search-generation.test.ts` (remove the auto-fill composition test; keep extraction + grounding tests). Fix `mustHaveControlsForType` to return pack **namespaces** (`getPack(id).namespace`) so `RequirementSpec.mustHaveControls` is internally honest for any future consumer. "Fill missing" lives only post-hydrate (024), where the hydrate admin schema is the aligned vocabulary.
- **0.2 Kill the dead `republishDiff` compute (no orphaned code).** `modules.$moduleId.tsx` computes `republishDiff` in the loader but never renders it. Since the Builder (§3) will own the publish surface, **remove the loader compute + return field now** to keep the tree clean; the diff logic (`computeRepublishDiff`) is reused in the Builder's publish bar (§3.1). (If we decide to keep the module-detail page as a long-lived fallback, render it instead — but default is remove.)
- **0.3 Fold the lost UI into the Builder, not the old page.** Fill-missing action + simulation panel are rebuilt in the Builder (§3), which supersedes create→detail. Do **not** re-patch `modules.$moduleId.tsx` for these. The assistant double-render is already fixed — nothing to do.
- **Gate:** `tsc --noEmit` + `vitest run` green in `apps/web`, `packages/core`, `packages/platform-contracts`; `pnpm --filter web evals` ≥ 0.9. Commit atomically on a worktree branch.

**Acceptance 0:** no wasted LLM call on create; no dead/unrendered compute; `RequirementSpec.mustHaveControls` uses namespaces; all suites + evals green; `git status` shows only intended changes.

---

## 3. Phase 1 — The unified Builder (`/build`)

**North star:** one surface, four moves, progressive disclosure — **Describe → Preview → Refine → Publish** — collapsing today's `create → pick option → detail → hydrate → publish` into a single flow. Model: v0/Lovable/Bolt chat-to-live-preview, plus Shopify's Spring 2026 side-by-side theme+settings editor and Sidekick app editing.

### 1.1 Layout (Polaris, per DESIGN.md)
- **Left rail — Intent/Chat:** prompt box; conversation of refinements ("make the CTA bolder", "trigger on scroll"); shows classification, confidence, and `startFrom` grounding suggestions.
- **Center — Live preview:** streaming `PreviewService` render in the sandboxed iframe; tabs for the 3 approach variants (Conservative/High-conversion/Targeted); Function/checkout modules show the **simulation panel** (currency/country/Plus) inline.
- **Right rail — Settings:** `SchemaForm` bound to the hydrate admin schema; **Fill-missing** and **Regenerate** actions; validation report; a completeness indicator driven by the *hydrate schema* (aligned), not manifest packs.
- **Top/footer — Publish bar:** plan/capability status, **republish-diff preview**, the honest **needs_runtime** preflight, one Publish action.

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
4. Publish bar: preflight gate, republish-diff, needs_runtime messaging.
5. Persistence + version history + rollback; deep-link back-compat from the old routes (redirect create/detail → Builder).

**Acceptance 1:** A merchant can go prompt → live preview → tweak (settings + chat + simulation) → publish **without leaving `/build`**; every old capability (hydrate, fill-missing, republish-diff, gate, rollback) is reachable inline; DESIGN.md-compliant; e2e smoke for `theme.section`, a Function, a checkout block.

---

## 4. Phase 2 — Speed & accuracy

**Accuracy**
- **Runtime pre-publish validation gate** (extends 026 preflight): validate generated Liquid via `@shopify/theme-check-node`; validate Admin GraphQL via schema introspection; validate admin/Polaris components. Fail loudly, same channel as needs_runtime.
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
- Loading/streaming (skeletons + token streaming to first preview), empty (first-run guidance), error (typed, actionable — provider-not-configured → setup CTA, rate-limited → retry, needs_runtime → clear reason), success, and offline/timeout. No spinners-forever; respect the Cloudflare ~60s budget.

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
