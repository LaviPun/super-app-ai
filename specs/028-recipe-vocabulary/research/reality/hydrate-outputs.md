# Reality Audit — Hydrate outputs rendering

**Subsystem:** HydrateEnvelope outputs — `adminConfigSchemaJson` / `themeEditorSettingsJson` / `uiTokensJson` / `validationReportJson` / `implementationPlanJson` / `previewHtmlJson`.
**Question:** which are persisted, which are actually rendered to a merchant vs generated-and-dropped.
**Branch at latest audit:** `feat/027-unified-builder`, HEAD `4f056da` (prior audit: `feat/superapp-redesign` @ `a948f1c`).
**Method:** traced the live write path (hydrate action → DB) and every read path (loaders/components/routes) at current HEAD. Accepted no claim without a caller.

---

## Re-audit delta (2026-07-03, HEAD 4f056da)

The subsystem is **materially unchanged**. The two files the recheck flagged as changed did change (+28 / +43), but neither touched a hydrate-output read path:

- `modules.$moduleId.tsx` (+28): the entire delta is the **removal of the dead `computeRepublishDiff` loader compute** (`git diff a948f1c HEAD` shows only the `-import computeRepublishDiff`, the deleted `republishDiff` IIFE, and its drop from the `json(...)` payload). This resolves the prior audit's cross-cutting note (§ "stale doc line 190"). It does **not** touch the validation render, the ConfigEditor import, the hard-coded settings tab, or the preview skeleton.
- `preview.service.ts` (+43): the delta is a **new deterministic `discountUiSurfacePreview`** for the new `admin.discountUi` type (`preview.service.ts:647-687`), driven from `spec.config` via `cfgVal` — **not** from any hydrate output. PreviewService remains fully deterministic.
- The "config-driven settings" (84417b1) and "render the REAL module in preview" (f459b49) work landed entirely in the **/generate builder** (`generate._index.tsx`, +378), and reads **`recipe.config`**, not the hydrate envelope. Grep for `adminConfigSchemaJson|themeEditorSettings|uiTokens|implementationPlan|previewHtmlJson|hydrat` in `generate._index.tsx` returns **zero hits**. So the config-driven settings did NOT wire `adminConfigSchemaJson` (or any hydrate output) into the UI.

Prior findings, rechecked at current file:line:

| Prior finding | Status | Current evidence |
|---|---|---|
| validation report is the only rendered output | **STILL-OPEN (unchanged)** | Rendered in Overview "Validation" card `modules.$moduleId.tsx:610-625`; loader parse `:190-207`. |
| **`pass` vs `PASS` casing bug** paints every check red | **STILL-OPEN — NOT FIXED** | Test is still `c.status === 'pass'` (lowercase) at `modules.$moduleId.tsx:617-618`; schema still emits uppercase `'PASS'` at `hydrate-envelope.server.ts:11`. Verbatim unchanged. |
| `adminConfigSchemaJson` renderer imported but never mounted | **STILL-OPEN (unchanged)** | `ConfigEditor` imported `modules.$moduleId.tsx:18`; **no `<ConfigEditor` JSX** anywhere in the 677-line file. Component still destructures only `{ moduleId, mod, spec, versions, themes, publishedThemeId, hydration }` (`:316`) — `adminConfig`/`previewHtml`/`v2Form`/`engine` dropped. Settings tab still hard-coded name/notes/delete (`:660-673`). Render chain `ConfigEditor`→`SchemaForm` still exists+reads the field (`ConfigEditor.tsx:369-370,459`). |
| `previewHtmlJson` never generated; never rendered | **STILL-OPEN (unchanged)** | `previewHtml` still absent from `hydrate-prompt.server.ts` (grep: 0 hits) → write is `previewHtmlJson: envelope.previewHtml ?? null` at `api.ai.hydrate-module.tsx:105` = always null. Loader read `:155-156` still fed to `previewHtml`, still never destructured; Overview is still the hard-coded `fake-pdp` skeleton `:583-601`. Real preview `preview.$moduleId.tsx:24` renders exclusively from `PreviewService`. |
| deterministic `PreviewService` is the real preview | **CONFIRMED (strengthened)** | `preview.$moduleId.tsx:24` and the /generate builder both render `PreviewService` output; +43 added another deterministic case (`discountUiSurfacePreview`). No path renders AI preview HTML. |
| `themeEditorSettingsJson` / `uiTokensJson` persisted but inert | **STILL-OPEN (unchanged)** | Written `api.ai.hydrate-module.tsx:101-102`; carried forward `module.service.ts:79-80,121-122`; selected into `internal.stores.$storeId.tsx:126-127,153` but component body (`:490-583`) renders none. `llm.server.ts:1966-1987` refs are envelope-repair, not render. |
| `implementationPlanJson` persisted, lossy on version copy, inert | **STILL-OPEN (unchanged)** | Written `api.ai.hydrate-module.tsx:104`; still **omitted** from both version-copy blocks in `module.service.ts` (`:77-81` copies 5 fields, `:119-123` copies 5 fields — `implementationPlanJson` and `previewHtmlJson` absent from both). Selected into `internal.stores.$storeId.tsx:123,152` but never rendered. |
| `fill-settings` route has no UI caller | **STILL-OPEN (unchanged)** | No `<ConfigEditor`/fill-settings trigger in `modules.$moduleId.tsx`; the hydrate card exposes only `generateSettings` (`:461-463`). |
| `internal.stores` over-fetches all six blobs | **STILL-OPEN (unchanged)** | `select` at `:152-153` ships all six; component renders none. |

**NEW findings:**
- **N1 — `admin.discountUi` (new 20th target) follows the same generate-and-drop pattern.** Its preview is a real deterministic renderer (`preview.service.ts:647-687`) fed from `spec.config`; its hydrate outputs (if hydrated) land in the same write-only columns. No new render path for any hydrate output was added for it.
- **N2 — `republishDiff` render gap is now closed by deletion, not by wiring.** The prior audit's "stale doc line 190 / dead loader compute" note is resolved: the compute is gone (`modules.$moduleId.tsx` −25 lines). This is a *removal*, not a new consumer — it does not add any hydrate-output rendering.

Net: **0 fixed** of the two prior open defects (casing bug + adminConfig-never-mounted). The only behavioral change in-scope is the removal of the already-dead `republishDiff` compute (a cleanup, not a fix to any listed hydrate output).

---

## The envelope and where it is written

The Zod envelope (`apps/web/app/schemas/hydrate-envelope.server.ts`) defines all six output groups. Both hydrate actions persist them to `ModuleVersion` columns:

- Merchant path: `apps/web/app/routes/api.ai.hydrate-module.tsx:99-105`
- Agent path: `apps/web/app/routes/api.agent.modules.$moduleId.hydrate.tsx:96-101`

DB columns exist for all six (`apps/web/prisma/schema.prisma`). **Persistence is real and complete.** The question is what happens on the *read* side.

Two prompt facts constrain reality up front:
- `previewHtml` is **not requested** in the hydrate prompt (`hydrate-prompt.server.ts` has no `previewHtml` mention; MEMORY.md confirms it was removed to fix a timeout) → `previewHtmlJson` is effectively **always null** in production (`api.ai.hydrate-module.tsx:105` writes `envelope.previewHtml ?? null`).
- `themeEditorSettings` and `uiTokens` **are** requested and persisted, but have no read-side consumer (below).

---

## Per-output findings

### adminConfigSchemaJson

| | |
|---|---|
| **Claim** | "SchemaForm.tsx renders `{jsonSchema,uiSchema}` from the hydrate `adminConfigSchemaJson` (closes the generate-but-never-render gap)" — `docs/module-settings-modernization.md`. |
| **Reality** | Merchant module-detail route **imports `ConfigEditor` but never renders it** (`modules.$moduleId.tsx:18` import; no `<ConfigEditor` JSX in the 677-line file). Loader parses `adminConfig` (`:142-150`) and returns it (`:222`), but the component destructures only `{ moduleId, mod, spec, versions, themes, publishedThemeId, hydration }` (`:316`) — `adminConfig`, `v2Form`, `previewHtml`, `previewJson`, `engine` are dropped. The "Settings" tab renders a **hard-coded** name/notes/delete form (`:660-673`). `ConfigEditor.tsx:369-370,459` *does* consume `adminConfig.jsonSchema`→`SchemaForm` — but nothing mounts `ConfigEditor`. Live server consumer: `api.ai.fill-settings.tsx` still parses `adminConfigSchemaJson` for fill-missing, but has no UI trigger. The 027 config-driven-settings work edits `recipe.config`, not this field. |
| **wired** | **built-not-wired** (render chain exists and reads the field, but is not mounted; parse-in-loader is dead) |
| **verdict** | **partial** (persisted + read by one server route, not rendered to a merchant) |
| **action** | **wire-up** (mount `ConfigEditor`/`SchemaForm` on the settings surface — 027 task "1c-full") |

### validationReportJson

| | |
|---|---|
| **Claim** | Validation report is surfaced to the merchant after hydrate; overall PASS/WARN plus per-check results (`ValidationReportSchema`, `hydrate-envelope.server.ts`). |
| **Reality** | The **one output actually rendered to a merchant.** Loader parses it into `hydration.validationReport` (`modules.$moduleId.tsx:190-207`); component renders the first 6 checks in an Overview "Validation" card (`:610-625`). **BUG (unfixed):** the icon/color test is `c.status === 'pass'` (lowercase) at `:617-618`, but the schema emits uppercase `'PASS'` (`hydrate-envelope.server.ts:11`) → every check renders with the alert icon and `var(--p-critical)` red regardless of actual status. |
| **wired** | **live** (rendered), with a correctness bug |
| **verdict** | **partial** (renders, but casing bug makes the status signal wrong) |
| **action** | **keep** + fix the `'pass'`→`'PASS'` comparison at `modules.$moduleId.tsx:617-618` (still open) |

### previewHtmlJson

| | |
|---|---|
| **Claim** | "Preview: prefer AI-generated `previewHtmlJson`, fall back to static PreviewService" — comment `modules.$moduleId.tsx:152`. |
| **Reality** | **Never generated** (not in the hydrate prompt → `api.ai.hydrate-module.tsx:105` writes null). Even if present: loader read at `:155-156` feeds `previewHtml`, which the component **never destructures or renders** (Overview "Live preview" `:583-601` is a hard-coded `fake-pdp` skeleton). The real preview route (`window.open('/preview/…')`, `:454`) is `preview.$moduleId.tsx`, which renders **exclusively from `PreviewService`** (`:24`) and never reads `previewHtmlJson`. No path renders AI preview HTML. |
| **wired** | **absent** (not generated; not rendered on any path) |
| **verdict** | **not-required** (deterministic `PreviewService` is the real, working preview) |
| **action** | **prune** the `previewHtml`/`previewHtmlJson` field, its loader read, and the two null-writes; **document-honestly** that preview is deterministic-only |

### themeEditorSettingsJson

| | |
|---|---|
| **Claim** | Generated + persisted as theme-editor field definitions (`ThemeEditorSettingsSchema`; prompt guidance in `hydrate-prompt.server.ts`). |
| **Reality** | Generated (in prompt), persisted (`api.ai.hydrate-module.tsx:101`), carried forward on version-copy (`module.service.ts:79,121`), selected into internal-store loader (`internal.stores.$storeId.tsx:126,153`). **No read path parses or renders it** — the only non-write refs are envelope-repair in `llm.server.ts:1966-1985` and the internal.stores select (shipped to the browser as dead JSON; component body `:490-583` renders none). |
| **wired** | **built-not-wired** (write + carry-forward; zero render/consume) |
| **verdict** | **partial** (persisted but inert) |
| **action** | **document-honestly** now; **wire-up** only if a theme-editor field UI is actually planned, else **prune** |

### uiTokensJson

| | |
|---|---|
| **Claim** | Generated design tokens (`UiTokensSchema`; prompt in `hydrate-prompt.server.ts`). |
| **Reality** | Same shape as themeEditorSettings: generated, persisted (`api.ai.hydrate-module.tsx:102`), carried forward (`module.service.ts:80,122`), selected into internal.stores loader (`internal.stores.$storeId.tsx:127,153`), and **never parsed or rendered** (only envelope-repair `llm.server.ts:1986-1987`). No consumer applies these tokens to any preview or admin UI; PreviewService derives its own colors from `spec.config`. |
| **wired** | **built-not-wired** (persisted; zero consumers) |
| **verdict** | **partial** (persisted but inert) |
| **action** | **document-honestly** / **prune** (or wire into `PreviewService`/style layer if intended) |

### implementationPlanJson

| | |
|---|---|
| **Claim** | AI hydrate output "implementation plan" (runtime hooks + file-by-file). |
| **Reality** | Written when present (`api.ai.hydrate-module.tsx:104`), selected into internal.stores loader (`internal.stores.$storeId.tsx:123,152`) — but the component **never renders it**. **NOT carried forward** on version copy: both `module.service.ts:createNewVersion` (`:77-81`) and `markPublished` (`:119-123`) copy 5 hydrate fields and silently omit `implementationPlanJson` **and** `previewHtmlJson`. Persisted value is lost on the first save/publish after hydrate. No merchant-facing render. |
| **wired** | **built-not-wired** (written; dropped on version copy; never rendered) |
| **verdict** | **partial** (persisted transiently, inert, lossy) |
| **action** | **document-honestly**; **prune** unless an internal "how it was built" view is planned (then also fix the version-copy omission) |

---

## Cross-cutting reality notes

- **`api.ai.fill-settings.tsx` still has zero UI callers.** Real working server route that reads `adminConfigSchemaJson`, but no route/component triggers it. The hydrate card exposes only `generateSettings` (`modules.$moduleId.tsx:461-463`). **built-not-wired.**
- **`republishDiff` render is gone by deletion.** The dead loader compute was removed from `modules.$moduleId.tsx` (the entire +28/−25 delta). This closes the prior stale-doc note but adds no new hydrate-output rendering.
- **`internal.stores.$storeId.tsx` still over-fetches** all six hydrate blobs (`select` `:152-153`) and ships them (`:123-127`) with no render — pure dead weight.
- **The 027 "config-driven settings" and "real preview" work is orthogonal to hydrate outputs.** Both operate on `recipe.config` (`generate._index.tsx:271,291-296,314-322,387-392`), never on the hydrate envelope. They are genuine improvements to the builder, but they do **not** close any of the six generate-and-drop gaps.
- **New `admin.discountUi` type** got a deterministic preview (`preview.service.ts:647-687`) but no new hydrate-output consumer.

---

## Summary table

| Output | Persisted | Rendered to merchant | wired | verdict | action |
|---|---|---|---|---|---|
| adminConfigSchemaJson | yes | no (ConfigEditor imported, never mounted; server-side fill-settings only) | built-not-wired | partial | wire-up |
| validationReportJson | yes | yes (Overview card) — casing bug unfixed | live | partial | keep + fix bug |
| previewHtmlJson | yes (always null) | no (real preview is PreviewService) | absent | not-required | prune |
| themeEditorSettingsJson | yes | no | built-not-wired | partial | document / prune |
| uiTokensJson | yes | no | built-not-wired | partial | document / prune |
| implementationPlanJson | yes (lost on version copy) | no | built-not-wired | partial | document / prune |

---

## Bottom line

Nothing in-scope was fixed since `a948f1c`: exactly one hydrate output (the validation report) still renders to a merchant and its `'pass'` vs `'PASS'` casing bug still paints every check red at `modules.$moduleId.tsx:617-618`, `adminConfigSchemaJson`'s `ConfigEditor`→`SchemaForm` renderer is still imported-but-never-mounted, `previewHtmlJson` is still never generated, and `themeEditorSettingsJson`/`uiTokensJson`/`implementationPlanJson` are still persisted-and-dropped (the last two lossy on version copy) — the 027 "config-driven settings" and "real preview" wins operate on `recipe.config`, not the hydrate envelope, so the generate-but-never-render gap remains open on this branch.
