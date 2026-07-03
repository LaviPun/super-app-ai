# Reality Audit: `moduleSystemVersion` v1/v2 Flag

**Subsystem:** `AppSettings.moduleSystemVersion` (`v1` | `v2`)
**Question:** Does `v2` change the generation or rendering path anywhere on the live path, or is it a placeholder? Did the config-driven-settings work (spec 027) change anything the v2 flag gates?
**Verdict up front:** Unchanged. The flag is **persisted, settable, and read on exactly one live loader** — but the value it computes (`v2Form`/`engine`) is **still never consumed by any rendered UI**. Generation still ignores it. The new config-driven-settings work is a **parallel, flag-independent mechanism** on `generate._index.tsx` that does not read `moduleSystemVersion`, so it does not touch anything the v2 flag gates.

---

## Re-audit delta (2026-07-03, HEAD 4f056da)

| Prior finding | Status | Current evidence |
|---|---|---|
| **#1** Flag exists as `AppSettings` field, `v1`\|`v2`, default `v1`; settable via Internal → Settings | **STILL-OPEN (still already-executed)** | Unchanged & live. Service typing `apps/web/app/services/settings/settings.service.ts:31,71,103,196`; toggle action `apps/web/app/routes/internal.settings.tsx:150-152`; UI Select `internal.settings.tsx:596-597`. Plumbing remains genuinely wired. |
| **#2** `v2` renders module settings from control packs (the payoff) | **STILL-OPEN** | Still orphaned. `modules.$moduleId.tsx:211-220` computes `v2Form`; `:222` returns it in loader JSON. Component destructure `modules.$moduleId.tsx:316` **still pulls only** `{ moduleId, mod, spec, versions, themes, publishedThemeId, hydration }` — not `v2Form`, not `engine`. `<ConfigEditor` JSX mounts app-wide: **0** (`grep -rn "<ConfigEditor" apps/web/app/` → no matches). `ConfigEditor` imported at `modules.$moduleId.tsx:18`, never rendered. `useV2` (`ConfigEditor.tsx:366`) never reached. Form still dropped on the floor. |
| **#3** Generation runs a different (v2) path when flag on | **STILL-OPEN** | Generation still does not read the flag. `grep moduleSystemVersion` across `api.ai.create-module.tsx`, `api.ai.hydrate-module.tsx`, `services/ai/`, **and the new `generate._index.tsx`** → **0 matches**. Prompts identical regardless of flag. |
| **#4** `?engine=v2` per-request override | **STILL-OPEN** | Still absent. `grep -rn "engine=v2\|get('engine')\|get(\"engine\")\|searchParams.get('engine')" apps/web/app/` → **0 matches**. `generate._index.tsx` imports `useSearchParams` (`:2`) but never reads an `engine` param. |
| **#5** v2 manifest coverage ("migrate types incrementally") | **STILL-OPEN** | Still exactly **one** manifest: `theme.section` (`packages/core/src/control-packs/module-manifests.ts:13-20`). `MANIFESTS` remains a single-key `Partial<Record<…>>`. `hasManifest` still gates the (dead) v2 branch to `theme.section` only. |
| **#6** A/B compare (latency/token/repair) keyed on flag | **STILL-OPEN** | Still absent. No metrics read `moduleSystemVersion`; nothing branches on it to compare. |

### NEW findings

- **NEW-A — Config-driven settings (commit 84417b1) is NOT the v2 flag payoff.** The Phase 1c work adds a real settings form for non-storefront module types, but it branches on module *type*, not on the engine flag: `generate._index.tsx:1134` `const isStorefront = moduleType === 'theme.section' || moduleType === 'proxy.widget';` then `:1135 if (!isStorefront) {` renders the config-driven form (`NonStorefrontSettingsForm`, `generate._index.tsx:1086-1130`) that writes top-level scalar fields straight into `recipe.config`. It does **not** import or read `moduleSystemVersion`, `hasManifest`, `buildAdminFormConfig`, or `V2Form` (`grep` over `generate._index.tsx` → 0 matches). So the "settings now render from config" payoff the v2 flag *promised* was delivered by a **separate, always-on** mechanism that ignores the flag entirely. The v2 control-pack renderer (`SchemaForm` via `ConfigEditor`) is still the orphaned one.
- **NEW-B — The live builder moved to `generate._index.tsx`; `modules.$moduleId.tsx` still holds the only (dead) flag read.** Commits f459b49/0d9ac77 make `generate._index.tsx` the real streaming builder+preview surface, and it never touches the flag. The sole `moduleSystemVersion` consumer outside `settings.service.ts` remains the dead loader branch in `modules.$moduleId.tsx:211`. So as the app's builder UX advanced, the flag's one branch got *more* vestigial, not less.

**Net for this subsystem: 0 fixed / 6 still-open (+2 new observations reinforcing still-open).**

---

## Claim-by-claim (current state)

### 1. The flag exists as an `AppSettings` field, `v1`|`v2`, default `v1`

| | |
|---|---|
| **Claim** | "Flag: `AppSettings.moduleSystemVersion` (`v1`\|`v2`, default `v1`), toggle in Internal → Settings." |
| **Reality** | Prisma column real (`apps/web/prisma/schema.prisma` `moduleSystemVersion String @default("v1")`). Typed + defaulted + defensive un-migrated fallback in `settings.service.ts:31,45,71,103,196`. Settable via Internal → Settings toggle: `internal.settings.tsx:150-152` (action), `:596-597` (UI Select). |
| **wired** | live |
| **verdict** | already-executed |
| **action** | keep |

### 2. `v2` renders module settings from composable control packs (the payoff)

| | |
|---|---|
| **Claim** | "v2 renders module settings from composable control packs"; consume the hydrate schema behind the v2 flag, keep `ConfigEditor` as v1 fallback. |
| **Reality** | `modules.$moduleId.tsx:211-220` builds `v2Form` when `engine==='v2' && hasManifest(type)` and returns it (`:222`), but the component destructure `:316` omits `v2Form`/`engine` and there is **no `<ConfigEditor>` JSX anywhere** in `apps/web/app/`. `ConfigEditor.tsx:366,435-464` (the `useV2` → `<SchemaForm>` branch) is real but never reached. Orphaned exactly as before. |
| **wired** | built-not-wired |
| **verdict** | partial |
| **action** | wire-up (mount `ConfigEditor` with `engine`/`v2Form`) or prune the flag + branch |

### 3. Generation runs a different (v2) path when the flag is on

| | |
|---|---|
| **Claim** | "…behind the `moduleSystemVersion` / `?engine=v2` flag where it touches generation." |
| **Reality** | Generation does not read the flag. `grep moduleSystemVersion` over `api.ai.create-module.tsx`, `api.ai.hydrate-module.tsx`, `services/ai/`, `generate._index.tsx` → 0 matches. Only `settings.service.ts` (write/read plumbing) and the dead `modules.$moduleId.tsx` branch reference it. |
| **wired** | absent |
| **verdict** | not-required (as currently built) |
| **action** | document-honestly (docs imply generation branches; it does not) |

### 4. `?engine=v2` per-request override

| | |
|---|---|
| **Claim** | "…or a per-request `?engine=v2`." |
| **Reality** | No query-param override. `grep` for `engine=v2` / `get('engine')` across `apps/web/app/` → 0 matches. `engine` on the module route is only the DB `AppSettings` value. |
| **wired** | absent |
| **verdict** | not-required |
| **action** | prune from docs (or wire-up if A/B is wanted) |

### 5. v2 manifest coverage ("migrate types incrementally")

| | |
|---|---|
| **Claim** | "Remaining types are migrated incrementally"; broad control-pack coverage implied. |
| **Reality** | Exactly one manifest: `theme.section` (`module-manifests.ts:13-20`). `hasManifest` gates the (dead) v2 branch to that single type; every other type would fall back to v1 even if the render path were wired. |
| **wired** | stub (single-type) |
| **verdict** | partial |
| **action** | document-honestly (coverage is 1 type, not "types") |

### 6. A/B "compare which is better"

| | |
|---|---|
| **Claim** | "Keep v1 intact. Compare on latency, token cost, repair rate. Promote v2 when metrics win." |
| **Reality** | No A/B instrumentation keyed on the flag. Generation never branches (#3) and render output is discarded (#2), so there is nothing to compare. |
| **wired** | absent |
| **verdict** | not-required |
| **action** | prune (or rebuild if A/B is a real goal) |

---

## Live-path trace (current)

- **Write path:** `internal.settings.tsx:150` → `SettingsService.update({ moduleSystemVersion })` → Prisma upsert. **Real, live.**
- **Read path (only one, still dead):** `modules.$moduleId.tsx:211` → builds `v2Form` (`:212-220`) → returned in loader JSON (`:222`) → destructure `:316` omits it → **consumed by nothing.**
- **Generation path:** create-module / hydrate-module / `services/ai/*` / the new `generate._index.tsx` → **never read the flag.**
- **Config-driven settings (NEW, flag-independent):** `generate._index.tsx:1134-1135` branches on `isStorefront` (module type), not the flag, to render `NonStorefrontSettingsForm` (`:1086-1130`) writing scalars into `recipe.config`. Delivers a settings payoff **without** `moduleSystemVersion`.
- **Renderer chain (orphaned):** `ConfigEditor.tsx` `useV2`→`SchemaForm` branch (`:366,435-464`) — zero JSX callers app-wide. `SchemaForm.tsx` is used live only by `data.$storeKey.tsx` (unrelated, does not read the flag).

## Bottom line

Unchanged since the last audit: `moduleSystemVersion` is still plumbing without a payoff — column/service/toggle are live, `modules.$moduleId.tsx` still composes a `v2Form` that no component renders, generation still ignores the flag, `?engine=v2` still doesn't exist, only `theme.section` has a manifest, and there is no A/B; the new spec-027 config-driven-settings work delivered a settings form via a separate always-on `isStorefront` branch that never reads the flag, so setting a store to `v2` today still changes nothing observable — either finish the wire-up (mount `ConfigEditor`) or prune the flag and correct the docs.
