# Reality Audit — Control Packs + Generation Wiring

Subsystem: `packages/core/src/control-packs/*`, the AI generation prompt path, and the admin settings UI (`SchemaForm`, `ConfigEditor`, `StyleBuilder`).
Method: traced the *live* path — who actually calls what — and separated "a file/type/flag exists" from "it runs in production".

## Re-audit delta (2026-07-03, HEAD 4f056da)

Re-run against branch `feat/027-unified-builder` @ HEAD `4f056da` (prior audit was `feat/superapp-redesign` @ `a948f1c`). The `packages/core/src/control-packs/` directory, `ConfigEditor.tsx`, `SchemaForm.tsx`, and `StyleBuilder.tsx` were **untouched** since the prior audit (`git diff a948f1c HEAD -- packages/core/src/control-packs` and the three components: empty). The changes that touched this subsystem's surface are all in `recipe.ts` (+30), `allowed-values.ts` (+8), `generate._index.tsx` (+378), `modules.$moduleId.tsx` (+28), and `requirement-spec.server.ts` (+9).

The commit that the recheck flagged as possibly wiring config rendering — 84417b1 "config-driven settings for non-storefront modules" — does **NOT** touch control-packs, `composeConfig`, `ConfigEditor`, or `SchemaForm`. It adds a bespoke scalar-field form (`GenConfigControls`, `generate._index.tsx:1090-1127`) that reads top-level scalars off `recipe.config` directly. `recipe.ts` (+30) is the new `admin.discountUi` discriminated-union branch (`recipe.ts:357-380`), **not** new pack pins. `allowed-values.ts` (+8) is `admin.discountUi` registry rows. None of it advances the pack composer toward the live path.

Prior findings, current status:

- **#1 (only 3/10 packs pinned into `RecipeSpecSchema`, by import not derivation): STILL-OPEN.** Unchanged. `recipe.ts:8-10` imports `AudiencePackSchema`/`SchedulePackSchema`/`AdvancedCustomPackSchema`; `recipe.ts:139-142` pins them `.optional()` onto `theme.section`. The other 7 packs still never touch the schema.
- **#2 (`composeConfig` has no production caller building the recipe schema): STILL-OPEN.** `grep composeConfig` outside `__tests__`/`control-packs/`/`.test` returns **nothing** in `apps/web/app` and `packages/core/src` (only `admin-form.server.ts`, itself off-by-default). No new caller.
- **#3 (LLM JSON Schema built from `RecipeSpecSchema`, no pack imports): STILL-OPEN.** Unchanged; the builder route imports `RecipeSpecSchema` (`generate._index.tsx:4`) and zero pack symbols.
- **#4 (`requirement-spec` derives a *name list*, live, `theme.section`-only): STILL-OPEN / CHANGED (refined).** Still live and unconditional on create-module (`api.ai.create-module.tsx:106`). `mustHaveControlsForType` now maps pack ids → **config namespaces** via `getPack(id)?.namespace` (`requirement-spec.server.ts:35-41`) instead of raw manifest ids — a correctness refinement (commit 143300f "honest mustHaveControls"), but still names-only, still empty for every type except `theme.section`.
- **#5 (`SchemaForm` is built-not-wired; fires only under off-by-default v2): CHANGED — now WORSE for control-packs, but `SchemaForm` gained an unrelated live caller.** `ConfigEditor` (which is the only thing that mounts `SchemaForm` under the v2 branch) is now **imported but never rendered** in `modules.$moduleId.tsx` — there is **no `<ConfigEditor` JSX anywhere in the app** (`grep -rn "<ConfigEditor" apps/web/app` → empty). Separately, `SchemaForm` gained a genuinely-live second caller in `data.$storeKey.tsx:168`, but it's driven by a store's backend-data `schemaJson` model (`parseDataModel`, line 36), **not** by any control-pack.
- **#6 (`adminConfigSchemaJson` rendered — but by `ConfigEditor`, not control-packs): CHANGED.** The `modules.$moduleId.tsx` loader still parses `adminConfigSchemaJson` into `adminConfig` (`:142-146`) and computes `v2Form` (`:212-220`), but **neither is rendered** — the 'settings' tab now shows only name/notes/delete (`:660-673`). So on the live builder path (`generate._index.tsx`) the hydrate `adminConfigSchemaJson` is **not** rendered at all; the builder's non-storefront form reads `recipe.config` scalars directly. This was "live via ConfigEditor" before; it is now effectively **dead on the primary surface**.
- **#7 (StyleBuilder/ConfigEditor not driven by packs; still the disconnected hardcoded maps): STILL-OPEN, and both now fully unmounted.** `grep -rn "<StyleBuilder" apps/web/app` → empty; `<ConfigEditor` → empty. Neither imports control-packs. The new live editor `GenControls` (`generate._index.tsx:1129-1183`) is another hand-written storefront-projection form — a fourth disconnected place, unchanged in spirit.
- **#8 (`presets.ts` `getPresetsForType`/`listV2Presets` have no production caller): STILL-OPEN.** `grep` for both names outside `presets.ts`/tests → empty. Unchanged.
- **#9 (v2 flag exists, defaults `'v1'`, v2 dormant): STILL-OPEN.** `settings.service.ts:71` default `'v1'`; coerced to `'v1'` unless the DB column literally holds `'v2'` (`:103,196`). Unchanged.

New findings:

- **N1 — The live builder moved from `modules.$moduleId.tsx` to `generate._index.tsx`, and it uses none of this subsystem.** Editing flows through `GenControls`/`GenConfigControls` (`generate._index.tsx:1090-1183`), which read/write `recipe.config` scalars directly. Zero references to `composeConfig`, `control-pack`, `PackSchema`, `ConfigEditor`, or `SchemaForm` in the entire 1275-line file (`grep -c` → 0).
- **N2 — `ConfigEditor`, `StyleBuilder`, `v2Form`, and the parsed `adminConfig` are now dead/unrendered.** `ConfigEditor` and `StyleBuilder` are imported by `modules.$moduleId.tsx` / referenced by API routes but never mounted as JSX. `v2Form` is still computed in the loader (`:212-220`) and passed in the JSON payload but consumed by nothing.
- **N3 — `admin.discountUi` (new type) does not use control-packs either.** Its config shape is a hand-written Zod object in `recipe.ts:361-379`; it compiles to `AUDIT` (`compiler/index.ts:55-57`) and is `runtimeShipped:false` (`extension-eligibility.ts:191-197`). It confirms the pattern: new module types keep getting hand-written config schemas, bypassing the pack composer entirely.

Net delta: **0 fixed / 9 still-open (2 changed for the worse).** The subsystem regressed relative to its docs: what was "built-not-wired behind a default-off flag" is now additionally "the components that fronted it are no longer mounted at all," because the live editing surface was rewritten as a separate builder that reads `recipe.config` directly.

---

**One decisive fact frames the whole subsystem:** the entire control-pack *composition* engine (`composeConfig` → JSON Schema → `SchemaForm`) is gated behind `moduleSystemVersion === 'v2'`, which **defaults to `'v1'`** (`settings.service.ts:71`, coerced to `'v1'` unless the DB column literally says `'v2'` at lines 103, 196). In the default production configuration the composer path does not execute — and as of HEAD the components that would render it (`ConfigEditor`, `SchemaForm` via ConfigEditor) are no longer mounted anywhere. What still runs on the default path is narrow: (a) three pack schemas embedded directly in `RecipeSpecSchema`, and (b) `requirement-spec.server.ts` deriving a `mustHaveControls` name list. The hydrate `adminConfigSchemaJson` rendering that was previously live via `ConfigEditor` is no longer rendered on the primary builder surface.

---

## Claim-by-claim

### 1. "A ControlPack's Zod `schema` is the single source of truth; everything downstream (per-type config schema, LLM JSON Schema, admin form, prompt guidance, preview inputs) is derived from it."
- **Claim:** `packages/core/src/control-packs/types.ts:4-7`; `docs/module-system-v2.md:13,49,57,64`.
- **Reality:** Only **3 of 10** registered packs are wired into the recipe schema, and even those are hand-referenced, not "derived." `recipe.ts:8-10,139-142` imports and pins `AudiencePackSchema`/`SchedulePackSchema`/`AdvancedCustomPackSchema` `.optional()` onto the `theme.section` config. The other 7 packs (content, style, trigger, page-targeting, frequency-cap, countdown, behavior) never touch `RecipeSpecSchema`. The `theme.section` config's real controls (title, subtitle, kind, activation, fieldSchema, blocks) are hand-written flat fields (`recipe.ts:120-146`). The newest type, `admin.discountUi` (`recipe.ts:357-380`), is likewise a hand-written config object with no pack involvement. So packs are not the source of truth; `recipe.ts` is.
- **wired:** `built-not-wired` (7/10 packs unreferenced outside tests; 3/10 partially pinned)
- **verdict:** `partial`
- **action:** `document-honestly`

### 2. "The per-type config schema is derived from packs via `composeConfig`."
- **Claim:** `packages/core/src/control-packs/compose.ts:1-12`; `module-manifests.ts:1-4`.
- **Reality:** `composeConfig` / `composeConfigSchema` still have **no production caller** producing the recipe schema. Callers: `control-packs.test.ts` and `admin-form.server.ts:37` (builds the admin form only, under the v2 flag). `recipe.ts` does not import `composeConfigSchema`. Grep for `composeConfig` across `apps`/`packages` outside tests/`control-packs/` returns nothing. Only `theme.section` has a manifest (`module-manifests.ts:13-20`).
- **wired:** `built-not-wired`
- **verdict:** `partial`
- **action:** `wire-up` or `document-honestly`

### 3. "The pack schema feeds the LLM structured-output JSON Schema / the AI prompt."
- **Claim:** `module-system-v2.md:64`; `control-packs/types.ts:6`.
- **Reality:** The generation JSON Schema is built from `RecipeSpecSchema` (`recipe-json-schema.server.ts:2,191,206`), which imports no control-pack symbol. The builder route imports `RecipeSpecSchema` (`generate._index.tsx:4`) and zero pack symbols. Packs reach the prompt only transitively through the 3 schemas pinned in `recipe.ts` (item 1); the other 7 never influence the prompt.
- **wired:** `stub` (indirect for 3 packs via recipe.ts; `absent` for the other 7)
- **verdict:** `partial`
- **action:** `document-honestly`

### 4. "`requirement-spec.server.ts` derives required controls from the control-pack manifest, on the live create-module path."
- **Claim:** `apps/web/app/services/ai/requirement-spec.server.ts:4-8,26-41`.
- **Reality:** **Genuinely live.** `api.ai.create-module.tsx:106` calls `extractRequirementSpec(...)` unconditionally (no v2 flag). It reaches `mustHaveControlsForType` → `getManifest` + `getPack`. Refined since the prior audit: it now returns each pack's **config namespace** (`getPack(id)?.namespace ?? id`, `requirement-spec.server.ts:35-41`) rather than raw manifest ids, so the name list matches spec `config` keys. Still names-only (never the Zod schema/fields), and still returns `[]` for every type except `theme.section` (the sole manifest). The list flows into `requirementSpec` and `searchSolutions` for template grounding; it does not shape the generation schema or enforce pack contents.
- **wired:** `live` (low-value: pack namespaces only, `theme.section` only)
- **verdict:** `already-executed`
- **action:** `keep`

### 5. "SchemaForm renderer exists and consumes the hydrate `adminConfigSchemaJson`."
- **Claim:** `module-system-v2.md:132-134,153`; `apps/web/app/components/SchemaForm.tsx:1-13`.
- **Reality:** `SchemaForm.tsx` is a real, complete generic `{jsonSchema, uiSchema, defaults}` → Polaris renderer (untouched since the prior audit). But it is **not** wired to the hydrate envelope on any path. Its only mounts are: (a) inside `ConfigEditor`'s `useV2` branch (`ConfigEditor.tsx:459`), which requires `engine==='v2'` **and** a `composeConfig`-built `v2Form` — and `ConfigEditor` is **now never rendered anywhere** (`grep -rn "<ConfigEditor" apps/web/app` → empty); and (b) `data.$storeKey.tsx:168`, which is live but driven by a store's backend-data `schemaJson` model (`parseDataModel`, line 36), not by control-packs and not by the hydrate `adminConfigSchemaJson`. So the doc's specific claim is false on every path.
- **wired:** `built-not-wired` for control-packs (the ConfigEditor mount is gone); `live` only for the unrelated backend-data record form
- **verdict:** `partial`
- **action:** `document-honestly`

### 6. "`adminConfigSchemaJson` is rendered."
- **Claim:** `module-system-v2.md:9,134`.
- **Reality:** **No longer rendered on the primary surface.** It is still written at hydrate time (`api.ai.hydrate-module.tsx:99`), persisted on `RecipeVersion.adminConfigSchemaJson`, and parsed into `adminConfig` by the `modules.$moduleId.tsx` loader (`:142-146`) — but nothing renders it: the module 'settings' tab shows only name/notes/delete (`:660-673`), and `ConfigEditor` (its former renderer) is unmounted. The live builder (`generate._index.tsx`) never reads `adminConfigSchemaJson`; its non-storefront form reads `recipe.config` scalars directly (`GenConfigControls`, `:1090-1127`). So this regressed from "live via ConfigEditor" to "generated, persisted, but unrendered."
- **wired:** `built-not-wired` (generated + persisted + parsed; consumed by nothing on the live path)
- **verdict:** `partial`
- **action:** `wire-up` or `document-honestly`

### 7. "ConfigEditor / StyleBuilder are folded into / driven by the control-pack pattern."
- **Claim:** `module-system-v2.md:9,15,41-43`.
- **Reality:** `StyleBuilder.tsx` has zero control-pack dependency (imports `StorefrontStyle` + `normalizeStyle`, edits `spec.style` directly) and `stylePack` is never imported by it. `ConfigEditor.tsx` keeps its hand-written `CONFIG_FIELDS` map plus its own dynamic-field extractor. Both are now **fully unmounted** — no `<ConfigEditor` or `<StyleBuilder` JSX anywhere in `apps/web/app`. The live editing form is a third/fourth hand-written place (`GenControls`, `generate._index.tsx:1129-1183`; `GenConfigControls`, `:1090-1127`), also with no pack involvement. The "four disconnected places" the packs were meant to unify remain disconnected — and the two the docs named are now dead code.
- **wired:** `absent` (control-packs → StyleBuilder / ConfigEditor); both components unmounted
- **verdict:** `not-required` for the default path / `partial` as a migration
- **action:** `document-honestly` (and consider pruning the unmounted ConfigEditor/StyleBuilder + dead `v2Form` loader code)

### 8. "Presets: 145 templates collapse to a curated handful per type via the pack presets layer."
- **Claim:** `control-packs/presets.ts:1-10`; `module-system-v2.md:180`.
- **Reality:** Unchanged. `presets.ts` wraps `MODULE_TEMPLATES`; `getPresetsForType`/`listV2Presets` have no production caller (grep outside `presets.ts`/tests → empty).
- **wired:** `built-not-wired`
- **verdict:** `not-required`
- **action:** `prune` or `wire-up`

### 9. "Old and new paths run side-by-side behind a flag so we can compare which is better."
- **Claim:** `module-system-v2.md:13,153`.
- **Reality:** The `moduleSystemVersion` flag exists (`settings.service.ts:31`), defaults `'v1'`, and `modules.$moduleId.tsx:212-220` still computes `v2Form` off it — but the v2 branch's renderer (`ConfigEditor`) is no longer mounted, so even flipping the flag renders nothing new on that route. The "comparison" is now vestigial: the v1 path was superseded by the standalone builder (`generate._index.tsx`), and the v2 path is dead loader code.
- **wired:** `built-not-wired` (flag + `v2Form` computed but unrendered)
- **verdict:** `partial`
- **action:** `document-honestly` (v2 is default-off *and* now unrenderable); `prune` the dead branch

---

## Bottom line

Zero of the prior findings are fixed; the control-pack composer is still dark on the default path, and it regressed — the `ConfigEditor`/`StyleBuilder` components that used to front it are now imported-but-never-mounted, the live editor moved to a standalone builder (`generate._index.tsx`) that reads `recipe.config` scalars directly with no pack/`composeConfig`/`adminConfigSchema` involvement, and the hydrate `adminConfigSchemaJson` is generated-and-persisted but no longer rendered anywhere; only the `requirement-spec` pack-*namespace* list (theme.section-only) remains genuinely live.
