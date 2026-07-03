# R2.4 — Composer: wire OR prune the v2 flag (DECISION)

**Phase 030 · compositional control-packs.** This resolves the built-not-wired
control-pack composer (`composeConfig` → `SchemaForm`/`ConfigEditor`) gated behind
the default-off `moduleSystemVersion=v2` flag.

> **DECISION: PRUNE (Option B), with a surgical carve-out.**
> Delete the `moduleSystemVersion` flag, the `composeConfig`-driven admin-form
> bridge, the grouped `config-adapter`, the unmounted `ConfigEditor`/`StyleBuilder`,
> and the dead `v2Form` loader branch. **Keep** the `packages/core/src/control-packs/`
> pack *schemas* (they are reusable Zod objects, three of which are load-bearing on
> the live path) and standardize authoring on the live `recipe.config` builder
> (`generate._index.tsx`).
>
> **Why not wire it:** the composer's grouped output shape (`config.content.heading`,
> `config.trigger.mode`) is read by **nothing** downstream. Every live consumer —
> the theme compiler, `PreviewService`, and the storefront Liquid/JS runtime — reads
> **flat** config keys (`config.title`, `config.trigger`, `config.countdownEnabled`).
> Wiring the composer as the source of truth is not "mount a component"; it is a
> rewrite of the entire compile→render chain plus the generation JSON Schema plus a
> back-compat migration of every persisted recipe, to buy a form the always-on
> `GenControls`/`GenConfigControls` builder already delivers. The composer is a
> second, incompatible representation of the same data. Two representations is the
> defect; deleting one is the fix.

The phase is *named* for compositional control-packs — and it stays alive, because
the future rule-builder / discount / recommendation packs (R2.1–R2.3, R2.5) are
**Zod pack schemas pinned onto `config`** exactly like `audience`/`schedule`/
`advancedCustom` already are (§6). What we prune is the *composition-to-form
machinery*, not the *pack concept*. Packs remain the vocabulary; `recipe.config`
(flat, per-type) remains the wire format.

---

## 1. Current state (file:line evidence)

### 1a. The composer chain, and where each link dead-ends
| Link | File:line | State |
|---|---|---|
| Pack contract | `packages/core/src/control-packs/types.ts:64-79` | 10 packs registered (`registry.ts:18-29`). |
| `composeConfig` → grouped Zod schema | `control-packs/compose.ts:44-67` | **No production caller.** Only `admin-form.server.ts:37` + `control-packs.test.ts`. |
| Manifest coverage | `control-packs/module-manifests.ts:13-20` | **Exactly one** manifest: `theme.section`. |
| Admin-form bridge | `apps/web/app/services/control-packs/admin-form.server.ts:34-49` | Calls `composeConfig`; consumed only by the dead loader branch. |
| Grouped↔flat adapter | `apps/web/app/services/control-packs/config-adapter.ts:22-56,60-110` | `specToGrouped`/`groupedToSpec`; only used by `ConfigEditor`. |
| `v2Form` computed in loader | `apps/web/app/routes/modules.$moduleId.tsx:209-222` | Built when `engine==='v2' && hasManifest`; returned in loader JSON. |
| `v2Form` consumed | `modules.$moduleId.tsx:316` (component destructure) | **Not destructured.** Dropped on the floor. |
| `ConfigEditor` v2 branch | `apps/web/app/components/ConfigEditor.tsx:366,435-480` | `useV2` → `<SchemaForm>`; requires `engine==='v2'` + `v2Form`. |
| `<ConfigEditor>` JSX mount | (app-wide) | **Zero.** `grep -rn "<ConfigEditor" apps/web/app` → empty. Imported at `modules.$moduleId.tsx:18`, never rendered. |
| `<StyleBuilder>` JSX mount | (app-wide) | **Zero.** Only a code-comment reference at `ConfigEditor.tsx:183`. |
| Presets layer | `control-packs/presets.ts:29-36` | `getPresetsForType`/`listV2Presets` — no production caller. |

### 1b. The flag itself
- Prisma column: `apps/web/prisma/schema.prisma:461` `moduleSystemVersion String @default("v1")`.
- Service typing/read/default: `apps/web/app/services/settings/settings.service.ts:31,71,103,196` (coerced to `'v1'` unless the DB literally holds `'v2'`).
- Toggle write + UI: `apps/web/app/routes/internal.settings.tsx:150-152` (action), `:588-607` (Select).
- **Only reader** outside `settings.service.ts`: the dead branch at `modules.$moduleId.tsx:211`. Generation never reads it (`grep moduleSystemVersion` across `api.ai.create-module.tsx`, `api.ai.hydrate-module.tsx`, `services/ai/`, `generate._index.tsx` → 0).

### 1c. The live authoring path (what actually runs)
- Builder: `apps/web/app/routes/generate._index.tsx`. Zero references to `composeConfig`/`ConfigEditor`/`SchemaForm`/control-packs.
- Storefront types → `GenControls` storefront projection (`generate._index.tsx:1138-1183`) → `mergeSettingsIntoRecipe` writes **flat** `config.*` + `style.*` (`:284-311`).
- Non-storefront types → `GenConfigControls` (`:1090-1127`) edits **flat** `recipe.config` scalars directly.

### 1d. The make-or-break fact — downstream reads FLAT keys
The theme compiler passes `config` through **verbatim** as a flat object into the
theme-module payload:
- `apps/web/app/services/recipes/compiler/theme-module.ts:37` — `config: (spec as {config}).config` (no reshaping).
- `theme.section.ts:13` — `spec.config.activation`.
- `admin.action.ts:12` — `spec.config.title ?? spec.config.label`.
- `PreviewService`: `preview.service.ts:181` — `spec.config.title`; `:220` — `c.advancedCustom?.customHtml`.
- Static v1 field map (the real flat contract): `ConfigEditor.tsx:24-62` reads
  `title`, `body`, `trigger`, `delaySeconds`, `frequency`, `maxShowsPerDay`,
  `showOnPages`, `countdownEnabled`, `countdownSeconds`, `ctaText`, `ctaUrl`, …

The composer emits `{ content:{heading,body}, trigger:{mode,delaySeconds},
frequencyCap:{frequency}, countdown:{enabled} }` (`compose.ts:56`, namespaced by
`pack.namespace`). **No compiler, preview, or Liquid path reads that grouped shape.**
`config-adapter.ts` exists *only* to translate between the two — proof the two
shapes are incompatible and the flat one is authoritative.

### 1e. The one genuinely-live Schema**Form** consumer (must survive the prune)
`apps/web/app/routes/data.$storeKey.tsx:8,36,168` mounts `<SchemaForm>` driven by a
store's backend-data `schemaJson` via `parseDataModel` — **no control-pack, no flag,
no `composeConfig`** dependency (verified: `grep control-pack|composeConfig|V2Form|
moduleSystemVersion data.$storeKey.tsx` → empty). `SchemaForm.tsx` is **kept**.

### 1f. The three pinned packs (load-bearing — must survive the prune)
`recipe.ts:8-10,139-142` pins `AudiencePackSchema`/`SchedulePackSchema`/
`AdvancedCustomPackSchema` `.optional()` as **flat nested keys** on `theme.section`
`config` (`config.audience`, `config.schedule`, `config.advancedCustom`). These are
**not** routed through `composeConfig` — they are ordinary Zod objects, and
`config.advancedCustom.customHtml` is read live by `preview.service.ts:220` and the
Liquid escape hatch (`superapp-module.liquid:248`). Pruning the *composer* must not
touch these pins or their pack files.

---

## 2. Target shape (exact TS/Zod types + example JSON)

The target is the *post-prune* steady state: **`recipe.config` stays flat and
per-type; packs contribute Zod sub-objects pinned onto `config` when a type opts in.**
No grouped `config`, no `moduleSystemVersion`, no `v2Form`.

### 2a. The pack contract stays, minus the composition-only fields
`control-packs/types.ts` keeps `ControlPack` (id/namespace/label/tier/schema/
uiSchema/appliesTo) as a reusable schema bundle. **Remove** `ModuleManifest`
(§3) — it only fed `composeConfig`.

```ts
// packages/core/src/control-packs/types.ts  (unchanged core)
export interface ControlPack<S extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  namespace: string;      // the FLAT key under recipe.config where this pack lives
  label: string;
  tier: ControlTier;
  schema: S;              // pinned directly onto a recipe branch's config, e.g.
                          //   config: z.object({ ..., audience: AudiencePackSchema.optional() })
  uiSchema?: UiHints;     // retained for a future form generator; not wired now
  appliesTo?: (type: ModuleType) => boolean;
}
```

`namespace` is redefined in intent from "grouped-object key" to "flat config key" —
which is already how the three live pins behave (`config.audience`, not
`config.targeting.audience`). No code change; only the doc comment at
`types.ts:9-11,67` changes.

### 2b. How a NEW pack (e.g. R2.1 rule-builder) lands — the pattern this phase standardizes
```ts
// packages/core/src/control-packs/packs/targeting-rule.pack.ts   (future, R2.1)
export const RuleRowSchema = z.object({
  object:   z.enum(['cart','customer','product','order','page']),
  attribute:z.string().min(1).max(60),
  operator: z.enum(CONDITION_OPERATORS),   // already in allowed-values.ts
  value:    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});
export const TargetingRulePackSchema = z.object({
  logic: z.enum(['ALL','ANY']).default('ALL'),
  rules: z.array(RuleRowSchema).max(20).default([]),
});
export const targetingRulePack: ControlPack<typeof TargetingRulePackSchema> = {
  id: 'targeting-rule', namespace: 'targetingRule', label: 'Targeting rules',
  tier: 'advanced', schema: TargetingRulePackSchema, /* uiSchema optional */
};
```
Then it is **pinned onto the recipe branch's flat config** exactly like the three
existing pins:
```ts
// packages/core/src/recipe.ts  (theme.section config)
config: z.object({
  /* …existing flat fields… */
  audience: AudiencePackSchema.optional(),
  schedule: SchedulePackSchema.optional(),
  advancedCustom: AdvancedCustomPackSchema.optional(),
  targetingRule: TargetingRulePackSchema.optional(),   // ← new pack, same mechanism
}).catchall(z.unknown()),
```
This is the whole "compositional control-packs" story after prune: **compose by
pinning Zod sub-schemas onto flat `config`**, not by running `composeConfig`. It
flows into the LLM JSON Schema for free (§4) and into the builder for free (the
`GenConfigControls` scalar/complex splitter at `generate._index.tsx:1091-1093`
already renders unknown config shapes generically).

### 2c. Example persisted recipe (post-prune, unchanged from today)
```json
{
  "type": "theme.section",
  "name": "Exit-intent promo",
  "category": "STOREFRONT_UI",
  "config": {
    "kind": "popup",
    "activation": "overlay",
    "title": "Wait — 10% off",
    "body": "Join our list for a code.",
    "trigger": "ON_EXIT_INTENT",
    "delaySeconds": 0,
    "frequency": "ONCE_PER_SESSION",
    "countdownEnabled": true,
    "countdownSeconds": 600,
    "ctaText": "Get my code",
    "ctaUrl": "https://example.com/subscribe",
    "audience": { "visitor": "new", "loggedInOnly": false },
    "targetingRule": { "logic": "ALL", "rules": [
      { "object": "cart", "attribute": "subtotal", "operator": "GTE", "value": 5000 }
    ] }
  },
  "style": { "colors": { "buttonBg": "#1F3A5F" }, "shape": { "radius": "md" } }
}
```
Flat top-level keys the runtime already reads; pack schemas as flat nested objects.
**This is byte-compatible with what the live builder writes today.**

---

## 3. Files to change (each with what changes)

### DELETE (dead composition/flag machinery)
| File | Action |
|---|---|
| `apps/web/app/components/ConfigEditor.tsx` | **Delete.** Unmounted app-wide; its static `CONFIG_FIELDS` map is superseded by `GenControls`. (If any doc/route still imports it, remove the import — see below.) |
| `apps/web/app/components/StyleBuilder.tsx` | **Delete.** Unmounted app-wide. |
| `apps/web/app/services/control-packs/admin-form.server.ts` | **Delete.** Only caller is the dead `v2Form` branch. |
| `apps/web/app/services/control-packs/config-adapter.ts` | **Delete.** Only consumer was `ConfigEditor`. |
| `packages/core/src/control-packs/compose.ts` | **Delete** `composeConfig`/`composeConfigSchema`. No production caller. |
| `packages/core/src/control-packs/module-manifests.ts` | **Delete.** `MANIFESTS`/`getManifest`/`hasManifest`/`listManifestTypes` only fed the composer. |
| `packages/core/src/control-packs/presets.ts` | **Delete.** `getPresetsForType`/`listV2Presets` unused; the live gallery uses `MODULE_TEMPLATES` directly. |

### EDIT
| File:line | Change |
|---|---|
| `apps/web/app/routes/modules.$moduleId.tsx:11,14,18` | Remove imports of `hasManifest`, `buildAdminFormConfig`, `ConfigEditor`/`V2Form`. |
| `apps/web/app/routes/modules.$moduleId.tsx:209-222` | Delete the `engine`/`v2Form` computation; drop `engine`,`v2Form` from the returned `json({...})`. Keep `adminConfig` only if still rendered — audit says it is **not** rendered (`:660-673` shows name/notes/delete only); if truly unrendered, also drop `adminConfig` + its parse at `:142-146` (verify no other consumer first). |
| `apps/web/app/services/settings/settings.service.ts:31,71,103,196,45` | Remove `moduleSystemVersion` from the settings type, default, both row-reads, and the migration-fallback matcher at `:45`. |
| `apps/web/app/routes/internal.settings.tsx:150-152,588-607` | Remove the `saveModuleEngine` action branch and the "Module System engine" Select block. |
| `apps/web/prisma/schema.prisma:461` | Remove the `moduleSystemVersion` column; add a migration (§6c). |
| `packages/core/src/control-packs/index.ts:8,9` | Remove `export * from './compose.js'` and `'./presets.js'`. Keep `types`, `registry`, and the per-pack schema exports (`:12-21`). |
| `packages/core/src/index.ts:19` | Keep `export * from './control-packs/index.js'` (packs stay public). No change unless it re-exported composer symbols by name (it does not). |

### KEEP (do not touch)
- `packages/core/src/control-packs/registry.ts` + all `packs/*.pack.ts` — the pack vocabulary; three are pinned live.
- `recipe.ts:8-10,139-142` — the three flat pins.
- `apps/web/app/components/SchemaForm.tsx` — live via `data.$storeKey.tsx`.
- `apps/web/app/routes/data.$storeKey.tsx` — backend-data record form.
- `apps/web/app/routes/generate._index.tsx` — the live builder (the standard).

### TESTS
- `packages/core/src/__tests__/control-packs.test.ts` — **rewrite** (112 lines). Delete
  `composeConfig`/manifest/preset assertions; keep/`add` assertions that each pack
  schema parses valid input, applies defaults, and rejects bad input (§7).

---

## 4. Generation wiring (how the AI emits it; prompt-expectations)

**No new generation path.** The LLM already emits flat `config`, because the
structured-output JSON Schema is built from `RecipeSpecSchema`
(`recipe-json-schema.server.ts:2,191,206`), which imports the three pinned pack
schemas as flat nested objects on `config`. Prune does not touch this — it is
already the desired behavior.

**New packs flow in for free.** When R2.1/R2.2/R2.3 pin a new pack schema onto a
recipe branch's `config` (§2b), `zodToJsonSchema(RecipeSpecSchema)` picks it up
automatically → the LLM sees the new field, its enums, and its constraints in the
structured-output schema. No prompt string edits are strictly required; the field
becomes part of the contract the model must satisfy.

**Prompt-expectations to update (docs, not code):**
- The generation prompt should *describe* new packs when they land (e.g. "use
  `config.targetingRule.rules[]` for merchant conditions"), but the **schema is the
  binding contract** — the model cannot emit the grouped shape because
  `RecipeSpecSchema` does not allow it.
- Remove any prompt/dossier language implying a `v2`/control-pack generation mode.
  Generation is single-path.

**What NOT to do:** do not feed `composeConfig` output into the JSON Schema. That was
never wired (`recipe-json-schema.server.ts` imports zero pack symbols directly; only
transitively via `recipe.ts`), and it would produce the grouped shape nothing reads.

---

## 5. Runtime / compile / render wiring (how it takes effect — the make-or-break section)

This is why PRUNE is correct: **the runtime chain is already end-to-end on flat
`config`, and prune removes the only thing that would break it (the grouped shape).**

Trace for the canonical `theme.section` path:

1. **Author** → `generate._index.tsx` `GenControls`/`GenConfigControls` writes flat
   `recipe.config.*` (`:284-311`, `:1103-1117`). Save posts the spec; server
   `RecipeSpecSchema.parse` (`:128`) validates it — including the pinned pack
   sub-objects.
2. **Compile** → `compiler/index.ts` dispatches on `type`; `theme.section.ts:13`
   reads `spec.config.activation`; `theme-module.ts:37` passes **`config` verbatim**
   into `ThemeModulePayload.config`. No reshaping — flat in, flat out.
3. **Persist** → payload serialized to the `superapp-module-*` metaobject
   (`theme-module.ts:43`).
4. **Render** → `superapp-module.liquid` reads the metaobject JSON; the storefront
   JS (`superapp-modules.js`) binds behavior off DOM attributes emitted from flat
   config (popup/trigger/countdown). `advancedCustom.customHtml` escape hatch at
   `superapp-module.liquid:248`.
5. **Preview** (deterministic) → `preview.service.ts:181` reads `spec.config.title`;
   `:220` reads `c.advancedCustom?.customHtml`. Same flat contract as production.

**Net effect of prune on runtime:** zero. Nothing in steps 1–5 references
`composeConfig`, `v2Form`, the manifest, or the adapter. The composer was a *parallel
representation* that never reached this chain. Deleting it cannot regress any
compile/render behavior — which is the strongest possible evidence for PRUNE over
WIRE. (Wiring, by contrast, would require rewriting steps 2–5 to read the grouped
shape *and* a data migration of step 3's persisted metaobjects — high risk, zero user
benefit over the existing builder.)

**Where a new pack takes effect at runtime:** because a new pinned pack (e.g.
`config.targetingRule`) rides through `theme-module.ts:37` verbatim, the pack becomes
*enforceable* the moment a consumer reads it. R2.1's rule-engine evaluator (separate
work) reads `config.targetingRule` in the storefront JS / a Function — no composer
involved. The pack schema's job ends at "validated + persisted flat"; enforcement is
per-pack runtime code, added where that pack is meant to act.

---

## 6. Back-compat (existing persisted recipes MUST keep validating + rendering)

### 6a. Recipes — no shape change, so no migration
Persisted recipes already store **flat** `config`. Prune removes only unused code
paths; `RecipeSpecSchema` is unchanged (the three pins stay). Every persisted recipe
validates and renders exactly as before. **No recipe migration needed.**

> Contrast: WIRE would have forced a migration of every persisted `theme.section` from
> flat → grouped `config` (or a permanent dual-read shim), because the composer's
> shape is incompatible (`config-adapter.ts` is that shim). PRUNE deletes the shim
> and the need for it.

### 6b. `AppSettings` rows with `moduleSystemVersion='v2'`
Any store that flipped the toggle has a DB value of `'v2'`. Today it already changes
nothing observable (audit §bottom-line). After prune the column is dropped; those
rows lose an inert field. Safe because:
- The only reader was the dead branch (`modules.$moduleId.tsx:211`), being deleted.
- `settings.service.ts:45` has a defensive fallback for the *un-migrated* case; that
  matcher is removed in the same change.

### 6c. Prisma migration
Add a migration dropping the column:
```sql
ALTER TABLE "AppSettings" DROP COLUMN "moduleSystemVersion";
```
Deploy order: ship the code that stops reading/writing the column **first** (or in the
same release), then the migration. Because no live code depends on the value, a
single release is safe. Roll-forward only; no down-migration data to preserve
(the value is inert).

### 6d. Removed exports
`composeConfig`, `composeConfigSchema`, `getManifest`, `hasManifest`,
`listManifestTypes`, `getPresetsForType`, `listV2Presets`, `buildAdminFormConfig`,
`V2Form`, `specToGrouped`, `groupedToSpec` become unexported. Confirmed non-test
callers = the files edited in §3. Run `tsc --noEmit` after deletion to catch stragglers.

---

## 7. Test plan (concrete assertions)

### 7a. Pack schemas still validate (rewrite of `control-packs.test.ts`)
```ts
it('each registered pack parses {} to its defaults', () => {
  for (const p of listPacks()) {
    const r = p.schema.safeParse({});
    // packs with all-defaulted fields succeed; others document required fields
    if (r.success) expect(r.data).toBeTypeOf('object');
  }
});
it('AudiencePackSchema applies defaults', () => {
  expect(AudiencePackSchema.parse({})).toMatchObject({ visitor: 'any', loggedInOnly: false, customerTags: [] });
});
it('TriggerPackSchema rejects an unknown mode', () => {
  expect(TriggerPackSchema.safeParse({ mode: 'NOPE' }).success).toBe(false);
});
```

### 7b. Recipe back-compat (the load-bearing assertion)
```ts
it('a legacy flat theme.section config still validates', () => {
  const r = RecipeSpecSchema.safeParse(LEGACY_FIXTURE); // §2c JSON
  expect(r.success).toBe(true);
});
it('the three pinned packs remain optional on theme.section', () => {
  const r = RecipeSpecSchema.parse({ type:'theme.section', name:'x', config:{ kind:'custom', activation:'section' } });
  expect((r as any).config.audience).toBeUndefined();
});
it('config.advancedCustom.customHtml survives a parse round-trip', () => {
  const r = RecipeSpecSchema.parse({ ...MIN, config:{ ...MIN.config, advancedCustom:{ customHtml:'<b>hi</b>' } } });
  expect((r as any).config.advancedCustom.customHtml).toBe('<b>hi</b>');
});
```

### 7c. Compile/render unchanged (regression guard on the make-or-break)
```ts
it('theme-module compiler passes flat config through verbatim', () => {
  const out = compileThemeModule(SPEC, TARGET, 'section');
  expect(out.themeModulePayload!.config).toEqual(SPEC.config); // no reshaping
});
it('PreviewService reads flat config.title', () => {
  const html = new PreviewService().render(POPUP_SPEC);
  expect(html).toContain(POPUP_SPEC.config.title);
});
```

### 7d. Dead-code gone
```ts
it('composeConfig / manifest / preset symbols are no longer exported', () => {
  const mod = await import('@superapp/core');
  expect((mod as any).composeConfig).toBeUndefined();
  expect((mod as any).hasManifest).toBeUndefined();
  expect((mod as any).getPresetsForType).toBeUndefined();
});
```
Plus: `grep -rn "moduleSystemVersion" apps packages` → 0 hits (CI grep gate).
Plus: `tsc --noEmit` clean after deletions.

### 7e. Live SchemaForm survives
```ts
it('data.$storeKey still renders SchemaForm from parseDataModel (no control-pack dep)', () => { /* route loader/component smoke test */ });
```

---

## 8. Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | **`adminConfigSchemaJson` (AI-hydrated admin config) becomes fully orphaned.** Prune removes `ConfigEditor`, which was its (dead) renderer. It is still generated + persisted (`api.ai.hydrate-module.tsx:99`). | Out of scope for R2.4 but flag it: either (a) route it into `GenConfigControls` as a generic renderer, or (b) stop generating it in hydrate. Recommend a follow-up ticket; do **not** silently keep generating-and-dropping it. |
| R2 | A stray import of a deleted symbol (`ConfigEditor`, `hasManifest`, …) in a route not surfaced by grep. | `tsc --noEmit` gate + the §7d export test catch it at build time. |
| R3 | `settings.service.ts` migration-fallback removal (`:45`) touches un-migrated-DB defensive logic. | The whole field is being dropped; remove the matcher in the same PR and confirm no other setting shares that code path (it is `moduleSystemVersion`-specific per the `.includes(...)` string). |
| R4 | Someone reads the phase title "compositional control-packs" as "we deleted control-packs." | The doc + commit message must state: **packs stay; the composer/flag go.** New packs pin onto flat `config` (§2b) — that *is* the composition mechanism going forward. |
| R5 | Future forms (R2.1 rule-builder UI) need a schema-driven renderer, and we just deleted `admin-form.server.ts` + `ConfigEditor`. | We keep `SchemaForm.tsx` (the actual renderer). A future form generator can call `zodToJsonSchema(pack.schema)` on demand — a 5-line helper — without the manifest/`composeConfig`/grouped-adapter baggage. The deleted code was the *coupling*, not the *renderer*. |

**Open questions for the implementer:**
1. Is `adminConfig` (`modules.$moduleId.tsx:142-146`) read by *any* rendered component today? Audit says no (`:660-673`); confirm before deleting the parse. (R1)
2. Do any e2e/fixture tests set `moduleSystemVersion='v2'` to exercise a path? Grep tests before dropping the column. Expected: none.
3. Should the pack `uiSchema` hints be kept on the `ControlPack` interface? **Yes** — they cost nothing and R2.1's rule-builder UI will want them; only the *consumer* (`composeConfig`→`admin-form`) is deleted, not the data.

---

## 3-bullet summary

- **Decision: PRUNE.** Delete `moduleSystemVersion`, `composeConfig`/manifests/presets, the `admin-form` bridge, the grouped `config-adapter`, and the unmounted `ConfigEditor`/`StyleBuilder`; keep the pack *schemas*, `SchemaForm.tsx`, and the live `generate._index.tsx` builder as the single authoring path.
- **The decisive evidence is the render chain:** every live consumer (compiler `theme-module.ts:37`, `PreviewService`, Liquid/JS runtime) reads **flat** `config` keys; the composer's grouped output (`config.content.heading`) is read by nothing, and `config-adapter.ts` exists only to bridge the two — so wiring would mean rewriting compile→render *and* migrating every persisted recipe for zero user gain over the existing builder.
- **Compositional control-packs survive as a pattern:** new packs (rule-builder R2.1, discount R2.2, recommendation R2.3) land by pinning a Zod sub-schema onto flat `recipe.config` exactly like the three already-live `audience`/`schedule`/`advancedCustom` pins — which flows into the LLM JSON Schema and the builder for free.

**Single biggest risk:** an overlooked import of a deleted symbol (esp. `ConfigEditor`/`hasManifest`) in a route not caught by grep — gated by `tsc --noEmit` + the §7d export-absence test, which must both be green before merge.
