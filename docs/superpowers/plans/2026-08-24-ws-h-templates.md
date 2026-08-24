# WS-H Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the template library honest and lean: the Theme-App-Extension Liquid aggregate has real headroom (≤95,000 B, not living at 99.6% of the hard 100,000 B wall); template installs match the merchant's real store aesthetic instead of shipping 48 hardcoded demo palettes; storefront installs never render a broken image pointing at `cdn.example.com`; the render-pack story told in code matches the one told in `module-design-system.md`; the 575-template library's 121 near-duplicate copy-variants stop diluting RAG ranking and merchant browse; and a real preview⇄Liquid parity fixture proves the deterministic preview a merchant sees is not lying to them about what the storefront will render.

**Architecture:** No new services. This plan edits three things: (1) the TAE Liquid source under `apps/web/theme-extension-src/liquid/` (built by `scripts/build-theme-liquid.mjs` into `extensions/theme-app-extension/`), where a new shared placeholder-media snippet both fixes the broken-image bug and reclaims bytes; (2) the template library under `packages/core/src/templates/`, where a codemod strips hardcoded full-palette overrides, remaps the 3 pack-outlier files, batch-tags tiers, and dedupes copy-variant clusters; (3) the install path (`apps/web/app/routes/api.modules.from-template.tsx`), which gains the same `ensureStoreAesthetic` call the AI-generation path already has. A new `packages/core` structural-duplicate script and a new `apps/web` Liquid-parity test harness (via `liquidjs` + a small Shopify-filter shim) are added as permanent guardrails, not one-off scripts.

**Tech Stack:** Remix (apps/web), `@superapp/core` (packages/core), Vitest, Node's built-in `fs`/`path` for template-library scripts, `liquidjs` (new devDependency, Task 8) for the parity fixture.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-H bullet under Phase 4, `[Tmpl-1..3]`) — the nine-domain audit of 2026-08-24 at `master@6af6df2` (audit findings themselves live only in the published artifact / session transcripts, not in-repo; every number below was re-measured directly against the repo, not taken on faith from the audit prose — see "Verified ground truth").

## Dependencies (plan header — read before executing)

- **WS-E intersection check (done, negative result):** `apps/web/app/routes/api.modules.from-template.tsx` (the template install action) calls `ModuleService.createDraft` only — it never constructs `PublishService` and never publishes anything. A template install always lands as a `DRAFT` module; the merchant publishes it afterward through the ordinary generate/publish flow, which is entirely WS-E's territory and untouched by this plan. **No code in this plan touches `apps/web/app/services/publish/**` or intersects `sa-wt-ws-e`'s branch.** Merge order with WS-E is therefore irrelevant to this plan's tasks; call this out again if a future task discovers otherwise.
- **No dependency on WS-A/WS-B/WS-C.** `build-theme-liquid.mjs --check` is already wired into CI (`.github/workflows/ci.yml:219`, landed by WS-B) — this plan's Liquid-budget tasks make that existing gate pass with margin, they don't add it.
- **Runs entirely inside `packages/core` + `apps/web`.** `pnpm --filter @superapp/core build` before any `apps/web` test run that imports from `@superapp/core` (stale-dist trap, see MEMORY) — every task below that touches `packages/core/src/templates/**` rebuilds core before its `apps/web` verification step.

## Global Constraints

- TAE Liquid aggregate budget: **100,000 bytes hard-enforced by Shopify; program target ≤ 95,000** (`docs/superpowers/plans/2026-08-24-launch-program.md` Global constraints). Verify with `node scripts/build-theme-liquid.mjs --check` — non-zero exit on either the per-file or aggregate gate.
- The Liquid minifier (`scripts/build-theme-liquid.mjs`) is **output-preserving only** — never hand-edit `extensions/theme-app-extension/**/*.liquid` directly; edit the readable source under `apps/web/theme-extension-src/liquid/` and rerun the build.
- NEVER use `var(--sa-ink)` or `currentColor` as a background fallback in generated/template CSS or inline styles — the recorded white-on-white trap (MEMORY, `template-flagship-repair-2026-07`).
- No numeric claims in prose docs — every count this plan states was measured against `master@6af6df2` by the commands shown in "Verified ground truth"; if a later task's count differs, re-measure and correct the plan rather than trusting the older number (same discipline WS-E used correcting its own stale audit claims).
- TDD, bite-sized tasks, frequent commits; `cd apps/web && npx vitest run <file>` for apps/web tests, `cd packages/core && npx vitest run <file>` for core tests; CI (WS-B) must stay green at every merge.
- All file paths below are repo-relative to `/Users/lavipun/Work/ai-shopify-superapp`.

## Verified ground truth (2026-08-24, `master@6af6df2`)

Every number here was measured directly, not copied from the audit artifact. Re-run the shown command if you doubt a figure.

- **Liquid aggregate today:** `node scripts/build-theme-liquid.mjs` → `Total Liquid: 99613 B / 100000 B budget (99.6%)`. Per-file breakdown (minified bytes, largest first): `snippets/superapp-module-sections.liquid` 49,919 B (source 76,167 B), `snippets/superapp-module.liquid` 16,802 B, `snippets/superapp-module-overlay.liquid` 6,167 B, `snippets/superapp-module-pdp.liquid` 4,927 B, `snippets/superapp-product-bundle.liquid` 3,910 B, `blocks/product-slot.liquid` 3,203 B, `blocks/collection-slot.liquid` 3,187 B, `blocks/superapp-theme-modules.liquid` 3,166 B, `blocks/universal-slot.liquid` 3,108 B, `snippets/superapp-head-module.liquid` 2,746 B, `snippets/superapp-recommendations.liquid` 2,108 B, `blocks/superapp-theme-head.liquid` 370 B. `superapp-module-sections.liquid` alone is 50% of the entire budget — it is the only file worth cutting from; everything else is already lean.
- **CSS/JS assets have separate, uncontested budget:** `extensions/theme-app-extension/assets/superapp-modules.css` is 107,408 B, `superapp-modules.js` is 56,238 B — neither counts against the 100,000 B Liquid wall (Shopify's aggregate limit is Liquid-only). Moving presentation logic there is real headroom, not a shell game.
- **`superapp-module-sections.liquid` is mostly decision logic, not raw markup:** only 4 inline `style="..."` attributes and 2 inline `<svg>` in the whole file; most of its bytes are `{% liquid %}` blocks computing modifier classes (`superapp-section--minimal`, `superapp-layout--*`, `--sa-cols`, etc.) from `mod_cfg`. The extraction lever is moving that class-computation to `data-sa-*` attributes read by `superapp-modules.js` at runtime — the same pattern the file *already* uses for its three JS-enhanced kinds (`before-after`, `hotspots`, `tabs` — see `apps/web/app/services/recipes/kind-archetype.ts:32-46`), not a new pattern.
- **`ensureStoreAesthetic` (`apps/web/app/services/theme/ensure-aesthetic.server.ts`) is called from exactly two places**, both AI-generation routes: `apps/web/app/routes/api.ai.create-module.tsx:128` and `apps/web/app/routes/api.ai.create-module.stream.tsx:163`, both gated on `isStorefrontType` (`theme.section` / `proxy.widget`) and both passing `{ admin, shopId: shopRow.id }`. `apps/web/app/routes/api.modules.from-template.tsx` (the template-install action) never calls it — confirmed by grep, zero hits. The install action *does* already call `resolveStorefrontPack({ confidence: 0, ... })` (line 39) to stamp `data-sa-pack`, but confidence-0 always biases to `luxe` regardless of the store's real aesthetic — it has never looked at the live theme.
- **Pack reality vs. documented reality:** `apps/web/app/services/ai/style-packs.server.ts` defines 6 upstream aesthetic-selection ids (`apple-hig-clean`, `editorial-wellness`, `bold-dtc`, `minimal-luxe`, `playful-commerce`, `tech-utility`) collapsed by `resolveStorefrontPack`/`RENDER_PACK_BY_AESTHETIC` (lines 161-178) to 4 storefront render packs (`luxe`, `bold`, `playful`, `utility`), and `docs/design-system/module-design-system.md` §3 documents all 4 as first-class ("Pack A" through "Pack D"). But **template authorship is de facto a 2-pack system**: `grep -rho "pack: '[a-zA-Z0-9_-]*'" packages/core/src/templates` → `177 luxe`, `127 bold`, `2 utility`, `1 playful` (307 total pack-bearing specs). The 3 utility/playful outliers are exactly 3 files: `packages/core/src/templates/blocks/appembed-body-overlay.ts`, `packages/core/src/templates/sections/native-pricing-comparison.ts`, `packages/core/src/templates/sections/native-logo-marquee-trust.ts`. `style-packs.server.ts`'s own comment (line 159) already concedes `apple-hig-clean`/`editorial-wellness`/`minimal-luxe` "intentionally collapse to Luxe — their differences sit inside Luxe's range," and low-confidence signal *always* resolves to `luxe` — the code has been quietly retreating to 2 packs for a while; the docs and the 3 outlier files haven't caught up. See Task 1 for the decision this plan needs before touching pack code.
- **48 hardcoded demo palettes — exact match, mechanism identified:** `grep -rho "colors:\s*{[^}]*}" packages/core/src/templates --include="*.ts" | grep -c "text:.*background:\|background:.*text:"` → **48**. These are `colors: { text: '#...', background: '#...', ... }` blocks that hardcode BOTH ink and canvas (a full override), as opposed to the other 259 `colors:` blocks that carry only an accent `seed` (which is fine — `seed` tints on top of the store's real palette, it doesn't replace it). The 48 live in 25 files, concentrated in `themeblock-content-page-fullsection.ts` (6), `native-hero.ts` (5), `themeblock-header-footer-group.ts` (5), `native-stats-cta-band.ts` (3), `native-gallery-lookbook.ts` (3), `appembed-body-overlay.ts` (3), 8 files with 2, 12 files with 1. Full per-file list re-derivable with the command in Task 5.
- **Placeholder media — preview lies, storefront doesn't know how to lie tastefully:** `grep -rc "cdn.example.com" packages/core/src/templates --include="*.ts"` → 168 occurrences across 18 files (demo `imageUrl`/`videoUrl`/`posterImageUrl`/`backgroundImageUrl` fields). `PreviewService` (`apps/web/app/services/preview/preview.service.ts:3430-3454`) already has `isPlaceholderUrl()` (detects `example.com` and Shopify's own `cdn.shopify.com/s/files/` demo-asset path) and `phMedia()` (renders a real `<img>` when the URL looks real, otherwise an accent-tinted `<div class="... superapp-ph">` with an inline SVG glyph `PH_SVG`, never a broken `<img>`). The shipped Liquid renderer has **zero** equivalent — `grep -n "cdn.example.com\|placeholder" apps/web/theme-extension-src/liquid/snippets/*.liquid` returns only `<input placeholder="...">` form hints, no media-URL filtering. A merchant who installs a template as-is gets a real storefront `<img src="https://cdn.example.com/...">` that 404s. The preview genuinely masks this.
- **Template library size and duplication — exact match:** `ALL_TEMPLATES` (`packages/core/src/templates/index.ts`) has **575** entries (`MODULE_APP_TEMPLATES` 36-file-derived + `BLOCK_TEMPLATES` 14-file-derived + `SECTION_TEMPLATES` 21-file-derived + `COVERAGE_TEMPLATES`). Structural-duplicate analysis — group by `spec.type` + `JSON.stringify(spec.config)` with every string leaf blanked (i.e. same shape, differs only in copy text) — finds **34 clusters with >1 member, totaling exactly 121 templates**. Largest cluster: the `PXY-MOD-*` family, 22 near-identical `proxy.widget` templates differing only in headline/body copy. Full script in Task 9.
- **Tier tagging exists but is barely used:** `TemplateTier = 'exemplar' | 'standard' | 'floor'` (`packages/core/src/templates.ts:30`) is consumed by RAG ranking in `apps/web/app/services/ai/solution-search.server.ts:105-196` (`exemplar` +1.5 score, `floor` −1 and excluded from the top pick) — but only **29 of 575** templates (`8 exemplar`, `5 floor`, `16 standard`) carry a `tier` at all. The other 546 are untagged and invisible to that ranking logic.
- **Existing parity guard is symbol-level, not output-level:** `apps/web/app/__tests__/kind-archetype-parity.test.ts` (the "R0" guard) locks the TS `KIND_ARCHETYPE` kind→archetype table against the Liquid `case sa_kind_h … when '<kind>'` dispatch in the `superapp-module*.liquid` family — it proves every kind *name* that TS knows about also has a Liquid branch (and vice versa, with two documented storefront-only exceptions: `pdp`, `sticky-atc`). It does **not** render anything — it never proves the actual HTML/classes/placeholder-decision PreviewService shows a merchant matches what the real Liquid emits for the same spec. `SectionArchetype` has 18 members (`apps/web/app/services/recipes/kind-archetype.ts:22-25`). No `liquidjs` (or any Liquid-execution library) is currently a dependency anywhere in the repo — only `@shopify/theme-check-node` (a linter, not a renderer) is present (`apps/web/package.json:49`).
- **Liquid filter/tag surface used by the renderer family** (`grep` across `apps/web/theme-extension-src/liquid/{snippets,blocks}/*.liquid`): standard Liquid tags only (`assign`, `if/elsif/else/unless`, `case/when`, `for/break`, `capture`, `render`, `comment`, `doc`, `raw`, `schema`) and filters that are mostly Ruby-Liquid-standard (`append`, `at_least`, `at_most`, `default`, `divided_by`, `first`, `join`, `last`, `modulo`, `plus`, `remove`, `replace`, `slice`, `split`, `strip`, `times`, `upcase`, `where`, `newline_to_br`, `escape`, `handle`) plus exactly **4 Shopify-specific filters**: `money`, `image_url`, `json`, `handle` (Shopify's `handle` filter — slugify — happens to share a name with a common custom filter; liquidjs ships a `slugify`-equivalent under a different name so this still needs a shim). This bounds Task 8's shim to 4 filters, not a full Shopify Liquid reimplementation.

## Decisions of record for this plan

| # | Decision |
|---|----------|
| H1 | **RULED 2026-08-24 (controller): COLLAPSE.** Render packs collapse from 4 to 2 (`luxe`, `bold`) — see the pack-reality data above (99.35% of authored pack-bearing template content and every low-confidence fallback already resolves to `luxe`/`bold`; only 3 files author `playful`/`utility`). `playful-commerce`/`tech-utility` retreat to an explicit "not currently offered" backlog note in `module-design-system.md` rather than being silently half-supported. Task 2 executes the collapse as written. |
| H2 | **Dedupe by deletion, not by hiding.** `templateId` has no Prisma foreign key anywhere (`grep -n templateId apps/web/prisma/schema.prisma` → one hit, a JSON-blob comment) — only `AppSettings.templateSpecOverrides` (JSON keyed by templateId, harmlessly orphans an unused key) and `ActivityLog.details` (historical JSON snapshot, doesn't need the template to still exist) reference template IDs, and neither does so via FK. Deleting excess copy-variants is therefore safe; Task 9 deletes down to a cap rather than building a variant-grouping UI layer. |
| H3 | **Placeholder-media fix ports `PreviewService`'s existing logic verbatim rather than inventing new rules.** `isPlaceholderUrl()` / `phMedia()` / `PH_SVG` (`apps/web/app/services/preview/preview.service.ts:3430-3454`) are the source of truth for "does this URL look real"; Task 6 reimplements the same two predicates in Liquid so preview and storefront agree by construction, not by two independently-maintained rule sets. |
| H4 | **Parity fixture asserts structural markers, not byte-identity.** PreviewService intentionally wraps output in a different outer shell than the storefront (admin preview chrome vs. theme page chrome) — Task 8's fixture asserts that the SAME set of modifier classes, `data-sa-*` attributes, and placeholder-vs-real-media decisions appear in both renders for a given fixture spec, not that the HTML strings are identical. |

## File Structure (created / modified)

```
apps/web/theme-extension-src/liquid/snippets/superapp-module-media.liquid   [C] shared placeholder-aware media partial (Task 6)
apps/web/theme-extension-src/liquid/snippets/superapp-module-sections.liquid [M] route media emission through the new partial; move class-computation to data attrs (Tasks 6-7)
extensions/theme-app-extension/assets/superapp-modules.js                    [M] +class-attribute reader for extracted layout logic (Task 7)
apps/web/app/routes/api.modules.from-template.tsx                            [M] ensureStoreAesthetic wiring (Task 5)
apps/web/app/services/ai/style-packs.server.ts                               [M] pack collapse (Task 2, only if H1 rules "collapse")
docs/design-system/module-design-system.md                                   [M] pack section rewrite to match ruling (Task 2)
packages/core/src/templates/sections/native-pricing-comparison.ts            [M] pack outlier remap (Task 2)
packages/core/src/templates/sections/native-logo-marquee-trust.ts            [M] pack outlier remap (Task 2)
packages/core/src/templates/blocks/appembed-body-overlay.ts                  [M] pack outlier remap (Task 2)
packages/core/scripts/strip-demo-palettes.mjs                                [C] batch codemod, Task 5 (25 files touched, listed in Task 5)
packages/core/scripts/find-copy-variant-clusters.mjs                         [C] structural-duplicate finder, Task 9 (also used read-only by Task 3's report)
packages/core/scripts/dedupe-copy-variants.mjs                               [C] batch codemod, Task 9
packages/core/scripts/tag-template-tiers.mjs                                 [C] batch heuristic tagger, Task 10
packages/core/src/__tests__/template-library-integrity.test.ts               [C] pinned counts + invariants (Tasks 5, 9, 10)
apps/web/app/__tests__/from-template-aesthetic.test.ts                       [C] Task 5
apps/web/app/__tests__/liquid-media-placeholder.test.ts                      [C] Task 6
apps/web/app/__tests__/liquid-preview-parity.test.ts                         [C] Task 8
apps/web/package.json                                                        [M] +liquidjs devDependency (Task 8)
```

---

### Task 1: Pack decision — present the data, controller rules

No code. This task is a gate: it forces an explicit, recorded decision before Task 2 (and nothing else in this plan depends on the outcome — Tasks 3-10 are pack-agnostic).

**The data** (already measured above, repeated here for the decision):

| Signal | Value |
|---|---|
| Documented render packs (`module-design-system.md` §3) | 4: Minimal Luxe, Bold DTC, Playful Commerce, Tech Utility |
| Selectable upstream aesthetic ids (`style-packs.server.ts`) | 6, collapsing to 4 render packs via `RENDER_PACK_BY_AESTHETIC` |
| Template-authored `pack:` values (307 storefront-layout specs) | `luxe` 177 (57.7%), `bold` 127 (41.4%), `utility` 2 (0.65%), `playful` 1 (0.33%) |
| Low-confidence fallback (`resolveStorefrontPack`, confidence < 0.34) | always `luxe` — never `playful`/`utility` |
| Code comment already conceding the collapse | `style-packs.server.ts:159`: "…intentionally collapse to Luxe — their differences sit inside Luxe's range" |
| Files that would need remapping if collapsed to 2 | exactly 3: `appembed-body-overlay.ts`, `native-pricing-comparison.ts`, `native-logo-marquee-trust.ts` |

**Recommendation (H1): collapse to the honest 2-pack (`luxe`, `bold`).** The data shows `playful`/`utility` are not a maintained third and fourth pack — they're 3 templates nobody has kept in sync with the rest of the library, propped up by a code comment that already treats them as an edge case of Luxe. Shipping "4 packs" in docs while 99.35% of real authored content and every low-confidence fallback is `luxe`/`bold` is exactly the kind of doc/code mismatch this program's [D8] "no silent failures" and WS-J's "no numeric claims without measurement" discipline exist to catch. Investing in `playful`/`tech-utility` as real third/fourth packs (redesigning `module-design-system.md` §3.2a/§3.2b's token grammar into something templates actually use, authoring template content for them, adding QA coverage) is a legitimate alternative — it is a multi-week design investment, not a WS-H-sized task, and should be scoped as a standalone follow-up if chosen.

- [x] **Step 1: Record the ruling.** Add a row to this plan's Decisions of record table (H1 becomes a ruling, not a recommendation) and to `docs/design-system/module-design-system.md`'s existing "Decisions log" (§10) with the date and the data above. Two valid outcomes:
  - **Collapse (recommended):** proceed to Task 2 as written.
  - **Invest:** skip Task 2's collapse steps; instead file a follow-up spec-track item ("WS-H-follow: Playful/Tech-Utility pack investment") and leave the 3 outlier files and 4-pack docs as-is. Tasks 3-10 are unaffected either way.

  **RULED: COLLAPSE (controller ruling, 2026-08-24; H1 above is the ruling record; `module-design-system.md` §10 carries the matching row).**
- [x] **Step 2: Commit the decision record** (docs-only): `git commit -m "docs(ws-h): pack decision recorded — collapse (Task 1)"`.

---

### Task 2: Execute the pack collapse (only if Task 1 ruled "collapse")

**Files:**
- Modify: `apps/web/app/services/ai/style-packs.server.ts`
- Modify: `docs/design-system/module-design-system.md`
- Modify: `packages/core/src/templates/sections/native-pricing-comparison.ts`, `packages/core/src/templates/sections/native-logo-marquee-trust.ts`, `packages/core/src/templates/blocks/appembed-body-overlay.ts`
- Modify: `apps/web/app/__tests__/*.test.ts` wherever `'playful'`/`'utility'` appear as a live selectable pack (grep first, see Step 1)

**Interfaces:**
- `RENDER_PACK_BY_AESTHETIC` (`style-packs.server.ts:161`) narrows from `Partial<Record<StylePackId, StorefrontPack>>` mapping to 4 values, to mapping every `StylePackId` to `'luxe' | 'bold'` only. `StorefrontPack` (wherever it's typed — check `apps/web/app/services/ai/style-packs.server.ts` and `apps/web/app/services/preview/preview.service.ts:53`'s local `PreviewPack` alias) narrows from `'luxe' | 'bold' | 'playful' | 'utility'` to `'luxe' | 'bold'`.

- [ ] **Step 1: Inventory every live reference** to `'playful'` / `'utility'` as a `StorefrontPack`/`PreviewPack` value (not as a `StylePackId` — `playful-commerce`/`tech-utility` upstream ids can stay as aesthetic-signal inputs, they just always resolve to `bold`/`luxe` now):
  ```bash
  grep -rn "'playful'\|'utility'\|\"playful\"\|\"utility\"" apps/web/app packages/core/src --include="*.ts" --include="*.tsx" | grep -v "playful-commerce\|tech-utility"
  ```
  Expect hits in: `style-packs.server.ts` (`RENDER_PACK_BY_AESTHETIC`, `StorefrontPack` type), `preview.service.ts` (`PreviewPack` type + any CSS-class branch keyed on pack), the 3 outlier template files, and any test pinning `resolveStorefrontPack` output to `'playful'`/`'utility'`.
- [ ] **Step 2: Write the failing test** — extend `apps/web/app/__tests__/apply-style-pack.test.ts` (the existing coverage for `resolveStorefrontPack`; `design-system.test.ts` and `from-template-pack-resolution.test.ts` also exercise this function and must stay green through Step 6) with:
  ```ts
  it('every StylePackId resolves to luxe or bold only (H1 pack collapse)', () => {
    const ids: StylePackId[] = ['apple-hig-clean', 'editorial-wellness', 'bold-dtc', 'minimal-luxe', 'playful-commerce', 'tech-utility'];
    for (const packId of ids) {
      const result = resolveStorefrontPack({ packId, confidence: 1, alternatives: [], reason: 'test' });
      expect(['luxe', 'bold']).toContain(result);
    }
  });
  ```
  Run: `cd apps/web && npx vitest run app/__tests__/apply-style-pack.test.ts`. Expected: FAIL (`bold-dtc`→`bold` and everything else→`luxe` already true today except this test also needs `playful-commerce`/`tech-utility` to resolve rather than falling through to `?? 'luxe'` implicitly — confirm the CURRENT behavior first with a quick manual check before asserting; if it already passes because of the `?? 'luxe'` fallback, this step instead documents that the runtime already collapses and Step 3 is a type-level tightening + template remap only, not a behavior change).
- [ ] **Step 3: Implement.** In `style-packs.server.ts`, change `RENDER_PACK_BY_AESTHETIC` to map every id to `'luxe'` or `'bold'`; narrow the `StorefrontPack` type. In `preview.service.ts`, narrow `PreviewPack` the same way and delete any dead `'playful'`/`'utility'` CSS-class branches (grep first — the design-system CSS at `extensions/theme-app-extension/assets/superapp-modules.css` likely has `[data-sa-pack="playful"]`/`[data-sa-pack="utility"]` rule blocks; leave the CSS alone in this task — dead CSS is a WS-I cleanup concern, not a WS-H one, unless it's large enough to matter for the Liquid... no, CSS budget is separate and uncontested, so leave it).
- [ ] **Step 4: Remap the 3 outlier templates** — in each of `native-pricing-comparison.ts`, `native-logo-marquee-trust.ts`, `appembed-body-overlay.ts`, change `pack: 'utility'`/`pack: 'playful'` to whichever of `luxe`/`bold` the template's existing `colors`/tone most resembles (read the file, make the call — this is 3 files, not a script). Re-run `grep -rho "pack: '[a-zA-Z0-9_-]*'" packages/core/src/templates | sort | uniq -c` and confirm only `luxe`/`bold` remain.
- [ ] **Step 5: Update `module-design-system.md`** — §3.2a "Pack C — Playful Commerce" and §3.2b "Pack D — Tech Utility" become a short "Not currently offered (H1, 2026-08-24)" note pointing at this plan instead of full token-grammar sections; §9.2's pack-selection table drops to 2 rows.
- [ ] **Step 6: Run the full affected suite:**
  ```bash
  cd packages/core && pnpm build && cd ../.. && \
  cd apps/web && npx vitest run app/__tests__/apply-style-pack.test.ts app/__tests__/design-system.test.ts app/__tests__/from-template-pack-resolution.test.ts app/__tests__/preview-service.test.ts app/__tests__/design-system-contract.test.ts app/__tests__/richness-qa-templates.test.ts
  ```
  Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "refactor(ws-h): collapse render packs to luxe/bold (H1); remap 3 outlier templates"`.

---

### Task 3: `ensureStoreAesthetic` on template installs

**Files:**
- Modify: `apps/web/app/routes/api.modules.from-template.tsx`
- Create: `apps/web/app/__tests__/from-template-aesthetic.test.ts`

**Interfaces:**
- Consumes: `ensureStoreAesthetic({ admin, shopId, maxWaitMs? })` (unchanged signature, `apps/web/app/services/theme/ensure-aesthetic.server.ts:15`).
- Mirrors the AI path's gate: only run for `STOREFRONT_LAYOUT_TYPES` (already defined at the top of `from-template.tsx:17-24`), not for every template type (functions/admin/POS/messaging templates have no storefront palette to match).

- [ ] **Step 1: Write the failing test** — copy the mock scaffolding verbatim from the existing `apps/web/app/__tests__/from-template-pack-resolution.test.ts` (same route, same auth/db/quota/module/activity mocks already proven to work against this action) and add one more mock:
  ```ts
  import { describe, expect, it, vi } from 'vitest';

  const ensureStoreAesthetic = vi.fn();
  vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic }));
  // + the same authenticateAdminMock / withApiLogging / db.server / QuotaService / ModuleService /
  // ActivityLogService mocks as from-template-pack-resolution.test.ts (copy that file's mock block
  // verbatim — it is the proven-working scaffolding for this exact route).

  import { action } from '~/routes/api.modules.from-template';

  describe('template install → ensureStoreAesthetic (WS-H)', () => {
    it('calls ensureStoreAesthetic for a theme.section template', async () => {
      const form = new FormData();
      form.set('templateId', /* a real theme.section template id, e.g. */ 'NSEC-HERO-01');
      const request = new Request('https://x.myshopify.com/api/modules/from-template', { method: 'POST', body: form });
      await action({ request } as never);
      expect(ensureStoreAesthetic).toHaveBeenCalledWith(
        expect.objectContaining({ admin: expect.anything(), shopId: expect.any(String) }),
      );
    });

    it('does NOT call ensureStoreAesthetic for a non-storefront template (e.g. functions.discountRules)', async () => {
      const form = new FormData();
      form.set('templateId', /* a real functions.* template id */ 'FN-DISC-01');
      const request = new Request('https://x.myshopify.com/api/modules/from-template', { method: 'POST', body: form });
      await action({ request } as never);
      expect(ensureStoreAesthetic).not.toHaveBeenCalled();
    });
  });
  ```
  Run: `cd apps/web && npx vitest run app/__tests__/from-template-aesthetic.test.ts`. Expected: FAIL — `ensureStoreAesthetic` never called today (0 calls in both cases, so the first assertion fails).
- [ ] **Step 2: Implement** — in `api.modules.from-template.tsx`, destructure `admin` alongside `session` from `shopify.authenticate.admin(request)` (currently only `{ session }` is destructured), and after `shopRow` is resolved (after line 98) and before `quota.enforce`, add:
  ```ts
  if (STOREFRONT_LAYOUT_TYPES.has(template.type)) {
    // Best-effort, time-boxed — mirrors api.ai.create-module.tsx's AI-path gate.
    // Never blocks or fails the install; a stale/missing palette just means the
    // installed module falls back to the default design reference.
    await ensureStoreAesthetic({ admin, shopId: shopRow.id });
  }
  ```
  Add the import: `import { ensureStoreAesthetic } from '~/services/theme/ensure-aesthetic.server';`.
- [ ] **Step 3: Run the test again.** Expected: PASS.
- [ ] **Step 4: Run the full route test suite + affected callers** — `cd apps/web && npx vitest run app/__tests__/from-template-aesthetic.test.ts app/__tests__/from-template-pack-resolution.test.ts`. Expected: PASS (the pack-resolution test must stay green unchanged — this task only adds a call, it doesn't touch `withResolvedPack`).
- [ ] **Step 5: Commit** — `git commit -m "feat(ws-h): wire ensureStoreAesthetic into template installs (Tmpl-2 install-path gap)"`.

---

### Task 4: Shared placeholder-aware media partial (Liquid) — fixes the broken-image bug

Ports `PreviewService.isPlaceholderUrl()`/`phMedia()`/`PH_SVG` (`apps/web/app/services/preview/preview.service.ts:3430-3454`) into a reusable Liquid snippet, then routes every media-emitting `when` branch in `superapp-module-sections.liquid` through it. This is the placeholder-media fix; it also starts the Liquid byte-reclaim (Task 5 finishes it) by collapsing N inline `<img>`/`<div>` emission patterns into 1.

**Files:**
- Create: `apps/web/theme-extension-src/liquid/snippets/superapp-module-media.liquid`
- Modify: `apps/web/theme-extension-src/liquid/snippets/superapp-module-sections.liquid`, `superapp-module-pdp.liquid`, `superapp-module-overlay.liquid` (wherever a raw `<img src="{{ ...ImageUrl... }}"` or `background-image` pattern appears — enumerate with the grep in Step 1)
- Create: `apps/web/app/__tests__/liquid-media-placeholder.test.ts`

**Interfaces:**
- New Liquid snippet contract: `{% render 'superapp-module-media', url: <string|blank>, alt: <string>, css_class: <string> %}` — outputs a real `<img class="{{ css_class }}" src="..." loading="lazy" alt="...">` when `url` looks real, otherwise `<div class="{{ css_class }} superapp-ph" role="img" aria-label="...">` + the same inline SVG glyph as `PH_SVG`. "Looks real" mirrors `isPlaceholderUrl()`: blank → placeholder; contains `example.com` → placeholder; contains `cdn.shopify.com/s/files/` → placeholder; otherwise real.

- [ ] **Step 1: Enumerate every media-emission call site:**
  ```bash
  grep -n '<img\|background-image\|ImageUrl\|VideoUrl' apps/web/theme-extension-src/liquid/snippets/superapp-module-sections.liquid apps/web/theme-extension-src/liquid/snippets/superapp-module-pdp.liquid apps/web/theme-extension-src/liquid/snippets/superapp-module-overlay.liquid
  ```
  This is the exact worklist for Step 4 — record the count so Step 5's verification can assert it dropped to 0 raw `<img src="{{ ... }}"` emissions outside the new partial.
- [ ] **Step 2: Write the failing test** — a static-content test (no Liquid execution needed here; Task 8 adds real rendering):
  ```ts
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { describe, expect, it } from 'vitest';

  const REPO_ROOT = join(__dirname, '../../../..');
  const SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid');

  describe('shared media-placeholder partial (WS-H placeholder-media fix)', () => {
    it('superapp-module-media.liquid exists and checks for example.com / cdn.shopify.com/s/files/', () => {
      const partial = readFileSync(join(SRC, 'snippets/superapp-module-media.liquid'), 'utf8');
      expect(partial).toMatch(/example\.com/);
      expect(partial).toMatch(/cdn\.shopify\.com\/s\/files\//);
    });

    it('no remaining raw <img src="{{ ...ImageUrl... }}"> emission outside the shared partial', () => {
      const family = ['superapp-module-sections.liquid', 'superapp-module-pdp.liquid', 'superapp-module-overlay.liquid']
        .map((f) => readFileSync(join(SRC, 'snippets', f), 'utf8'))
        .join('\n');
      // Every raw <img> tag whose src references a *ImageUrl config field directly
      // (not routed through the partial) is the bug this task fixes.
      const rawImgWithConfigUrl = /<img[^>]*src="\{\{[^}]*ImageUrl[^}]*\}\}/g;
      expect(family.match(rawImgWithConfigUrl)).toBeNull();
    });
  });
  ```
  Run: `cd apps/web && npx vitest run app/__tests__/liquid-media-placeholder.test.ts`. Expected: FAIL (partial doesn't exist yet; raw `<img src="{{ mod_cfg....ImageUrl }}">` patterns still present per Step 1's inventory).
- [ ] **Step 3: Author the partial** (readable source; the build script minifies it):
  ```liquid
  {% # theme-check-disable OrphanedSnippet, RemoteAsset %}
  {% doc %}
    Placeholder-aware media emitter (WS-H). Mirrors PreviewService's isPlaceholderUrl()/
    phMedia()/PH_SVG (apps/web/app/services/preview/preview.service.ts:3430-3454) so a
    template's demo cdn.example.com URLs — or Shopify's own illustrative
    cdn.shopify.com/s/files/ library assets — never render a broken <img> on a real
    storefront. A merchant who hasn't replaced the demo image yet sees a tasteful
    accent-tinted placeholder glyph instead, exactly what the admin preview already shows.

    @param {string} url - candidate media URL (may be blank).
    @param {string} alt - alt/aria-label text.
    @param {string} css_class - class(es) the caller's layout expects on either element.
  {% enddoc %}
  {% liquid
    assign sa_media_is_placeholder = false
    if url == blank
      assign sa_media_is_placeholder = true
    elsif url contains 'example.com'
      assign sa_media_is_placeholder = true
    elsif url contains 'cdn.shopify.com/s/files/'
      assign sa_media_is_placeholder = true
    endif
  %}
  {% if sa_media_is_placeholder %}
    <div class="{{ css_class }} superapp-ph" role="img" aria-label="{{ alt | default: 'Sample image' | escape }}">
      <svg class="superapp-ph__glyph" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="9" width="36" height="30" rx="3"/><circle cx="17" cy="19" r="3.5"/><path d="M8 34l10-9 7 6 6-6 9 9"/></svg>
    </div>
  {% else %}
    <img class="{{ css_class }}" src="{{ url }}" alt="{{ alt | escape }}" loading="lazy">
  {% endif %}
  ```
- [ ] **Step 4: Sweep the call sites from Step 1** — replace each raw `<img src="{{ mod_cfg....ImageUrl }}" ...>` (and any `background-image: url({{ ... }})` inline-style pattern) with `{% render 'superapp-module-media', url: mod_cfg.fields.xImageUrl, alt: ..., css_class: '...' %}`, preserving whatever CSS class each call site previously hardcoded on the `<img>` (pass it as `css_class` so archetype sizing rules keep applying — matches `phMedia()`'s own contract in `preview.service.ts`: "Both carry `cls` so the archetype sizing rules apply either way").
- [ ] **Step 5: Rebuild and run:**
  ```bash
  node scripts/build-theme-liquid.mjs
  cd apps/web && npx vitest run app/__tests__/liquid-media-placeholder.test.ts app/__tests__/kind-archetype-parity.test.ts
  ```
  Expected: PASS. Note the new aggregate total printed by the build — record it, it feeds Task 5's starting point (expect a modest reduction from 99,613 B, since N call sites collapsed to 1 partial definition + N one-line `{% render %}` calls).
- [ ] **Step 6: Commit** — `git commit -m "fix(ws-h): shared placeholder-aware media partial — no more broken cdn.example.com <img> on real storefronts (Tmpl-3)"`.

---

### Task 5: Reclaim Liquid budget to ≤95,000 B

Task 4 already shaved some bytes; this task finishes the reclaim using the lever identified in "Verified ground truth" — move `{% liquid %}`-computed modifier-class logic in `superapp-module-sections.liquid` to `data-sa-*` attributes read by `superapp-modules.js`, the same pattern the file already uses for its 3 JS-enhanced kinds.

**Files:**
- Modify: `apps/web/theme-extension-src/liquid/snippets/superapp-module-sections.liquid`
- Modify: `extensions/theme-app-extension/assets/superapp-modules.js` (confirmed: unlike Liquid, JS/CSS have no separate readable-source directory — `apps/web/theme-extension-src/` contains only `liquid/{blocks,snippets}`; `superapp-modules.js`/`.css` under `extensions/theme-app-extension/assets/` ARE the source, edited directly, no build step)

**Interfaces:**
- No new public interface — this is a pure byte-budget refactor. The verification is entirely `node scripts/build-theme-liquid.mjs --check`.

- [ ] **Step 1: Baseline.** `node scripts/build-theme-liquid.mjs` — record the current aggregate (post-Task-4) and confirm `superapp-module-sections.liquid` is still the largest file.
- [ ] **Step 2: Identify the 2-3 heaviest `{% liquid %}` class-computation blocks** in `superapp-module-sections.liquid` by line count (the layout-class block shown in "Verified ground truth" — `layout_class`/`layout_cols`/`sa_sec_variant`/`sa_sec_has_blocks`/`sa_sec_block_has_image` — is one; find 1-2 more of similar size with `grep -n "assign sa_" apps/web/theme-extension-src/liquid/snippets/superapp-module-sections.liquid | wc -l` per `when` branch to rank them).
- [ ] **Step 3: For the largest one, replace the computed CSS-class Liquid logic with raw data attributes** the JS can read: instead of Liquid computing `layout_class`/`sa_sec_variant` and interpolating them into the `class="..."` attribute, emit the raw config values as `data-sa-layout="{{ mod_cfg.layout.layout }}" data-sa-cols="{{ mod_cfg.layout.columns }}" data-sa-has-image="{{ sa_sec_block_has_image }}"` and add a small function to `superapp-modules.js` (find its existing kind-dispatch/init pattern first — it already progressively-enhances `before-after`/`hotspots`/`tabs`, so there's a live init hook to extend) that applies the equivalent modifier classes from those attributes on `DOMContentLoaded`. **Guardrail: this MUST degrade gracefully with JS disabled** — ship a minimal no-JS default class (e.g. always include `superapp-layout--stacked` as the base in the Liquid `class=` output, matching the current no-modifier default) so a JS-disabled storefront still renders correctly, just without the fancier column/variant classing. Document this trade-off in a `{% doc %}` comment at the top of the affected `when` branch.
- [ ] **Step 4: Rebuild, check the budget, iterate.**
  ```bash
  node scripts/build-theme-liquid.mjs --check
  ```
  If still >95,000 B, repeat Step 3 for the next-heaviest block. Stop once the printed aggregate is ≤95,000 B — do not over-cut; the script's own header comment is explicit that this budget exists to be *grown into* by future template work, not raced to zero.
- [ ] **Step 5: Run the full parity + design-system suites** (this is exactly the risk this refactor carries — moving logic from Liquid to JS can silently break the kind-archetype parity guard or the no-JS fallback):
  ```bash
  cd apps/web && npx vitest run app/__tests__/kind-archetype-parity.test.ts app/__tests__/design-system-contract.test.ts app/__tests__/liquid-media-placeholder.test.ts app/__tests__/richness-qa-templates.test.ts
  ```
  Expected: PASS.
- [ ] **Step 6: Manual no-JS sanity check** — with the built extension, confirm (by reading the emitted Liquid, since a live theme isn't available in CI) that every element the JS enhances still has a sane default class from Liquid alone. Note this check in the commit body.
- [ ] **Step 7: Commit** — `git commit -m "perf(ws-h): reclaim Liquid budget to <=95000B — layout-class logic moved to data-sa-* + superapp-modules.js (Tmpl-1)"`, including the before/after aggregate byte counts in the commit body.

---

### Task 6: Batch sweep — strip the 48 hardcoded full-palette overrides

**Files:**
- Create: `packages/core/scripts/strip-demo-palettes.mjs`
- Modify (via the script, not by hand): the 25 files listed in "Verified ground truth" (`themeblock-content-page-fullsection.ts`, `native-hero.ts`, `themeblock-header-footer-group.ts`, `native-stats-cta-band.ts`, `native-gallery-lookbook.ts`, `appembed-body-overlay.ts`, `native-feature-bento.ts`, `native-collection-editorial.ts`, `themeblock-vb-behavior.ts`, `themeblock-collection-surface.ts`, `native-testimonials-social-proof.ts`, `native-tabs.ts`, `native-pricing-comparison.ts`, `native-pdp-fullsection.ts`, `native-newsletter-capture.ts`, `native-mega-faq.ts`, `native-launch-404.ts`, `native-hotspots.ts`, `native-contact-team-timeline.ts`, `native-before-after.ts`, `proxy-widget-storefront-and-order.ts`, `themeblock-vb-final.ts`, `themeblock-pdp-surface.ts`, `themeblock-index-fullsection.ts`, `themeblock-cart-surface.ts`)
- Create: `packages/core/src/__tests__/template-library-integrity.test.ts` (this task adds the first assertion; Tasks 9-10 append to the same file)

**Interfaces:**
- Script contract: `node packages/core/scripts/strip-demo-palettes.mjs [--check]` — without `--check`, rewrites every `colors: { text: '#...', background: '#...', ...rest }` block to `colors: { ...rest }` (drop `text`/`background` only, keep `seed`/`overlayBackdrop`/`overlayBackdropOpacity` — those are legitimate accent/scrim tuning, not full-palette override). With `--check`, exits 1 if any `colors:` block still hardcodes both `text` and `background` (the CI-friendly form, mirroring `build-theme-liquid.mjs --check`'s pattern).

- [ ] **Step 1: Write the failing test** — `packages/core/src/__tests__/template-library-integrity.test.ts`:
  ```ts
  import { readFileSync, readdirSync } from 'node:fs';
  import { join } from 'node:path';
  import { describe, expect, it } from 'vitest';

  const TEMPLATES_ROOT = join(__dirname, '..', 'templates');

  function allTemplateFiles(): string[] {
    const dirs = ['modules', 'blocks', 'sections'];
    return dirs.flatMap((d) =>
      readdirSync(join(TEMPLATES_ROOT, d))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => join(TEMPLATES_ROOT, d, f)),
    );
  }

  describe('template library integrity (WS-H)', () => {
    it('no template hardcodes both text AND background in a colors block (Tmpl-2)', () => {
      const offenders: string[] = [];
      for (const file of allTemplateFiles()) {
        const src = readFileSync(file, 'utf8');
        const blocks = src.match(/colors:\s*\{[^}]*\}/g) ?? [];
        for (const b of blocks) {
          if (/text:.*background:|background:.*text:/.test(b)) offenders.push(`${file}: ${b}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });
  ```
  Run: `cd packages/core && npx vitest run src/__tests__/template-library-integrity.test.ts`. Expected: FAIL, 48 offenders listed.
- [ ] **Step 2: Write the codemod** (`packages/core/scripts/strip-demo-palettes.mjs`):
  ```js
  #!/usr/bin/env node
  import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates');
  const CHECK = process.argv.includes('--check');

  function stripFullPaletteOverrides(src) {
    return src.replace(/colors:\s*\{([^}]*)\}/g, (whole, inner) => {
      if (!/text:.*background:|background:.*text:/.test(inner)) return whole;
      const kept = inner
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p && !/^text:/.test(p) && !/^background:/.test(p))
        .join(', ');
      return `colors: { ${kept} }`;
    });
  }

  let offenders = 0;
  for (const dir of ['modules', 'blocks', 'sections']) {
    const d = join(ROOT, dir);
    for (const f of readdirSync(d).filter((f) => f.endsWith('.ts'))) {
      const path = join(d, f);
      const src = readFileSync(path, 'utf8');
      const next = stripFullPaletteOverrides(src);
      if (next !== src) {
        offenders++;
        if (CHECK) console.error(`would strip full-palette override in ${dir}/${f}`);
        else writeFileSync(path, next);
      }
    }
  }
  console.log(`${CHECK ? 'Found' : 'Stripped'} ${offenders} file(s) with hardcoded text+background overrides.`);
  if (CHECK && offenders > 0) process.exit(1);
  ```
- [ ] **Step 3: Run it for real** — `node packages/core/scripts/strip-demo-palettes.mjs` (no `--check`). Expected console: `Stripped 25 file(s)...`. Spot-check 2-3 diffs by hand (`git diff packages/core/src/templates/sections/native-hero.ts`) to confirm `seed`/`overlayBackdrop*` survived and only `text`/`background` were removed.
- [ ] **Step 4: Rebuild core and run the integrity test + affected downstream suites** (removing hardcoded colors changes what preview/richness-QA render, so these must be re-checked, not assumed green):
  ```bash
  cd packages/core && pnpm build && npx vitest run src/__tests__/template-library-integrity.test.ts && cd ../.. && \
  cd apps/web && npx vitest run app/__tests__/richness-qa-templates.test.ts app/__tests__/design-qa-render.test.ts app/__tests__/preview-service.test.ts
  ```
  Expected: PASS. If richness-QA or design-QA assertions were pinned to the now-removed hardcoded hex values, update those specific assertions to check for the token-driven fallback instead (e.g. absence of the specific literal hex, presence of a CSS custom property reference) — do not weaken the test to "don't check colors at all."
- [ ] **Step 5: Add the `--check` form to the package script list** for future CI wiring (out of scope to add to `.github/workflows/ci.yml` in this task — that's a one-line follow-up WS-B/WS-J can pick up; note it in the commit body): `packages/core/package.json` scripts gains `"check:demo-palettes": "node scripts/strip-demo-palettes.mjs --check"`.
- [ ] **Step 6: Commit** — `git commit -m "fix(ws-h): strip 48 hardcoded text+background palette overrides across 25 templates (Tmpl-2)"`.

---

### Task 7: Placeholder-media sweep verification (library-side)

Task 4 fixed the Liquid renderer's handling of placeholder URLs. This task verifies the library side stayed consistent — no template author reintroduces a `cdn.example.com` URL through a field name the shared partial doesn't cover (e.g. a new `*ThumbnailUrl` field on a future template).

**Files:**
- Modify: `packages/core/src/__tests__/template-library-integrity.test.ts` (append)

- [ ] **Step 1: Write the test** (append to the file from Task 6):
  ```ts
  it('every *ImageUrl/*VideoUrl demo field uses a recognizably-placeholder domain (Tmpl-3 — so the Liquid partial\'s detection always fires)', () => {
    const offenders: string[] = [];
    for (const file of allTemplateFiles()) {
      const src = readFileSync(file, 'utf8');
      const urlFields = src.match(/(?:Image|Video|Poster)Url:\s*'https?:\/\/[^']*'/g) ?? [];
      for (const f of urlFields) {
        if (!/example\.com|cdn\.shopify\.com\/s\/files\//.test(f)) offenders.push(`${file}: ${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  ```
- [ ] **Step 2: Run.** `cd packages/core && npx vitest run src/__tests__/template-library-integrity.test.ts`. Expected: PASS immediately (the existing 168 `cdn.example.com` occurrences already match the pattern — this test's job is to catch *future* regressions, not fix anything today). If it fails, that means a demo URL exists on a real-looking domain (a genuine bug worth its own investigation, not a batch fix) — stop and investigate rather than force-passing.
- [ ] **Step 3: Commit** — `git commit -m "test(ws-h): pin placeholder-domain convention for template demo media fields (Tmpl-3 regression guard)"`.

---

### Task 8: Output-level preview⇄Liquid parity fixture per kind

Adds real Liquid execution to the test suite (via `liquidjs` + a 4-filter Shopify shim) and proves, for one fixture spec per `SectionArchetype` kind, that `PreviewService`'s HTML and the real Liquid renderer's HTML agree on structural markers.

**Files:**
- Modify: `apps/web/package.json` (+`liquidjs` devDependency)
- Create: `apps/web/app/__tests__/liquid-preview-parity.test.ts`

**Interfaces:**
- Test-only Shopify-filter shim (lives inline in the test file — this is intentionally not a production module, it exists only to make the readable Liquid source executable in Vitest): registers `money` (format cents as `$X.XX`), `image_url` (identity passthrough — CDN transform params aren't asserted on), `json` (liquidjs may already provide this — verify first, only add if missing), `handle` (slugify: lowercase, spaces/non-alphanumerics → `-`).

- [ ] **Step 1: Add the dependency** — `cd apps/web && pnpm add -D liquidjs`.
- [ ] **Step 2: Write the failing test:**
  ```ts
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { describe, expect, it } from 'vitest';
  import { Liquid } from 'liquidjs';
  import { KIND_ARCHETYPE, type SectionArchetype } from '~/services/recipes/kind-archetype';
  import { PreviewService } from '~/services/preview/preview.service'; // exported class, instance method `render(spec, context?)` — apps/web/app/services/preview/preview.service.ts:117

  const REPO_ROOT = join(__dirname, '../../../..');
  const SNIPPETS = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets');

  function buildEngine(): Liquid {
    const engine = new Liquid({ root: SNIPPETS, extname: '.liquid' });
    engine.registerFilter('money', (cents: number) => `$${(cents / 100).toFixed(2)}`);
    engine.registerFilter('image_url', (url: string) => url);
    engine.registerFilter('handle', (s: string) =>
      String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    );
    return engine;
  }

  /** One representative fixture spec per SectionArchetype (hand-picked real template configs). */
  const FIXTURES: Array<{ archetype: SectionArchetype; kind: string; config: Record<string, unknown> }> = [
    { archetype: 'hero', kind: 'hero', config: { title: 'Test Hero', subtitle: 'sub', imageUrl: 'https://example.com/x.jpg' } },
    // ... one entry per archetype (18) + the 2 storefront-only kinds (pdp, sticky-atc) —
    // pull real config shapes from an existing template of that kind via findTemplate() rather
    // than hand-inventing fields, to guarantee the fixture matches what the compiler emits.
  ];

  describe('preview <-> Liquid output-level parity (WS-H, extends the R0 symbol-level guard)', () => {
    for (const fixture of FIXTURES) {
      it(`kind "${fixture.kind}" (${fixture.archetype}): same modifier-class set and same placeholder-vs-real media decision`, async () => {
        const previewHtml = new PreviewService().render(/* spec built from fixture */).html;
        const engine = buildEngine();
        const liquidHtml = await engine.renderFile('superapp-module-sections.liquid', {
          mod_cfg: fixture.config,
          kind: fixture.kind,
          module_id: 'test',
        });

        // Structural markers, not byte-identity (H4).
        const previewClasses = [...previewHtml.matchAll(/class="([^"]*superapp-[^"]*)"/g)].map((m) => m[1]);
        const liquidClasses = [...liquidHtml.matchAll(/class="([^"]*superapp-[^"]*)"/g)].map((m) => m[1]);
        // At minimum, both outputs stamp the same archetype-driven modifier tokens
        // (e.g. 'superapp-section--minimal' present in both or neither).
        const modifierTokens = ['superapp-section--minimal', 'superapp-ph'];
        for (const token of modifierTokens) {
          const inPreview = previewClasses.some((c) => c.includes(token));
          const inLiquid = liquidClasses.some((c) => c.includes(token));
          expect(inLiquid, `${token} parity for ${fixture.kind}`).toBe(inPreview);
        }
      });
    }
  });
  ```
  Run: `cd apps/web && npx vitest run app/__tests__/liquid-preview-parity.test.ts`. Expected: FAIL first on `liquidjs` module resolution (before Step 1) or a filter/tag error inside `superapp-module-sections.liquid` once dependencies exist — Shopify-specific tags/filters not in the base engine will throw; this is the real signal for which shims are still missing beyond the 4 identified in "Verified ground truth."
- [ ] **Step 3: Iterate on the shim** until at least the `hero` fixture renders without a Liquid engine error. Common gaps to expect: `{% liquid %}` multi-statement blocks (liquidjs supports this natively, confirm), `{% render 'partial', var: val %}` resolving the Task 4 partial (needs `root: SNIPPETS` correctly pointed — the new `superapp-module-media.liquid` lives there too), `{% doc %}`/`{% schema %}` tags (liquidjs doesn't know these Shopify-only tags by default — register them as no-op custom tags that consume-and-discard their block, mirroring how `{% comment %}` already behaves).
- [ ] **Step 4: Fill in the remaining 17-19 fixtures** — for each, pull the real `config` from an existing template via `findTemplate()` (`packages/core`) rather than hand-authoring, so the fixture is provably representative of shipped content, not a strawman.
- [ ] **Step 5: Run the full fixture set.** Expected: PASS for every archetype. Any genuine parity break found here (preview shows something the storefront wouldn't, or vice versa) is a real bug — fix the *rendering* code (PreviewService or the Liquid source), not the test.
- [ ] **Step 6: Commit** — `git commit -m "test(ws-h): output-level preview<->Liquid parity fixture, one per archetype kind (extends R0 symbol-level guard)"`.

---

### Task 9: Dedupe the 121 copy-variant templates (34 clusters)

**Files:**
- Create: `packages/core/scripts/find-copy-variant-clusters.mjs`
- Create: `packages/core/scripts/dedupe-copy-variants.mjs`
- Modify: whichever template-library files the dedupe touches (determined by the script's output, not hand-picked)
- Modify: `packages/core/src/__tests__/template-library-integrity.test.ts` (append)

**Interfaces:**
- `find-copy-variant-clusters.mjs` (read-only report, reusable — this is the exact script used to derive the "34 clusters / 121 templates" figure in "Verified ground truth"): prints every cluster of `TemplateEntry`s sharing `type` + a string-blanked `JSON.stringify(config)` fingerprint, sorted by cluster size descending.
- `dedupe-copy-variants.mjs [--cap N] [--check]`: for every cluster over `N` (default 4), keep up to `N` members — preferring any already `tier: 'exemplar'`, then earliest-declared — and delete the rest from their source file. `--check` reports what would be deleted without writing.

- [ ] **Step 1: Write the failing test** — append to `template-library-integrity.test.ts`:
  ```ts
  it('no structural-duplicate cluster exceeds 4 members (Tmpl dedupe)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const groups = new Map<string, string[]>();
    for (const t of ALL_TEMPLATES) {
      const key = t.spec.type + '::' + JSON.stringify(blankStrings(t.spec.config));
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(t.id);
    }
    const oversized = [...groups.entries()].filter(([, ids]) => ids.length > 4);
    expect(oversized, JSON.stringify(oversized.map(([, ids]) => ids))).toEqual([]);
  });

  it('every RECIPE_SPEC_TYPE still has at least one template after dedupe (coverage floor)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const { RECIPE_SPEC_TYPES } = await import('../allowed-values.js'); // packages/core/src/allowed-values.ts:1587
    const coveredTypes = new Set(ALL_TEMPLATES.map((t) => t.spec.type));
    const missing = RECIPE_SPEC_TYPES.filter((t: string) => !coveredTypes.has(t));
    expect(missing).toEqual([]);
  });
  ```
  (`blankStrings` — extract the same recursive string-blanking helper used in the ad hoc analysis script into a small shared function at the top of the test file, or into `find-copy-variant-clusters.mjs` and import it — don't duplicate the logic a third time.)
  Run: `cd packages/core && npx vitest run src/__tests__/template-library-integrity.test.ts`. Expected: FAIL on the first new test — 34 clusters currently exceed 4 (many exceed it by a lot, e.g. the 22-member `PXY-MOD` cluster).
- [ ] **Step 2: Write `find-copy-variant-clusters.mjs`** (promote the ad hoc analysis used to derive the ground-truth numbers into a committed, reusable script — same fingerprinting logic as the test above, but as a CLI report):
  ```js
  #!/usr/bin/env node
  import { ALL_TEMPLATES } from '../dist/templates/index.js';

  function blankStrings(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return typeof obj === 'string' ? 'S' : obj;
    }
    if (Array.isArray(obj)) return obj.map(blankStrings);
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, blankStrings(obj[k])]));
  }

  const groups = new Map();
  for (const t of ALL_TEMPLATES) {
    const key = t.spec.type + '::' + JSON.stringify(blankStrings(t.spec.config));
    (groups.get(key) ?? groups.set(key, []).get(key)).push(t);
  }
  const clusters = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  console.log(`${clusters.length} clusters, ${clusters.reduce((s, c) => s + c.length, 0)} templates total.`);
  for (const c of clusters) console.log(`  ${c.length}  ${c.map((t) => t.id).join(', ')}`);
  ```
  Run it (`node packages/core/scripts/find-copy-variant-clusters.mjs` after `pnpm --filter @superapp/core build`) and confirm it reproduces the "34 clusters, 121 templates" figure exactly — this is the regression check that the ground-truth number in this plan is still accurate before the codemod runs.
- [ ] **Step 3: Write `dedupe-copy-variants.mjs`** — reuses the clustering logic (import or copy the same `blankStrings`/grouping code), then for each oversized cluster: sort members (`exemplar`-tier first, then by `id`), keep the first `N` (default 4), and for the rest, find-and-remove their `TemplateEntry` object literal from its source `.ts` file (this requires locating the export array entry by `id:` — do this with a targeted regex per known file structure, e.g. matching from `{ id: '<id>',` to the matching closing `},` at the same brace depth; **verify each deletion by diff before moving to the next file** — this is exactly the kind of mechanical-but-risky edit worth a careful implementation, not a one-shot regex across the whole tree).
- [ ] **Step 4: Run it for real**, capped at 4: `node packages/core/scripts/dedupe-copy-variants.mjs --cap 4`.
- [ ] **Step 5: Rebuild and verify:**
  ```bash
  cd packages/core && pnpm build && npx vitest run src/__tests__/template-library-integrity.test.ts
  ```
  Expected: PASS on both new tests. Also re-run `node packages/core/scripts/find-copy-variant-clusters.mjs` — expect `0 clusters` over the cap (some clusters of exactly the cap size are fine and expected to remain, e.g. any cluster that was already ≤4).
- [ ] **Step 6: Run the wider suite** for fallout (RAG search, solution-search ranking, and any test that pins `ALL_TEMPLATES.length` or a specific deleted `id`). There is no dedicated `solution-search.test.ts` file — its consumers are covered by `apps/web/app/__tests__/create-module-stream.route.test.ts` and `apps/web/app/__tests__/requirement-search-generation.test.ts` (confirmed via `grep -rl "solution-search\|searchSolutions" apps/web/app/__tests__`):
  ```bash
  grep -rn "ALL_TEMPLATES.length\|MODULE_TEMPLATES.length" apps/web/app packages/core/src --include="*.ts"
  cd apps/web && npx vitest run app/__tests__/create-module-stream.route.test.ts app/__tests__/requirement-search-generation.test.ts
  ```
  Update any pinned count to the new total (575 minus the deleted count).
- [ ] **Step 7: Commit** — `git commit -m "refactor(ws-h): dedupe 121 copy-variant templates down to a 4-per-cluster cap across 34 clusters (Tmpl dedupe)"`, with the exact before/after template count in the commit body.

---

### Task 10: Tier-tag the remaining ~546 untagged templates

**Files:**
- Create: `packages/core/scripts/tag-template-tiers.mjs`
- Modify: whichever template files the script touches
- Modify: `packages/core/src/__tests__/template-library-integrity.test.ts` (append)

**Interfaces:**
- Heuristic (documented in the script, not hidden): a template already tagged keeps its tag. An untagged template gets `tier: 'standard'` by default; `tier: 'floor'` if it's part of a (post-Task-9) surviving copy-variant cluster and is NOT the cluster's best member (cluster ranking: prefer more complete `config` — most populated optional fields — as a proxy for "more finished," same idea `dedupe-copy-variants.mjs` used for "keep the exemplar first"); everything in `COVERAGE_TEMPLATES` (the coverage-floor file) gets `tier: 'floor'` explicitly, since its entries exist to satisfy the "every type has ≥1 template" invariant, not to be recommended.

- [ ] **Step 1: Write the failing test** — append to `template-library-integrity.test.ts`:
  ```ts
  it('every template carries a tier (Tmpl tier-tag library)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const untagged = ALL_TEMPLATES.filter((t) => !t.tier).map((t) => t.id);
    expect(untagged).toEqual([]);
  });
  ```
  Run: `cd packages/core && npx vitest run src/__tests__/template-library-integrity.test.ts`. Expected: FAIL — currently ~546 (minus whatever Task 9 deleted) untagged ids listed.
- [ ] **Step 2: Write `tag-template-tiers.mjs`** implementing the heuristic above, `--check`/write modes matching the pattern of the other two scripts in this plan.
- [ ] **Step 3: Run it for real**, spot-check 5-6 diffs across different files/categories by hand.
- [ ] **Step 4: Rebuild and verify:**
  ```bash
  cd packages/core && pnpm build && npx vitest run src/__tests__/template-library-integrity.test.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Run `solution-search.server.ts`'s consumers** — tier now affects ranking for 546 more templates than before, so ranking-order assertions in its two known test consumers may shift:
  ```bash
  cd apps/web && npx vitest run app/__tests__/create-module-stream.route.test.ts app/__tests__/requirement-search-generation.test.ts
  ```
  Fix any assertion that hardcoded an expected top-result id that a newly-`exemplar`-adjacent-but-actually-`standard` template now displaces — re-verify the NEW ranking is sensible (better match, not just "test now passes"), don't just chase green.
- [ ] **Step 6: Commit** — `git commit -m "feat(ws-h): tier-tag the remaining ~546 untagged templates (heuristic + coverage-floor pass)"`.

---

## Execution order & shippability

1. **Task 1 (decision gate) must run first** — nothing else in this plan depends on its outcome, but it should be resolved before Task 2 executes, and the controller ruling should be on record before any of Tasks 3-10 land (so the program's decision log stays chronologically honest).
2. **Task 2** depends only on Task 1's ruling (skip entirely if "invest").
3. **Tasks 3, 4-5, 6-7, 8, 9, 10 are otherwise independent of each other** and of Task 2 — they touch disjoint files (install route / Liquid source+assets / template-library colors / template-library structure / new test infra / template-library tags) and can run in any order or in parallel across worktrees. The one soft ordering preference: **Task 4 before Task 5** (the media-partial sweep changes byte counts that Task 5's "iterate until ≤95,000B" step needs as its starting baseline), and **Task 9 before Task 10** (dedupe first so tier-tagging's cluster-ranking heuristic runs against the final template set, not templates about to be deleted).
4. **Each task is independently shippable** — every task ends with its own green test run and its own commit; none requires a later task to be "done" for its own tests to stay green. A partial landing (e.g. Tasks 1-3 merged, 4-10 still in flight) leaves the repo in a fully working, fully tested state at every commit boundary.
5. **CI gate check:** after Task 5, `node scripts/build-theme-liquid.mjs --check` must exit 0 with the aggregate at or under 95,000 B — this is the single hard release-blocking number for this workstream; every other task is a genuine improvement but not a build-breaking gate.

## Out of scope

- **Investing in `playful`/`tech-utility` as real third/fourth packs** (the "invest" branch of Task 1) — scoped as a standalone follow-up if the controller chooses it, not sized into this plan.
- **Wiring `check:demo-palettes`/`find-copy-variant-clusters`/tier-check into CI** — these are new local verification scripts (Tasks 6, 9, 10); adding them as blocking CI gates belongs to WS-B (the CI-gates workstream), not WS-H. Noted in each task's commit body so WS-B can pick it up.
- **Grouping copy-variant clusters into a "N variants" expandable UI** in the merchant template browser — H2 chose deletion over a UI-grouping layer; if a future need for intentional copy variation (e.g. A/B-testable template flavors) emerges, that is new product surface, not a WS-H cleanup task.
- **Removing dead `[data-sa-pack="playful"]`/`[data-sa-pack="utility"]` CSS rule blocks** left behind by Task 2's pack collapse — CSS budget is separate/uncontested and this is a WS-I dead-code cleanup concern, not a WS-H Liquid-budget one.
- **A full production-grade Shopify-Liquid-compatible rendering engine** — Task 8's `liquidjs` + 4-filter shim is scoped exactly to what the module-renderer family actually uses (measured, not guessed); it is a test-infrastructure investment, not a shippable Liquid runtime for any other purpose.
- **Re-running the live-store probe** (WS-E Task 17's territory) to confirm installed-template storefront rendering end-to-end on a real Shopify store — this plan's verification is all static/unit-level (build script + Vitest); a real-store visual check of a post-WS-H template install is worth doing once during WS-S (Submission gate) burn-in, not duplicated here.
