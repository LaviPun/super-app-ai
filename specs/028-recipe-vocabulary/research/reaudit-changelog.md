# Re-audit + Doc-Correction Verification Changelog

**Verifier pass · 2026-07-03 · branch `feat/027-unified-builder` · HEAD `4f056da`.**

Adversarial spot-check of the re-audits in `research/reality/`, the doc corrections
under `docs/` (+ `DESIGN.md`), and `synthesis/gap-analysis.md`. Every verdict below
was confirmed by reading the actual code at HEAD, not by trusting the audit prose.

**Bottom line: the corpus + docs are consistent with current code.** All 8 spot-checked
file:line claims held; the 5 edited docs carry the intended corrections and are not
corrupted; the 3 un-edited docs are genuinely already-accurate (per `re-planned-docs.md`);
gap-analysis §0 matches the re-audits and every roadmap item is double-cited. No
unresolved contradictions. Two nits (below) are cosmetic / out-of-scope-for-docs.

---

## 1. Spot-checked audit claims (all CONFIRMED against HEAD code)

| # | Claim (from re-audit) | Verified at | Verdict |
|---|---|---|---|
| 1 | **checkout.block false-published**: registry `runtimeShipped:true`, compiler routes to bare AUDIT, writes nothing, still flips PUBLISHED | `extension-eligibility.ts:157-164` (`runtimeShipped:true`); `compiler/index.ts:49-58` (bare-AUDIT fallthrough, `{ops:[{kind:'AUDIT'}]}`); `publish.service.ts:134-135` (`case 'AUDIT': break`) | ✅ STILL-OPEN confirmed |
| 2 | **postPurchase.offer false-published**: same shape | `extension-eligibility.ts:165-171` (`runtimeShipped:true`); same fallthrough `compiler/index.ts:50` | ✅ STILL-OPEN confirmed |
| 3 | **Orphaned real compilers**: `compileCheckoutBlock`/`compilePostPurchaseOffer` exist, set real payload, **never dispatched** | `checkout.block.ts:12` / `postPurchase.offer.ts:11` exist; `index.ts:1-16` imports 14 compilers, neither among them; grep for callers outside own `export function` = **0** | ✅ STILL-OPEN confirmed (dead code) |
| 4 | **pass/PASS casing bug** paints every validation check red | `modules.$moduleId.tsx:617-618` tests `c.status === 'pass'` (lowercase); `hydrate-envelope.server.ts:11` emits `z.enum(['PASS','WARN','FAIL'])`. Ternary never matches → always `'alert'` icon + `var(--p-critical)`. (Note: line 618 *does* name `var(--p-success)` for the pass branch, but that branch is unreachable, so the audit's "every check red" conclusion is correct.) | ✅ STILL-OPEN confirmed |
| 5 | **ConfigEditor / StyleBuilder unmounted**: config-driven settings render off `recipe.config`, not via ConfigEditor | `grep "<ConfigEditor" apps/web/app` = **0**; `grep "<StyleBuilder"` = **0**; `ConfigEditor` imported at `modules.$moduleId.tsx:18` but never rendered as JSX. Live builder `generate._index.tsx` uses `GenControls`/`GenConfigControls` (`:1090-1183`) reading `recipe.config` scalars; grep for `composeConfig`/`control-pack`/`ConfigEditor`/`SchemaForm` in that file = 0 | ✅ STILL-OPEN confirmed (regression: components now dead) |
| 6 | **flow.automation mislabeled `needs_runtime`** despite a live linear runtime | `extension-eligibility.ts:209-217` (`runtimeShipped:false`); `flow-runner.service.ts:88-99` queries `type:'flow.automation', status:'PUBLISHED'` and executes; `runFlowById` at `:144-158` with paused-guard `:154` | ✅ STILL-OPEN confirmed |
| 7 | **admin.discountUi**: `default: never` hazard → FIXED (explicit case added); honestly `needs_runtime` | `compiler/index.ts:55-58` has explicit `case 'admin.discountUi'` in the bare-AUDIT group; `extension-eligibility.ts:191-197` `runtimeShipped:false`. Gate throws before compiler on merchant path | ✅ FIXED confirmed |
| 8 | **`ensureTypedStore` zero non-test callers; `provisionFromModuleSpec` does not exist** | `grep ensureTypedStore` (excl. def + test) = **0**; `grep provisionFromModuleSpec` = **0** repo-wide. Data export/print/captures routes DO exist (`data.$storeKey_.export.tsx`, `data.$storeKey_.print.tsx`, `api.module-captures.tsx`, `modules.$moduleId_.captures.tsx`) → "all live" claim correct | ✅ STILL-OPEN (typed provisioning) + EXISTS (export/capture) both confirmed |

**Additional cross-checks (all held):** `shopify.app.toml` webhook topics are a fixed set —
`app/uninstalled`, `app/scopes_update`, `orders/create`, `products/update` + 3 GDPR compliance
topics (`shopify.app.toml:16-40`), not "every granted topic"; `webhooks.tsx` is a hand-written
switch over exactly those 4 topics with **no** `topicToTrigger()` call (`webhooks.tsx:19,53,84`);
`publishBlueprint` has **zero callers** (`blueprint.service.ts:121`, def only); `storefront-style.ts:34+`
is coarse enums; `recipe.ts:120+` theme.section is flat fields.

**No audit claim was contradicted by the code.** Path-citation convention note: the audits
cite `publish.service.ts` / `flow-runner.service.ts` by basename; the real paths are
`apps/web/app/services/publish/publish.service.ts` and `.../services/flows/flow-runner.service.ts`.
Line numbers all match; basename-only citation is a consistent convention, not an error.

---

## 2. Per-subsystem FIXED vs STILL-OPEN (verified)

### Extension eligibility / compiler / publish
- **FIXED:** `admin.discountUi` explicit compiler case (`compiler/index.ts:55-58`), closing the
  `default: never` hazard. Type count now honestly 21 (`allowed-values.ts:530-559`; registry;
  audit test `21 − 3 needs_runtime = 18`).
- **STILL-OPEN:** false-published set — `checkout.block`, `postPurchase.offer`,
  `integration.httpSync`, `platform.extensionBlueprint` all `runtimeShipped:true` → pass the gate →
  hit bare-AUDIT (`compiler/index.ts:49-58`) → write nothing → still flip PUBLISHED. Two orphaned
  compilers remain dead code. flow.automation still mislabeled `needs_runtime` despite a live runtime.
  The `runtimeShipped ↔ compiler-wired` seam is still un-tested.

### Control-packs / module-system-v2
- **FIXED:** nothing behavioral. `mustHaveControls` refined to return pack **namespaces**
  (`requirement-spec.server.ts:35-41`) — correctness refinement, still names-only, theme.section-only.
- **STILL-OPEN (regressed):** 0/9 prior findings fixed. Composer (`composeConfig`) still zero
  production callers; only 3/10 packs pinned. `ConfigEditor`/`StyleBuilder` now **fully unmounted**
  (JSX grep = 0). Live builder moved to `generate._index.tsx` reading `recipe.config` directly.
  `adminConfigSchemaJson` generated+persisted but **rendered by nothing** on the primary surface.

### module-system-version (v2 flag)
- **STILL-OPEN:** flag settable + read on one dead loader branch (`modules.$moduleId.tsx:211`),
  consumed by nothing rendered. Generation never reads it (grep = 0 across create/hydrate/services/ai
  /generate._index). `?engine=v2` does not exist. The 027 config-driven settings arrived via a
  **separate always-on `isStorefront` branch** (`generate._index.tsx:1134-1135`), not the flag.

### Hydrate outputs
- **FIXED:** dead `republishDiff` loader compute removed (cleanup).
- **STILL-OPEN:** pass/PASS casing bug (`modules.$moduleId.tsx:617-618`); `adminConfigSchemaJson`
  never mounted; `previewHtmlJson` never generated; `themeEditorSettingsJson`/`uiTokensJson`/
  `implementationPlanJson` persisted-but-inert.

### Blueprints
- **FIXED (additive):** second live generation entry point — `api.ai.create-module.stream.tsx`
  (streaming SSE, now the primary UI call site; batch `create-module` is the fallback).
- **STILL-OPEN:** `composeBlueprint` does not exist (grep = 0; real mechanism = 2-entry catalog
  `blueprint-catalog.ts:41-90`); `publishBlueprint` zero callers (`blueprint.service.ts:121`);
  `injectResolvedBundle` test-only; no data-model provisioning in the blueprint path; cited migration
  filename stale (column lives in baseline `20260702000000_baseline/migration.sql:24,38`).

### Flow automation
- **FIXED:** paused-flow guard on targeted runs (`flow-runner.service.ts:154` throws unless PUBLISHED).
- **STILL-OPEN:** DAG engine / `FLOW_ENGINE_V2` / cron resume / generic `topicToTrigger` dispatch /
  `DeadLetterService` / `recordAdminThrottle` / "Waiting (parked) tile" all unwired. Live path =
  linear `FlowRunnerService` over a hand-written 4-topic webhook switch.

### Backend data layer
- **STILL-OPEN:** `ensureTypedStore` zero non-test callers → `schemaJson` never set → typed
  validation permanent no-op; `provisionFromModuleSpec` does not exist; `SuperAppConnector` never
  registered.
- **EXISTS (docs understate):** CRUD + record grid + CSV export + browser print-to-PDF + DataCapture
  ingestion + captures admin view are **all live**.

### Interactive widget runtime
- **STILL-OPEN (unchanged):** 6-kind allowlist + popup engine; zero spin-to-win/scratchcard/wheel/
  probability/codePool runtime symbols; classifier still accepts "spin the wheel" and silently
  downgrades to a static popup. 027 preview work made the downgrade *visible* but did not fix it.

---

## 3. Doc corrections — edited vs already-accurate

**Edited this pass (5 docs — uncommitted working-tree changes; verified present + non-corrupted,
all code fences balanced):**

| Doc | Correction landed (grep-verified) |
|---|---|
| `docs/blueprints.md` | `publishBlueprint` = **ZERO callers**; `composeBlueprint` purged; co-deploy de-scoped; migration ref → baseline; streaming entry point noted |
| `docs/flow-automation.md` | §9a webhook dispatch **NOT WIRED** (fixed 4-topic switch, not generic); §9b no "Waiting (parked)" tile; §9c DLQ + rate-limit **built-not-wired, tables empty**; needs_runtime set corrected to **three** |
| `docs/module-settings-modernization.md` | schema-driven form **not wired**, generate-but-never-render gap **still open**; RepublishDiff preview **removed** |
| `docs/module-system-v2.md` | "single source of truth" → 3/10 pinned; SchemaForm does **not** consume `adminConfigSchemaJson`; A/B = **"plumbing without payoff"**; data export/capture gap corrected to **all live** |
| `docs/superapp-surface-inventory.md` | **21 types** (was 20); **⚠ false-published bug** documented; needs_runtime = three with the flow.automation pessimistic-mislabel note |

**Already-accurate — correctly left un-edited (confirmed against `re-planned-docs.md`'s explicit
"5 docs need edits" verdict):**

- `DESIGN.md` — §H (line 125) already honestly labels interactive widgets a platform gap; the only
  DESIGN-adjacent action is trimming `intent-examples.ts:37-38` (a **code** change, out of scope for
  doc corrections).
- `docs/data-models.md` — its `schemaJson` "currently unused / no schema enforcement" statements
  (`:51,:269`) **match** reality (typed provisioning is vapor); the export/capture positive correction
  lives authoritatively in `module-system-v2.md`.
- `docs/implementation-status.md` — its v2 lines are **dated historical changelog** entries, not
  current-state assertions; the current-state 2026-07-03 section already carries the honest 027 framing.

---

## 4. gap-analysis.md verification

- **§0 "Closed by 027 work"** — every row cites a re-audit file:line and matches the re-audits
  (admin.discountUi type + explicit case, config-driven settings, real preview, streaming path,
  republishDiff removal, mustHaveControls refinement, honest 21-count, paused-flow guard). The
  "Explicitly NOT closed" list correctly keeps the pass/PASS bug, the 4-type false-published bug, and
  the adminConfig regression open. **Matches the re-audits.**
- **Roadmap double-citation** — every M-item (§1, **M1–M13**) and P-item (§3, **P1–P10**) and every
  R-item (§5, **R0.1–R4.6**) cites both **[EXT]** (a plugin record **or** a Spring-26 platform
  capability) and **[INT]** (`file:line`). Spot-checked INT cites (`storefront-style.ts:34-96`,
  `recipe.ts:120-166`, export routes, `ensureTypedStore`, `provisionFromModuleSpec`) all resolve
  correctly. **PASS.**
- **Spring-26 items present:** M11 (Dev-MCP grounding/validation), M12 (Sidekick App Extension),
  M13 (agentic-commerce surface), plus R1.4/R2.2/R2.6/R3.2/R3.6 and the Tier-4 Spring-26 rows.
- **AI-leverage items present:** M11/M12 + R1.4/R3.6 + R4.6, all citing `ai-leverage.md`.

---

## 5. README refresh

`research/README.md` updated: the gap-analysis description line now reads **M1–M13** (was
M1–M10) and calls out §0 + the Spring-26/AI-leverage items; the evidence-check note now reads
**R0.1–R4.6** (was R0.1–R4.3) and notes EXT may be a plugin **or** a Spring-26 capability. File
inventory itself was unchanged (8 reality audits, 4 synthesis, 9 design, 58 plugins) — those
counts remain correct.

---

## 6. Open nits (cosmetic / out-of-scope — not contradictions)

1. **`intent-examples.ts:37-38`** still contains "spin the wheel" / "scratch card" prompts — the
   P9 / §4.3 trim is a **code** follow-up, not a doc edit; correctly excluded from this doc-correction pass.
2. **README stale self-nit:** `README.md:130-135` flags `surface-matrix.md:3` as saying "57 plugin
   research records" — but that line now reads **58** (already fixed upstream). The README's own nit
   is outdated; the "57→58 wording fix" it lists as the sole optional follow-up is already done.

Neither is a corpus-vs-code contradiction; nit #1 is a pre-flagged code follow-up, nit #2 is a stale
note in the README.
