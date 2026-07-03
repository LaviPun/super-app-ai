# Per-type enums supplied by the module type (R2.5 / M9)

**Phase 030 · compositional control-packs · design spec.**
The architectural enabler that lets a control pack declare a field whose enum
option-set is **supplied by the module type** — e.g. `style.layout` resolves to
`[grid, list, masonry, carousel]` for a reviews module but `[card-grid,
horizontal-tiers, radio-row, dropdown]` for a bundle module, from **one** pack
definition.

Grounded in: `specs/028-recipe-vocabulary/research/synthesis/gap-analysis.md`
(M9, §1 R2.5); `settings-vocabulary.md` pack #5 `style.layout-archetype`
(lines 162–173) and cross-cutting finding #1 (line 788). Code seam:
`packages/core/src/control-packs/{types,module-manifests,compose,registry}.ts`.

> **Scope discipline.** This is the *enabler*, not the vocabulary. It ships the
> indirection mechanism + wires it end-to-end for **one** concrete field
> (`layout` on `theme.section`) as the proof case. `recommendation.source`,
> `optionType`, `widgetKind` (R2.3, #25/#30/#34) reuse it later with zero new
> plumbing. Everything is additive: optional field, defaults preserved,
> existing recipes keep validating and rendering byte-for-byte.

---

## 1. Current state (file:line evidence)

**The pack schema is a static Zod object with no access to the module type.**

- `packages/core/src/control-packs/types.ts:64-79` — `ControlPack<S extends
  z.ZodTypeAny>` carries a single `schema: S`. It is a *value*, fixed at module
  load. There is no hook to vary the schema (or an enum inside it) by
  `ModuleType`. `appliesTo?: (type) => boolean` (line 78) is the **only**
  type-aware knob today, and it is boolean include/exclude — it cannot rewrite
  options.
- `compose.ts:44-67` — `composeConfig(type, tier)` nests each pack under its
  namespace via `shape[pack.namespace] = pack.schema` (line 56). The `type` is
  in scope but **never handed to the pack** — packs are consumed as static
  schemas.
- `module-manifests.ts:13-20` — a manifest is `{ type, packs: string[],
  advancedPacks?: string[] }`. It lists pack **ids**; it has **no field to
  supply per-type option-sets**. Only `theme.section` has a manifest at all.
- `packs/style.pack.ts:12-19` — the `style` pack schema *is*
  `StorefrontStyleSchema` verbatim. Its `layout` object
  (`storefront-style.ts:42-51`) is `{ mode, anchor, offsetX, offsetY, width,
  zIndex }` — a **placement/positioning** enum (`STOREFRONT_LAYOUT_MODES =
  ['inline','overlay','sticky','floating']`, `allowed-values.ts:900`). Note:
  this is *not* the `style.layout-archetype` (`grid|list|carousel|…`) the
  corpus means. The archetype field **does not exist yet** — R2.5 introduces it.
- **Existing enums are all fixed:** `page-targeting.pack.ts:14`
  `z.enum(POPUP_SHOW_ON_PAGES)`, `audience.pack.ts:13` `z.enum(VISITORS)`,
  `trigger.pack.ts:10` `z.enum(POPUP_TRIGGERS)`. Every one is a compile-time
  constant list — none is type-parameterised.

**The LLM structured-output schema does NOT flow through packs (critical).**

- `apps/web/app/services/ai/recipe-json-schema.server.ts:71-123` — the per-type
  JSON Schema the model is *forced* to emit is built by
  `zodToJsonSchema(branch)` over each **`RecipeSpecSchema.options` branch**
  (line 73), **not** from `composeConfig`. So `theme.section.style` reaches the
  model via `recipe.ts:148` `style: StorefrontStyleSchema.optional()` — the raw
  storefront schema, packs never consulted.
- `recipe.ts:120-149` — `theme.section.config` is a hand-written `z.object`
  with `kind: z.string()` free-form (line 122) and an open `.catchall` (line
  146). `style` is `StorefrontStyleSchema.optional()`.

**The composer path is real but dark (built-not-wired).**

- `apps/web/app/services/control-packs/admin-form.server.ts:32-49`
  `buildAdminFormConfig` calls `composeConfig` → `zodToJsonSchema` → the
  SchemaForm contract. Per gap-analysis P6/P7 and `module-system-version.md`,
  this is behind the default-off `v2` flag; `getManifest`/`hasManifest` are the
  only live callers (`modules.$moduleId.tsx:213`,
  `requirement-spec.server.ts:33`).

**Render/compile reads flat values, tolerant of unknowns.**

- `style-compiler.ts:103-106,217` reads only `s.layout.{zIndex,width,offsetX,
  offsetY}` (placement) — it does **not** read an archetype today.
- `preview/preview.service.ts:82` switches on `spec.config.kind`; `:223` emits
  `superapp-section--${c.kind}`. Layout archetype is not consulted yet.

**Net:** there is exactly one type-aware seam (`appliesTo`, boolean) and two
independent schema-derivation paths (recipe-branch → LLM; composeConfig →
admin-form) that must **both** learn per-type enums, or the field will validate
in one and be invisible/unenforced in the other.

---

## 2. Target shape (exact TS/Zod types + example JSON)

### 2a. The indirection: a `typeEnum` field-source + a manifest-supplied catalog

Introduce a **named enum reference** that a pack declares once, and a **per-type
option catalog** the manifest supplies. The pack does not hard-code options; it
declares "I have a field `layout` whose options come from the module type under
the key `layout`". The manifest (or a per-type overrides map) fills that key.

Three additive pieces in `packages/core/src/control-packs/types.ts`:

```ts
// types.ts — ADD

/** One selectable option for a per-type enum. `value` is what's persisted. */
export interface EnumOption {
  value: string;
  /** Human label for the admin form; defaults to `value`. */
  label?: string;
  /** Optional help/marketing note surfaced to the AI + form. */
  hint?: string;
}

/**
 * A field whose enum option-set is supplied by the module type at compose time.
 * The pack declares the *slot* (`enumKey`) and a safe fallback; the manifest
 * (or per-type catalog) supplies the actual options. `enumKey` is looked up in
 * `ModuleManifest.enums[<packNamespace>][<fieldName>]`.
 */
export interface TypeEnumField {
  /** Discriminator so `resolvePackSchema` knows to substitute options. */
  kind: 'typeEnum';
  /** Key into the manifest's per-type enum catalog. Often === the field name. */
  enumKey: string;
  /**
   * Options used when the manifest supplies none for this type (back-compat +
   * types without a manifest). MUST be non-empty. The first entry is the
   * schema default unless `default` is set.
   */
  fallback: EnumOption[];
  /** Persisted default; must be a `value` present in the resolved option-set. */
  default?: string;
  /** When true the field is `.optional()` in the composed schema. */
  optional?: boolean;
}

/**
 * A pack whose schema is not a fixed ZodObject but a function of the module type
 * and the manifest-supplied enum catalog. Packs that need per-type enums declare
 * `schemaFor` INSTEAD of `schema`. `schema` stays for the 10 existing static
 * packs (no migration).
 */
export type PackSchemaFactory = (ctx: {
  type: ModuleType;
  /** enumKey -> resolved options for THIS type (already merged fallback+manifest). */
  enums: Record<string, EnumOption[]>;
}) => z.ZodObject<z.ZodRawShape>;
```

Extend `ControlPack` and `ModuleManifest` — both additive:

```ts
// types.ts — MODIFY ControlPack (add optional members; `schema` stays required-or-factory)
export interface ControlPack<S extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  namespace: string;
  label: string;
  tier: ControlTier;
  /** Static source of truth (existing packs). Mutually exclusive with `schemaFor`. */
  schema?: S;
  /**
   * Per-type source of truth. When present it wins over `schema`. Declares the
   * pack's `TypeEnumField`s so the composer/LLM/derivation can resolve options.
   */
  schemaFor?: PackSchemaFactory;
  /**
   * Declares which fields are per-type enums, keyed by field name. Used to
   * (a) build the resolved options at compose time and (b) let derivation code
   * know a field is type-scoped without executing the factory.
   */
  typeEnums?: Record<string, TypeEnumField>;
  uiSchema?: UiHints;
  appliesTo?: (type: ModuleType) => boolean;
}

// types.ts — MODIFY ModuleManifest (add per-type enum catalog)
export interface ModuleManifest {
  type: ModuleType;
  packs: string[];
  advancedPacks?: string[];
  /**
   * Per-type enum option-sets. Outer key = pack namespace, inner key = the
   * pack's `enumKey`. Overrides the pack's `fallback` for THIS type only.
   *   enums: { style: { layout: [{value:'grid'}, {value:'list'}, ...] } }
   * Absent ⇒ every typeEnum field uses its pack `fallback` (back-compat).
   */
  enums?: Record<string, Record<string, EnumOption[]>>;
}
```

### 2b. Resolution helper (new, in `compose.ts`)

```ts
// compose.ts — ADD

/** Merge manifest-supplied options over a pack's fallback for one type. */
function resolveEnumOptions(
  pack: ControlPack,
  field: TypeEnumField,
  manifest: ModuleManifest | undefined,
): EnumOption[] {
  const supplied = manifest?.enums?.[pack.namespace]?.[field.enumKey];
  const opts = supplied && supplied.length > 0 ? supplied : field.fallback;
  if (opts.length === 0) throw new Error(
    `typeEnum "${pack.namespace}.${field.enumKey}" resolved to zero options`);
  return opts;
}

/** Resolve a pack to a concrete ZodObject for a given module type. */
export function resolvePackSchema(
  pack: ControlPack,
  type: ModuleType,
  manifest = getManifest(type),
): z.ZodObject<z.ZodRawShape> {
  if (pack.schemaFor) {
    const enums: Record<string, EnumOption[]> = {};
    for (const [field, spec] of Object.entries(pack.typeEnums ?? {})) {
      enums[field] = resolveEnumOptions(pack, spec, manifest);
    }
    return pack.schemaFor({ type, enums });
  }
  if (pack.schema) return pack.schema as z.ZodObject<z.ZodRawShape>;
  throw new Error(`Pack "${pack.id}" has neither schema nor schemaFor`);
}

/** Build a Zod enum + default from resolved options (used inside factories). */
export function typeEnumSchema(options: EnumOption[], def?: string, optional?: boolean) {
  const values = options.map((o) => o.value) as [string, ...string[]];
  let s: z.ZodTypeAny = z.enum(values).default(def ?? values[0]);
  return optional ? s.optional() : s;
}
```

### 2c. The proof-case pack: `style.layout` archetype

A **new dedicated pack** `layout-archetype` (namespace `layout`) rather than
mutating `StorefrontStyleSchema` — keeps `style` (which flows into every recipe
branch as raw `StorefrontStyleSchema`) untouched and back-compat trivial.

```ts
// packs/layout-archetype.pack.ts — NEW
import { z } from 'zod';
import type { ControlPack, PackSchemaFactory, TypeEnumField } from '../types.js';
import { typeEnumSchema } from '../compose.js';

const layoutField: TypeEnumField = {
  kind: 'typeEnum',
  enumKey: 'layout',
  // Generic storefront-section archetypes; used when a type supplies none.
  fallback: [
    { value: 'stacked', label: 'Stacked' },
    { value: 'grid',    label: 'Grid' },
    { value: 'carousel',label: 'Carousel' },
  ],
  default: 'stacked',
};

const schemaFor: PackSchemaFactory = ({ enums }) =>
  z.object({
    layout: typeEnumSchema(enums.layout, layoutField.default),
    columns: z.number().int().min(1).max(6).default(3).optional(),
  });

export const layoutArchetypePack: ControlPack = {
  id: 'layout-archetype',
  namespace: 'layout',
  label: 'Layout',
  tier: 'basic',
  schemaFor,
  typeEnums: { layout: layoutField },
  uiSchema: {
    groupLabel: 'Layout',
    order: ['layout', 'columns'],
    fields: { columns: { widget: 'number', showWhen: { field: 'layout', equals: 'grid' } } },
  },
};
```

Manifest supplies the per-type options (only `theme.section` exists today;
future reviews/bundle/upsell manifests each add their own):

```ts
// module-manifests.ts — theme.section MODIFIED
'theme.section': {
  type: 'theme.section',
  packs: ['content', 'style', 'layout-archetype', 'trigger', 'page-targeting',
          'frequency-cap', 'countdown', 'behavior'],
  advancedPacks: ['audience', 'schedule', 'advanced-custom'],
  enums: {
    layout: {
      layout: [
        { value: 'stacked',  label: 'Stacked sections' },
        { value: 'grid',     label: 'Grid' },
        { value: 'carousel', label: 'Carousel' },
        { value: 'masonry',  label: 'Masonry' },
      ],
    },
  },
},
```

### 2d. Example composed config JSON (a `theme.section` recipe)

```jsonc
{
  "type": "theme.section",
  "name": "Featured collection grid",
  "config": {
    "kind": "lookbook",
    "activation": "section",
    "layout": { "layout": "grid", "columns": 3 },   // ← per-type enum, value from the theme.section catalog
    "style": { "layout": { "mode": "inline" }, "colors": { "text": "#111111" } }
  }
}
```

For a future `theme.reviews`-style manifest, the *identical* pack yields
`"layout": { "layout": "masonry" }` where `masonry|list|cards` are the only
legal values — enforced by the same Zod enum, just resolved differently.

---

## 3. Files to change (each with what changes)

| File | Change |
|---|---|
| `packages/core/src/control-packs/types.ts` | ADD `EnumOption`, `TypeEnumField`, `PackSchemaFactory`. MODIFY `ControlPack` (make `schema?` optional; add `schemaFor?`, `typeEnums?`). MODIFY `ModuleManifest` (add `enums?`). |
| `packages/core/src/control-packs/compose.ts` | ADD `resolveEnumOptions`, `resolvePackSchema`, `typeEnumSchema`. MODIFY `composeConfig` loop (line 50-58): replace `shape[pack.namespace] = pack.schema…` with `resolvePackSchema(pack, type, manifest)`, preserving the advanced-optional wrap. Fetch `manifest` once at top (already implicit via `resolvePackIds`; hoist `getManifest(type)`). |
| `packages/core/src/control-packs/packs/layout-archetype.pack.ts` | NEW pack (proof case). |
| `packages/core/src/control-packs/registry.ts` | Register `layoutArchetypePack` in `ALL_PACKS` (line 18-29). |
| `packages/core/src/control-packs/module-manifests.ts` | Add `layout-archetype` to `theme.section.packs`; add the `enums` catalog. |
| `packages/core/src/control-packs/index.ts` | Export `{ LayoutArchetypePack? , layoutArchetypePack }` and the new types (line 11-21). |
| `apps/web/app/services/ai/recipe-json-schema.server.ts` | **Make the LLM schema per-type-enum aware for composer-backed fields.** See §4 — inject resolved enums into the emitted schema for types with a manifest. |
| `apps/web/app/services/control-packs/admin-form.server.ts` | `buildAdminFormConfig` already calls `composeConfig` (line 37) → now type-aware for free. Add per-option `label`/`hint` to `uiSchema` so the form shows labels (map `EnumOption[]` → `enumNames`). |
| `apps/web/app/services/preview/preview.service.ts` | Read `config.layout?.layout` to pick the archetype CSS class (§5). Additive; default path unchanged when absent. |
| `apps/web/app/services/recipes/compiler/style-compiler.ts` (or the section renderer) | Emit `superapp-layout--<archetype>` modifier class from `config.layout.layout` (§5). Additive. |
| `packages/core/src/__tests__/control-packs.test.ts` | Extend (§7). |

**No change** to `recipe.ts` `theme.section` config is *required* because
`config` is `.catchall(z.unknown())` (line 146) — a `layout: {layout, columns}`
key validates today as an unknown passthrough. But see §6 for the recommended
**opt-in tightening** so it is validated rather than merely tolerated.

---

## 4. Generation wiring (how the AI emits it; prompt-expectations)

The model must (a) know the field exists, (b) be constrained to the **per-type**
option-set. There are two derivation paths and both must carry the enum.

### Path A — structured-output JSON Schema (primary, `recipe-json-schema.server.ts`)

This is the load-bearing wiring: structured outputs make the enum a **hard
constraint**, not a prompt suggestion. Today the branch schema is emitted raw
(line 76). Because the composed pack config is **not** in the recipe branch, we
must merge it in for manifest-backed types.

Change `buildRegistry()` (line 71-123): after `stripDefinitionsWrapper`, for
types with `hasManifest(moduleType)`, overlay the composed config's
per-type-enum fields onto `recipeRoot.properties.config.properties`:

```ts
// recipe-json-schema.server.ts — inside buildRegistry, after computing recipeRoot
if (hasManifest(moduleType)) {
  const composed = composeConfig(moduleType, 'advanced'); // widest surface
  const composedJson = zodToJsonSchema(composed.schema, {
    $refStrategy: 'none', target: 'jsonSchema7',
  }) as JsonSchemaObject;
  overlayComposedEnums(recipeRoot, composedJson); // merges layout.{layout,columns} into config
}
```

`overlayComposedEnums` is a small, **scoped** merge: it copies only the
namespaces the composer added that aren't already in the branch (here: `layout`)
into `config.properties`, then re-runs `normalizeForStructuredOutput` so the new
subtree gets the `required`/`additionalProperties` treatment. It must NOT
clobber existing branch keys (`kind`, `style`, `blocks`), preserving current
behaviour for every field the model already emits.

Result: for `theme.section` the model sees
`config.layout.layout: {enum: ["stacked","grid","carousel","masonry"]}` — and
structured outputs guarantee it returns one of those four. A reviews manifest
would present a *different* four-value enum from the same code.

### Path B — prose fallback (`getFullRecipeSchemaSpec`, low-confidence / non-structured)

Where the prompt falls back to prose (gap-analysis notes this path still
exists), append a per-type line derived from the manifest:

> `config.layout.layout` — one of: **stacked | grid | carousel | masonry** (this
> module type only). Pick the archetype that best fits the merchant's request.

Emit this from a helper `describeTypeEnums(type): string[]` that walks
`getManifest(type).enums` and `pack.typeEnums` labels/hints. Keep it terse — one
line per per-type field — so token budget (MEMORY: create-module ≤ 60s / tight
token ceiling) is unaffected.

**Prompt expectation:** the model chooses a *value*, never invents options. The
enum is closed. `hint` on each `EnumOption` is the only free-text guidance and
is optional. No new example blocks needed — the JSON Schema does the work.

---

## 5. Runtime / compile / render wiring (the make-or-break section)

An enum the model emits but nothing renders is dead. The archetype must change
pixels. Chain:

1. **Persist.** The recipe is stored as-is; `config.layout = {layout, columns}`
   rides in `theme.section.config` (validated via the tightening in §6, or
   tolerated via `.catchall` without it). No schema migration.

2. **Compile → CSS modifier class.** In the section renderer /
   `style-compiler.ts`, read `config.layout?.layout` and emit a BEM-style
   modifier the storefront CSS already keys on:
   ```ts
   const archetype = spec.config?.layout?.layout;              // e.g. 'grid'
   const layoutClass = archetype ? ` superapp-layout--${cssToken(archetype)}` : '';
   // <section class="superapp-section superapp-section--${kind}${layoutClass}">
   ```
   `cssToken` = lowercase + `[^a-z0-9-]→-` (defence-in-depth even though the
   enum is closed). Ship the CSS rules once in the shared storefront stylesheet:
   `.superapp-layout--grid { display:grid; grid-template-columns:repeat(var(--sa-cols,3),1fr); gap:var(--sa-gap); }`,
   `--masonry`, `--carousel` (scroll-snap), `--stacked` (default, no-op).
   `columns` maps to `--sa-cols`.

3. **Preview parity.** `preview/preview.service.ts` renders the **same** class
   (it already switches on `config.kind` at line 82 and emits
   `superapp-section--${kind}` at line 223). Add the layout modifier at that
   same emission point so the deterministic preview and the live theme snippet
   agree. Since 027 wired the real recipe into the `/generate` iframe
   (gap-analysis §0), this is where the merchant *sees* the archetype take
   effect pre-publish.

4. **Admin form (edit).** `buildAdminFormConfig` (admin-form.server.ts) now
   yields a `select` for `config.layout.layout` whose options are exactly the
   type's catalog, with labels from `EnumOption.label`. The SchemaForm renders a
   dropdown scoped to the four legal values. (This is on the v2/composer path
   per P6/P7 — see §8 risk.)

**Make-or-break assertion:** a value that is legal for `theme.section`
(`masonry`) but illegal for a hypothetical `bundle` manifest is *rejected at
generation* (structured output enum) AND *rejected at admin edit* (composed Zod)
AND *renders a distinct class* (compiler). If any of the three is skipped, the
field is theatre. §7 tests each leg.

---

## 6. Back-compat (existing persisted recipes MUST keep validating + rendering)

Every existing recipe predates the `layout` archetype and has **no
`config.layout`**. Guarantees:

1. **Validation.** `theme.section.config` is `.catchall(z.unknown())`
   (`recipe.ts:146`) and `layout` is absent from old recipes → they validate
   unchanged today. When we add the field (see below), it MUST be
   `.optional()` (or defaulted) so absence still passes.
   - **Recommended tightening (opt-in, still back-compat):** add to
     `recipe.ts:120` config object:
     ```ts
     layout: LayoutArchetypeConfigSchema.optional(),
     ```
     where `LayoutArchetypeConfigSchema = z.object({ layout: z.string().min(1),
     columns: z.number().int().min(1).max(6).optional() }).optional()`.
     Use a **loose `z.string()`** here (not `z.enum`) at the recipe-branch level
     because the recipe union is type-agnostic — the *per-type* enum is enforced
     by the composer/LLM-schema, not the persisted union. This keeps a reviews
     recipe carrying `masonry` and a theme.section carrying `grid` both valid in
     the shared `RecipeSpecSchema`, while the tight enum applies at
     generation/edit time. Old recipes (no `layout`) pass via `.optional()`.

2. **Rendering.** Compiler/preview read `config.layout?.layout` with `?.` and
   fall back to no modifier class → old recipes render **byte-identical** (empty
   `layoutClass`). The default archetype `stacked` is a CSS no-op, so even a
   freshly-defaulted value matches today's stacked output.

3. **Types without a manifest.** `resolvePackSchema` uses `field.fallback` when
   `manifest?.enums` is absent, and packs without `schemaFor` are untouched.
   Types not migrated to v2 never see the pack (they have no manifest). Zero
   blast radius beyond `theme.section`.

4. **Static packs unchanged.** The 10 existing packs keep `schema` (now
   `schema?`, still populated). `composeConfig` calls `resolvePackSchema`, which
   returns `pack.schema` verbatim for them. The existing
   `control-packs.test.ts:33` shape assertion still holds *plus* a new `layout`
   namespace (update the expected list — see §7).

5. **LLM schema for non-manifest types** takes the `if (hasManifest)` false
   branch in `buildRegistry` → identical to today.

---

## 7. Test plan (concrete assertions)

**Core unit — `packages/core/src/__tests__/control-packs.test.ts`:**

- `resolvePackSchema(layoutArchetypePack, 'theme.section')` → `.shape.layout`
  parses `'grid'` and rejects `'sidebar'`:
  ```ts
  const s = resolvePackSchema(layoutArchetypePack, 'theme.section');
  expect(s.shape.layout.parse('grid')).toBe('grid');
  expect(() => s.shape.layout.parse('sidebar')).toThrow();
  ```
- **Per-type divergence** (the whole point): a stub manifest with
  `enums.layout.layout = [{value:'list'},{value:'cards'}]` for a second type
  resolves to a schema that accepts `'cards'` and rejects `'grid'`, proving the
  same pack yields different option-sets.
- **Fallback:** `resolvePackSchema` for a type whose manifest omits `enums`
  accepts `'stacked'` (from `fallback`) and rejects `'grid'`… actually accepts
  `'grid'` (fallback includes it) — assert it accepts the fallback set and
  rejects an off-list value.
- `resolveEnumOptions` throws on empty resolution.
- **composeConfig integration:** `composeConfig('theme.section','basic').schema`
  now has a `layout` namespace key; `.parse({...valid, layout:{layout:'grid'}})`
  succeeds; `layout:{layout:'masonry'}` succeeds; `layout:{layout:'radio-row'}`
  throws.
- Update the registry list assertion (`test:16`) to include
  `'layout-archetype'`, and the shape-keys assertion (`test:~38`) to include
  `'layout'`.

**LLM schema — `apps/web/.../recipe-json-schema.server.test.ts` (new/extend):**

- `getRecipeSingleJsonSchemaForType('theme.section')` →
  `…config.properties.layout.properties.layout.enum` equals
  `['stacked','grid','carousel','masonry']`.
- Existing branch keys (`kind`, `style`, `blocks`) still present and unchanged
  (regression guard on `overlayComposedEnums` not clobbering).
- A type **without** a manifest → schema identical to pre-change snapshot.

**Admin form — `admin-form.server.test.ts`:**

- `buildAdminFormConfig('theme.section')`'s `jsonSchema` exposes the `layout`
  enum and `uiSchema` carries option labels.

**Render/compile — preview + style-compiler tests:**

- `PreviewService` output for a recipe with `config.layout.layout='grid'`
  contains `superapp-layout--grid`; a recipe with no `layout` contains **no**
  `superapp-layout--` class (back-compat).
- Compiler emits `--sa-cols:3` when `columns:3`.

**Back-compat golden:** load a stored pre-change `theme.section` fixture (no
`layout`) → `RecipeSpecSchema.parse` succeeds and compiled HTML is byte-equal to
the recorded snapshot.

---

## 8. Risks + open questions

1. **BIGGEST RISK — the composer path is dark (gap-analysis P6/P7).**
   `composeConfig`/`buildAdminFormConfig` are behind the default-off `v2` flag
   with `ConfigEditor`/`StyleBuilder` unmounted. If R2.5 lands *only* through
   the composer, the per-type enum is enforced at admin-edit **but not at
   generation**, and merchants never see the dropdown. **Mitigation (required):
   wire the enum into `recipe-json-schema.server.ts` (Path A, §4) independently
   of the v2 flag** so generation is constrained on the live path regardless of
   the composer's fate. The composer wiring (R2.4) is a *parallel* dependency,
   not a blocker for the generation win.

2. **Two schema-derivation sources of truth.** The recipe branch (LLM) and the
   composer (admin form) derive independently. `overlayComposedEnums` bridges
   them but is a merge that can drift. Open question: should R2.4 make
   `composeConfig` the single source that *feeds* the recipe branch (invert the
   dependency), eliminating the overlay? Cleaner long-term; larger blast radius
   now. Recommend the additive overlay for R2.5, revisit under R2.4.

3. **Recipe-union enum looseness.** §6 keeps `RecipeSpecSchema` `layout` as
   `z.string()` so cross-type recipes coexist. This means a hand-edited/imported
   recipe could persist an off-catalog `layout` for its type and pass the union
   Zod. It is still caught at generation (structured output) and admin edit
   (composed enum) and renders as a harmless unknown modifier class. Acceptable;
   note it explicitly.

4. **`columns` coupling.** `columns` is generic here but meaningless for
   `carousel`/`stacked`. `showWhen: {field:'layout', equals:'grid'}` hides it in
   the form; the enum-driven `showWhen` predicate only supports a single
   `equals` (`types.ts:24-29`) — fine for now, but multi-value visibility
   (`grid|masonry`) will want a follow-up to `FieldShowWhen`.

5. **Label/hint propagation to structured outputs.** JSON Schema `enum` carries
   values, not labels; OpenAI ignores `enumNames`. Labels reach the *form* only.
   The AI sees values + optional `hint` (via prose Path B). Confirm that's
   sufficient guidance, or fold hints into the JSON Schema `description`.

6. **Open question — should `mode` (placement, `STOREFRONT_LAYOUT_MODES`) be
   folded into the archetype pack?** No: it is placement, not layout archetype,
   and lives in `style.layout` consumed by the compiler. Keeping them separate
   avoids disturbing `style-compiler.ts:103-106`. Documented to prevent a future
   merge mistake.

---

## Summary

- **Mechanism:** a pack declares a `TypeEnumField` (slot + fallback) and, for
  per-type packs, a `schemaFor(ctx)` factory; the `ModuleManifest` grows an
  `enums` catalog that supplies each type's option-set. `resolvePackSchema`
  merges manifest-over-fallback and builds the concrete Zod enum — one pack,
  N per-type option-sets, fully additive (existing 10 static packs untouched).
- **Proof case wired end-to-end:** a new `layout-archetype` pack (`style.layout`)
  flows through composeConfig → the **LLM structured-output schema** (hard enum
  constraint) → admin SchemaForm dropdown → a `superapp-layout--<archetype>`
  compiler/preview modifier class that actually changes pixels — with a
  `.optional()` recipe field + `?.`-guarded renders keeping every existing
  recipe validating and rendering byte-identical.
- **Reuse:** `recommendation.source`, `optionType`, `widgetKind` (R2.3/#25/#30)
  drop in later as `typeEnum` fields with zero new plumbing.

**Single biggest risk:** the composer/admin path is dark behind the default-off
`v2` flag, so R2.5 **must** wire the per-type enum into
`recipe-json-schema.server.ts` (the live generation path) independently of the
composer — otherwise the enum is enforced only in an unreachable admin form and
the feature ships invisible.
