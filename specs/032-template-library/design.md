# 032 — Template Library: Buildable Architecture + Authoring Contract

**Status:** design only (read + design; no code changed, no agents fired).
**Goal:** replace the hardcoded `_templates_part*.ts` with a one-file-per-authoring-unit
library that `~70` parallel agents populate, producing **≥100 valid module templates**
and **≥100 valid theme-section-with-blocks templates**, all parsing against
`RecipeSpecSchema`, with the existing registry interface (`MODULE_TEMPLATES`,
`findTemplate`, `getTemplateReadiness`, …) unchanged.

---

## A. Current-system map (file:line)

### A.1 The template shape

A template is a `TemplateEntry` — `packages/core/src/templates.ts:10-19`:

```ts
export type TemplateEntry = {
  id: string;              // e.g. 'UAO-001' — <PREFIX>-<NNN>, unique across the library
  name: string;
  description: string;
  category: ModuleCategory; // from MODULE_CATEGORIES (allowed-values.ts)
  type: string;             // MUST equal spec.type
  icon?: string;
  tags?: string[];
  spec: RecipeSpec;         // the validated payload — recipe.ts:127
};
```

Authored example (a real one) — `packages/core/src/_templates_part1.ts:48-84` (UAO-001,
`theme.section`), and `_templates_part1.ts:10-41` (SEC-001, the generic "Custom Section").
Note two invariants every entry currently honours: `entry.type === entry.spec.type`
and `entry.category === entry.spec.category` (enforced by tests — see A.5).

`spec` is a `RecipeSpec` — `packages/core/src/recipe.ts:127-704`, a Zod
`discriminatedUnion('type', …)` over 23 module types. Each member is `Base.extend(…)`
(`recipe.ts:114-125`) so every spec carries `name`, `category`, `requires: Capability[]`,
optional `dataModel`, plus a per-type `config` (and, for storefront types, `placement` +
`style`). The `theme.section` member is `recipe.ts:136-191`.

### A.2 The registry (barrel)

`packages/core/src/templates.ts`:
- `import { PART1_TEMPLATES } … PART4_TEMPLATES` — `templates.ts:5-8`.
- `TEMPLATE_SOURCE = [...PART1, ...PART2, ...PART3, ...PART4]` — `templates.ts:63-68`.
- `modernizeTemplateEntry()` post-processes every entry (`templates.ts:302-309`):
  `withFlowDefaults` → `withTypeDefaults` → `withDataSurfaceRequires`. **This layer injects
  required `requires` flags and type defaults (contactForm/floatingWidget/httpSync/pixel/
  functions), so authors do not have to.** `templates.ts:74-300`.
- `export const MODULE_TEMPLATES = TEMPLATE_SOURCE.map(modernizeTemplateEntry)` —
  `templates.ts:311`.
- Public API: `findTemplate` (`:313`), `getTemplatesByCategory` (`:317`),
  `getTemplateReadiness` (`:322`), `getTemplateInstallability` (`:398`),
  `TEMPLATE_CATEGORIES` (`:61`), `TEMPLATE_TYPES_REQUIRING_DATA_SAVE` (`:54`).
- Re-exported from the package barrel — `packages/core/src/index.ts:10` (`export * from './templates.js'`).

### A.3 The consumption path (where templates flow into generation)

1. **Search-augmented grounding (the RAG picker):**
   `apps/web/app/services/ai/solution-search.server.ts` — imports `MODULE_TEMPLATES`
   (`:13`), ranks every template against a `RequirementSpec` by type-match + token/tag
   overlap + config-surface overlap (`scoreTemplate` `:55-69`), returns top-k `startFrom`
   options and a compact `grounding` string injected into the create prompt
   (`searchSolutions` `:74-110`). **This is the primary generation consumer — richer/more
   templates ⇒ better grounding.** Tags + `name` + `description` are the ranking haystack
   (`:59`), so they are load-bearing.
2. **Instantiate template → module:** `apps/web/app/routes/api.modules.from-template.tsx`
   — `findTemplate(templateId)` (`:12,38`), gates on `getTemplateInstallability` (`:40-50`),
   then `ModuleService.createDraft(shop, spec)` (`:67`). Optional per-template overrides are
   re-validated with `RecipeSpecSchema.safeParse` (`:19`).
3. **DSL references:** `packages/core/src/recipe-dsl.ts:115,138,223` — a DSL may name a
   `templateId`; validated to match `recipe.type`.
4. **Admin/merchant browse UIs:** `apps/web/app/routes/templates._index.tsx:5,25`,
   `templates.$templateId.tsx:4-16`, `internal.templates._index.tsx:6-34`,
   `internal.templates.$templateId.tsx`, `internal.templates.$templateId.preview.tsx`,
   `internal.recipe-edit.tsx:7,59-66`.

**None of these consumers hardcode template IDs except the test suite** (see A.5), so
replacing the underlying files is safe as long as the registry interface and the test
invariants hold.

### A.4 Catalog: `catalog.generator.ts` + `catalog.generated.json`

**The catalog is NOT derived from templates.** `catalog.generated.json` is generated
**combinatorially from the Allowed Values Manifest** (`allowed-values.ts`), independent of
`MODULE_TEMPLATES`:
- `generateCatalog()` — `packages/core/src/catalog.generator.ts:217-237` — emits
  `type.*` rows (one per `RECIPE_SPEC_TYPES`, `:132-154`) + `storefront.*` combinatorial rows
  (surface × component × intent, `:156-204`).
- **Regen command** (the CLI self-run guard at `catalog.generator.ts:259-272`):
  ```bash
  cd packages/core && pnpm exec tsx src/catalog.generator.ts
  # writes src/catalog.generated.json (deterministic, one entry per line)
  ```
  (Equivalently `node --loader tsx src/catalog.generator.ts`; the guard checks
  `process.argv[1]?.includes('catalog.generator')`.)
- Loaded at `packages/core/src/catalog.ts:1,46` (`MODULE_CATALOG`).

**Implication:** the template rewrite does **not** require regenerating `catalog.generated.json`
(templates and catalog are decoupled). Regen is listed in §E only as a belt-and-suspenders
verify step; nothing in the template files feeds the catalog generator.

### A.5 The validation path (what makes a template VALID)

Authoritative contract = `packages/core/src/__tests__/templates.test.ts`. Every constraint
each authoring agent must satisfy:

| Test (line) | Constraint |
|---|---|
| `:35-40` | **Every `spec` parses against `RecipeSpecSchema`** (`safeParse().success === true`). **The hard gate.** |
| `:18-22` | `entry.type === entry.spec.type` |
| `:24-28` | `entry.category === entry.spec.category` |
| `:30-33` | **All `id`s unique** |
| `:14-16` | `MODULE_TEMPLATES.length >= 126` (raise to ≥ 226 — see §E) |
| `:42-47` | **Covers all `RECIPE_SPEC_TYPES`** (every one of the 23 types has ≥1 template) |
| `:49-53` | `entry.category ∈ TEMPLATE_CATEGORIES` |
| `:73-80` | **14 category prefixes** `UAO DAP BCT CUX CHK TYO ACC SHP PAY TRU SUP LOY ANA OPS`, each ≥ 9 |
| `:55-67` | `findTemplate('UAO-001' / 'CHK-037' / 'ANA-109')` resolve (**keep these anchor IDs**) |
| `:82-127` | popup/contactForm/httpSync/flow templates carry advanced defaults **after `modernize…`** — satisfied by the barrel, not the author |
| `:129-188` | readiness + installability + data-surface flags computed for every entry |

**Self-check command any authoring agent runs** (parses one file's exports without the
whole suite):
```bash
cd packages/core && pnpm exec tsx -e "
  import { RecipeSpecSchema } from './src/recipe.ts';
  import { MODULE_TEMPLATES_<UNIT> } from './src/templates/<dir>/<unit>.ts';
  for (const t of MODULE_TEMPLATES_<UNIT>) {
    const r = RecipeSpecSchema.safeParse(t.spec);
    if (!r.success) { console.error(t.id, JSON.stringify(r.error.flatten())); process.exit(1); }
    if (t.type !== t.spec.type) { console.error(t.id, 'type mismatch'); process.exit(1); }
    if (t.category !== t.spec.category) { console.error(t.id, 'category mismatch'); process.exit(1); }
  }
  console.log('OK', MODULE_TEMPLATES_<UNIT>.length);
"
```
Full gate: `cd packages/core && pnpm test` (runs `templates.test.ts` + `recipe.test.ts`).

### A.6 theme.section + blocks — how a section carries modular blocks TODAY

Two facts govern the "section with modular blocks" authoring model:

1. **The RecipeSpec `theme.section` config** (`recipe.ts:140-188`) has:
   - `kind: string` (free-form recommendation tag — `'hero' | 'faq' | 'pricing' | …`, NOT an
     enum; `recipe.ts:142`),
   - `activation: 'section' | 'global' | 'overlay'` (`:144`),
   - `title?`, `subtitle?`,
   - `fieldSchema?: DataModel` — the section's own typed settings (`:148`),
   - `fields: Record<string, unknown>` — values for those settings (`:150`),
   - **`blocks: Array<{ kind: string; text?: string; imageUrl?: url; url?: url; fields?: Record<string,unknown> }>`**,
     `.max(50)`, `.default([])` (`recipe.ts:152-158`) — **this is the modular-blocks array**,
   - `audience?/schedule?/layout?/ruleEngine?/recommendation?/advancedCustom?` packs (`:159-184`),
   - `.catchall(z.unknown())` (`:188`) — kind-specific keys are allowed on `config`.
   - `placement?` (`recipe.ts:189` → `PlacementSchema` `:89-107`; one of `enabled_on`/`disabled_on`,
     templates from `THEME_PLACEABLE_TEMPLATES` = `404 article blog cart collection list-collections
     index page password product search`, groups from `THEME_SECTION_GROUPS`).
   - `style?: StorefrontStyle` (`recipe.ts:190` → `storefront-style.ts:40-129`).

2. **The storefront renderer** — `extensions/theme-app-extension/snippets/superapp-module.liquid`:
   - Dispatches on `config_json.kind` (`:27-43, :202`); any non-preset kind renders through the
     **generic section branch** (`:401-460`).
   - The generic branch renders the block array: `{% for section_block in mod_cfg.blocks %}`
     (`:437`) and reads exactly **`section_block.kind`** (→ a `superapp-section__block--<kind>` CSS
     class, `:438`), **`section_block.imageUrl`** (`:439-441`), **`section_block.text`** (`:444-445`),
     **`section_block.url`** (`:447-448`). It uses `mod_cfg.layout.layout | handle` for a
     `superapp-layout--<archetype>` grid class (`:411-419`).

**Therefore, the real valid way to author "a section with modular blocks" in THIS system is
the app-block / `config.blocks[]` model — not Shopify's native `{% schema %}` `blocks`.**
The app ships one Theme App Extension app-block; the section's repeatable content lives in
`spec.config.blocks[]`, each block a `{ kind, text?, imageUrl?, url?, fields? }` object. The
renderer reads `kind/text/imageUrl/url` first-class; anything richer goes in the per-block
`fields` bag (and is available to the generic branch / preview, and to any kind-specific
renderer added later). `config.layout.layout` selects the layout variant (grid archetype).
This maps cleanly onto Shopify's "section with `blocks[]` the merchant can add/reorder"
mental model: **`config.blocks[]` IS the reorderable block list**, `kind` is the block type,
`fields` is the block's settings.

---

## B. NEW file architecture

```
packages/core/src/templates/
├─ types.ts                      # re-exports TemplateEntry + a per-unit array alias; the ONE
│                                #   shared type module. Never edited by authoring agents.
├─ modules/                      # module templates — ONE FILE PER APP (authoring unit)
│  ├─ loox.ts                    #   export const LOOX_TEMPLATES: TemplateEntry[] = [ … ]
│  ├─ judge-me.ts
│  ├─ rebuy.ts
│  ├─ … (50 files, one per corpus app / cluster — see §D.1)
│  └─ index.ts                   #   barrel: MODULE_APP_TEMPLATES = [...LOOX_TEMPLATES, …]
├─ sections/                     # theme-section templates — ONE FILE PER SECTION TYPE
│  ├─ hero.ts                    #   export const HERO_SECTION_TEMPLATES: TemplateEntry[] = [ … ]
│  ├─ pricing.ts
│  ├─ testimonials.ts
│  ├─ … (24 files, one per section type — see §D.2)
│  └─ index.ts                   #   barrel: SECTION_TEMPLATES = [...HERO_SECTION_TEMPLATES, …]
├─ coverage.ts                   # small hand-authored file guaranteeing every one of the 23
│                                #   RECIPE_SPEC_TYPES has ≥1 template + the 14-prefix ≥9 floor
│                                #   for any category the corpus underfills (the "filler" unit).
└─ index.ts                      # ALL_TEMPLATES = [...MODULE_APP_TEMPLATES, ...SECTION_TEMPLATES,
                                 #   ...COVERAGE_TEMPLATES]
```

**Why this shape:** one file per authoring unit ⇒ **~70 agents never touch the same file**
(50 module-app files + 24 section files + a handful of coverage sub-files, each owned by
exactly one agent). Each file exports a single named `TemplateEntry[]`; the folder `index.ts`
spreads them; the top `templates/index.ts` concatenates the three groups.

**How it replaces `_templates_part*.ts` without breaking anything** — only
`packages/core/src/templates.ts` changes at the seam:

```ts
// templates.ts — BEFORE
import { PART1_TEMPLATES } from './_templates_part1.js';   // …PART2…PART3…PART4
const TEMPLATE_SOURCE: TemplateEntry[] = [
  ...PART1_TEMPLATES, ...PART2_TEMPLATES, ...PART3_TEMPLATES, ...PART4_TEMPLATES,
];

// templates.ts — AFTER (one-line import swap; everything downstream is identical)
import { ALL_TEMPLATES } from './templates/index.js';
const TEMPLATE_SOURCE: TemplateEntry[] = ALL_TEMPLATES;
```

`TemplateEntry`, `modernizeTemplateEntry`, `MODULE_TEMPLATES`, `findTemplate`,
`getTemplateReadiness`, `getTemplateInstallability`, `TEMPLATE_CATEGORIES`,
`TEMPLATE_TYPES_REQUIRING_DATA_SAVE` — **all stay in `templates.ts`, unchanged.** The
`modernize…` post-processing (flow/type/data-surface defaults) still runs over every entry, so
authors never write `requires` flags or contactForm/httpSync/flow boilerplate — the barrel
injects them (`templates.ts:302-309`). The package barrel `index.ts:10` still does
`export * from './templates.js'`. **`TemplateEntry` must be imported by unit files from
`../types.js`** (which re-exports it from `../../templates.js`) to avoid a circular import back
into `templates.ts`'s heavy body; `types.ts` only re-exports the type, so it is safe.

`_templates_part1..4.ts` are **deleted** in the final wiring step (§E).

---

## C. The authoring contract

### C.1 Exact shape each unit file MUST export

Every file under `templates/modules/` or `templates/sections/` exports **exactly one**
`const` of type `TemplateEntry[]`, named `<UNIT>_TEMPLATES` in SCREAMING_SNAKE
(`LOOX_TEMPLATES`, `HERO_SECTION_TEMPLATES`). No default export. No side effects. Imports come
only from `../types.js` (for `TemplateEntry`) and `../../allowed-values.js` / value modules for
enums the spec needs (e.g. `THEME_PLACEABLE_TEMPLATES`).

```ts
// packages/core/src/templates/modules/loox.ts
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

export const LOOX_TEMPLATES: TemplateEntry[] = [
  /* …entries… */
];
```

**Field rules (per entry):**
- `id`: `<PREFIX>-<NNN>`, unique library-wide. See C.4 for the prefix/number namespace so 70
  agents never collide.
- `type` === `spec.type`; `category` === `spec.category`.
- `tags`: 3-8 lowercase tokens; **include the source app slug** (e.g. `'loox'`) and the
  functional area (`'reviews'`, `'social-proof'`) — these drive the RAG ranking
  (`solution-search.server.ts:59`).
- `name` (2-80 chars, `LIMITS.nameMin/Max`) and `description` (one sentence, what+where) are
  ranking-load-bearing — write them for retrieval, not decoration.
- `spec`: a fully-formed `RecipeSpec` for `spec.type`. **Do NOT add `requires` flags that
  `modernize…` injects** (contact/pixel/httpSync/function/theme/proxy/checkout/etc.) — leave the
  minimal `requires` the schema defaults, and the barrel fills the rest. You MAY set `requires`
  when the schema member has no default you rely on; it is deduped.
- Storefront types (`theme.section`, `proxy.widget`): include `placement` (one of
  `enabled_on`/`disabled_on`, templates ⊂ `THEME_PLACEABLE_TEMPLATES`) and a full `style`
  object (grounded in the corpus visual_patterns and the six style packs, design-vocabulary §4).

### C.2 COMPLETE valid EXAMPLE (i) — a module template

Grounded in `specs/028-recipe-vocabulary/research/plugins/loox.md` (settings_taxonomy →
`config.blocks` review cards; visual_patterns → carousel archetype). Parses against
`RecipeSpecSchema` (`theme.section` member, `recipe.ts:136-191`):

```ts
// templates/modules/loox.ts  (one of ~2-3 Loox entries)
{
  id: 'REV-201',
  name: 'Loox Review Wall',
  description: 'Photo-review "wall of love" grid for the product page — verified-buyer star cards with media thumbnails.',
  category: 'STOREFRONT_UI',
  type: 'theme.section',
  icon: 'reviews',
  tags: ['loox', 'reviews', 'social-proof', 'ugc', 'product', 'wall-of-love'],
  spec: {
    type: 'theme.section',
    name: 'Loox Review Wall',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'reviews',
      activation: 'section',
      title: 'Loved by thousands',
      subtitle: 'Real photos from verified buyers',
      layout: { layout: 'grid' },
      fields: {
        columnsDesktop: 3,
        columnsMobile: 1,
        showVerifiedBadge: true,
        showStarColor: '#f5a623',
      },
      blocks: [
        { kind: 'review-card', text: '"Exactly as pictured — obsessed."', imageUrl: 'https://cdn.example.com/reviews/r1.jpg', fields: { author: 'Maya R.', rating: 5, verified: true } },
        { kind: 'review-card', text: '"Fast shipping and great quality."', imageUrl: 'https://cdn.example.com/reviews/r2.jpg', fields: { author: 'Devon K.', rating: 5, verified: true } },
        { kind: 'review-card', text: '"Bought two, gifting one."', imageUrl: 'https://cdn.example.com/reviews/r3.jpg', fields: { author: 'Priya S.', rating: 4, verified: true } },
      ],
    },
    placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
    style: {
      layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
      spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
      typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
      colors: { text: '#111827', background: '#ffffff', overlayBackdropOpacity: 0.45, seed: '#f5a623' },
      shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
      responsive: { hideOnMobile: false, hideOnDesktop: false },
      accessibility: { focusVisible: true, reducedMotion: true },
    },
  },
},
```

Non-storefront module example (grounded in a plugin whose surface is a Function/Flow, e.g.
`discount-ninja.md`, `smile-io.md`) uses the matching schema member — e.g.
`functions.discountRules` (`recipe.ts:216-241`, see the real UAO-DAP entries at
`_templates_part1.ts:320-366`) or `flow.automation` (`recipe.ts:494-601`). Those authors omit
`placement`/`style` (not in those members) and rely on `modernize…` for the `requires` flags and
flow step defaults.

### C.3 COMPLETE valid EXAMPLE (ii) — a theme-section-with-blocks template

Grounded in the design-reference section catalog (design-vocabulary §2 "Section blocks",
lines 156-164 → **Pricing / plan compare with a recommended-tier emphasis**). Demonstrates the
**modular-blocks model** (§A.6): one block per plan, reorderable, each carrying its own typed
`fields`. Parses against the same `theme.section` member.

```ts
// templates/sections/pricing.ts  (one of 3-5 pricing layout variants)
{
  id: 'SEC-PRICING-02',
  name: 'Pricing — 3-Tier Compare (Recommended Highlight)',
  description: 'Three-column pricing compare with an emphasized "recommended" tier — accent border, lift, and badge. Blocks are reorderable plans.',
  category: 'STOREFRONT_UI',
  type: 'theme.section',
  icon: 'pricing',
  tags: ['section', 'pricing', 'plan-compare', 'cta', 'conversion', 'bold-dtc'],
  spec: {
    type: 'theme.section',
    name: 'Pricing — 3-Tier Compare',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'pricing',
      activation: 'section',
      title: 'Choose your plan',
      subtitle: 'Cancel anytime',
      layout: { layout: 'columns' },
      fields: { columnsDesktop: 3, highlightBlockIndex: 1, currency: 'USD' },
      blocks: [
        { kind: 'plan', text: 'Starter', fields: { price: '19', period: 'mo', ctaLabel: 'Start free', features: ['1 store', 'Email support'], recommended: false } },
        { kind: 'plan', text: 'Growth',  fields: { price: '49', period: 'mo', ctaLabel: 'Choose Growth', features: ['5 stores', 'Priority support', 'A/B testing'], recommended: true } },
        { kind: 'plan', text: 'Scale',   fields: { price: '99', period: 'mo', ctaLabel: 'Choose Scale', features: ['Unlimited', 'Dedicated CSM', 'SLA'], recommended: false } },
      ],
    },
    placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
    style: {
      layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
      spacing: { padding: 'loose', margin: 'none', gap: 'medium' },
      typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
      colors: { text: '#0f172a', background: '#ffffff', buttonBg: '#111827', buttonText: '#ffffff', overlayBackdropOpacity: 0.45 },
      shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm' },
      responsive: { hideOnMobile: false, hideOnDesktop: false },
      accessibility: { focusVisible: true, reducedMotion: true },
    },
  },
},
```

**Block-authoring rules (both examples):**
- `blocks[].kind` is the block type slug (`'plan'`, `'review-card'`, `'faq-item'`,
  `'logo'`, `'stat'`, `'slide'`, `'feature'`) — becomes `superapp-section__block--<kind>`
  in the renderer (`superapp-module.liquid:438`).
- Renderer-first-class fields: `text` (rendered as the block copy), `imageUrl` (block image),
  `url` (block link). Everything richer (author, rating, price, features[], recommended, …)
  goes in `blocks[].fields`.
- `config.layout.layout` picks the layout **variant** (`'grid' | 'columns' | 'carousel' |
  'stacked' | …`) — this is how one section type ships **3-5 variants from the same tokens**
  (design-vocabulary §2 line 157). Different variant files/entries differ by `layout.layout`,
  `fields.*`, `style.*`, and block arrangement — **not** by markup.
- Max 50 blocks (`recipe.ts:158`); `imageUrl`/`url` must be valid `https://` URLs (Zod
  `.url()`); placeholder CDN URLs are fine.

### C.4 Naming / id convention (collision-free namespace for parallel agents)

Two disjoint id namespaces so no two agents collide:

- **Module templates** — carry the **14 functional-category prefixes** the test asserts
  (`templates.test.ts:75`): `UAO DAP BCT CUX CHK TYO ACC SHP PAY TRU SUP LOY ANA OPS`, plus
  functional prefixes for corpus areas not in that set (`REV` reviews, `SUB` subscriptions,
  `WSH` wishlist, `BND` bundles, `POP` popups/email, `SRCH` search, `OPT` product-options,
  `BIS` back-in-stock, `PB` page-builder). **Each authoring agent is assigned a unique
  `<PREFIX>` + a reserved 100-number block** (e.g. Loox owns `REV-2xx`, Judge.me owns
  `REV-3xx`) — see §D.1, which fixes the block per unit. IDs run `<PREFIX>-<NNN>` zero-free
  (e.g. `REV-201`). Keep anchor IDs `UAO-001`, `CHK-037`, `ANA-109` alive (assign them to the
  relevant app agents — see §E).
- **Section templates** — prefix `SEC-<TYPE>-<NN>` (e.g. `SEC-HERO-01`, `SEC-PRICING-02`,
  `SEC-FAQ-03`). The `<TYPE>` segment is the section file's own name, so each section agent
  owns its entire `SEC-<TYPE>-*` space with zero coordination.

### C.5 Tags

Lowercase kebab tokens, 3-8 per entry. **Required:** (1) the source-app slug for module
templates (`'loox'`) or `'section'` for section templates; (2) the functional area
(`'reviews'`, `'pricing'`, `'upsell'`, `'bundles'`, `'loyalty'`, …); (3) the surface/placement
(`'product'`, `'cart'`, `'checkout'`, `'page'`) where meaningful. Optional: a style-pack hint
(`'bold-dtc'`, `'minimal-luxe'`, design-vocabulary §4) and a component archetype
(`'carousel'`, `'grid'`, `'accordion'`, `'marquee'`). Tags feed RAG ranking
(`solution-search.server.ts:59`) — spend them on retrieval terms a merchant would type.

---

## D. Agent assignment list

### D.1 Module-authoring units — 50 units (one file per app), 2-3 templates each

Each unit = one corpus plugin record under
`specs/028-recipe-vocabulary/research/plugins/*.md` (58 records, clustered to ~50 files so
each file has enough distinct surfaces). Agent reads that record's `settings_taxonomy` +
`visual_patterns` + `surfaces` and authors 2-3 templates that pick the **right RecipeSpec
type** for each surface (a reviews widget → `theme.section`; a discount → `functions.discountRules`;
an email flow → `messaging.campaign`/`flow.automation`; a checkout upsell → `checkout.upsell`;
a wishlist proxy → `proxy.widget`). **Reserved id block** in parentheses.

| # | Unit file | Corpus record(s) | Area | Prefix·block | Count |
|---|---|---|---|---|---|
| 1 | loox.ts | loox | reviews/UGC | REV·2xx | 3 |
| 2 | judge-me.ts | judge-me | reviews | REV·3xx | 3 |
| 3 | yotpo-reviews.ts | yotpo-reviews | reviews | REV·4xx | 2 |
| 4 | okendo.ts | okendo | reviews | REV·5xx | 2 |
| 5 | stamped.ts | stamped | reviews/loyalty | REV·6xx | 2 |
| 6 | fera.ts | fera | reviews/social-proof | TRU·2xx | 2 |
| 7 | provesource.ts | provesource | social-proof | TRU·3xx | 2 |
| 8 | rebuy.ts | rebuy | upsell/cross-sell | UAO·1xx (UAO-001 anchor) | 3 |
| 9 | honeycomb-upsell.ts | honeycomb-upsell | upsell | UAO·2xx | 2 |
| 10 | candy-rack.ts | candy-rack | upsell | UAO·3xx | 2 |
| 11 | reconvert.ts | reconvert | post-purchase/TYO | TYO·1xx | 3 |
| 12 | zipify-ocu.ts | zipify-ocu | one-click-upsell | TYO·2xx | 2 |
| 13 | selleasy.ts | selleasy | upsell/cross-sell | UAO·4xx | 2 |
| 14 | slide-cart-corner.ts | slide-cart-corner | cart-drawer | UAO·5xx | 2 |
| 15 | upcart.ts | upcart | cart-drawer | UAO·6xx | 2 |
| 16 | bold-upsell.ts | bold-upsell | upsell (Bold) | UAO·7xx | 2 |
| 17 | bold-bundles.ts | bold-bundles | bundles (Bold) | BND·1xx | 3 |
| 18 | fast-bundle.ts | fast-bundle | bundles | BND·2xx | 2 |
| 19 | moon-bundles.ts | moon-bundles | bundles | BND·3xx | 2 |
| 20 | kaching-bundles.ts | kaching-bundles | bundles | BND·4xx | 2 |
| 21 | wide-bundles.ts | wide-bundles | bundles | BND·5xx | 2 |
| 22 | bundler.ts | bundler | bundles | BND·6xx | 2 |
| 23 | discount-ninja.ts | discount-ninja | discounts | DAP·1xx (DAP fillers) | 3 |
| 24 | ultimate-special-offers.ts | ultimate-special-offers | discounts/offers | DAP·2xx | 2 |
| 25 | bold-discounts.ts | bold-discounts | discounts (Bold) | DAP·3xx | 2 |
| 26 | bold-custom-pricing.ts | bold-custom-pricing | B2B pricing (Bold) | PAY·1xx | 2 |
| 27 | smile-io.ts | smile-io | loyalty | LOY·1xx | 3 |
| 28 | loyaltylion.ts | loyaltylion | loyalty | LOY·2xx | 2 |
| 29 | rivo.ts | rivo | loyalty | LOY·3xx | 2 |
| 30 | bon-loyalty.ts | bon-loyalty | loyalty | LOY·4xx | 2 |
| 31 | growave.ts | growave | loyalty/reviews/wishlist | LOY·5xx | 3 |
| 32 | klaviyo.ts | klaviyo | email/SMS | SUP·1xx | 3 |
| 33 | omnisend.ts | omnisend | email/SMS | SUP·2xx | 2 |
| 34 | privy.ts | privy | popups/email | POP·1xx | 3 |
| 35 | justuno.ts | justuno | popups/CRO | POP·2xx | 2 |
| 36 | pushowl.ts | pushowl | web-push/BIS | SUP·3xx | 2 |
| 37 | appikon-notify-me.ts | appikon-notify-me | back-in-stock | BIS·1xx | 2 |
| 38 | swym-wishlist-plus.ts | swym-wishlist-plus | wishlist | WSH·1xx | 3 |
| 39 | recharge.ts | recharge | subscriptions | SUB·1xx | 3 |
| 40 | appstle-subscriptions.ts | appstle-subscriptions, loop-subscriptions, seal-subscriptions, bold-subscriptions | subscriptions | SUB·2xx | 3 |
| 41 | bold-product-options.ts | bold-product-options, globo-product-options, hulk-infinite-options | product-options | OPT·1xx | 3 |
| 42 | kickflip.ts | kickflip | product-customizer | OPT·2xx | 2 |
| 43 | hextom-usb.ts | hextom-usb, foxkit | utility/CRO suite | OPS·1xx | 3 |
| 44 | hextom-countdown.ts | hextom-countdown | urgency/countdown | CUX·1xx | 2 |
| 45 | boost-ai-search.ts | boost-ai-search, shopify-search-discovery | search/filter | SRCH·1xx | 3 |
| 46 | intuitive-shipping.ts | intuitive-shipping | shipping rules | SHP·1xx | 3 |
| 47 | bold-checkout.ts | bold-checkout, bold-brain, bold-memberships | checkout/memberships (Bold) | CHK·1xx (CHK-037 anchor) | 3 |
| 48 | pagefly.ts | pagefly | page-builder | PB·1xx | 3 |
| 49 | gempages.ts | gempages | page-builder | PB·2xx | 2 |
| 50 | analytics-ops.ts | (cross-corpus: pixels/flows/integrations gleaned from klaviyo/omnisend/etc.) | analytics/ops (ANA-109 anchor, BCT, ACC) | ANA·1xx / BCT·1xx / ACC·1xx | 3 |

**Module total: ~118 templates** (sum of the Count column) across 50 files — **≥ 100 ✓**,
and comfortably ≥ the ≥9-per-prefix floor for the 14 asserted prefixes once §D.3 coverage
is added.

### D.2 Section-authoring units — 24 units (one file per section type), 4-5 variants each

Each unit = one section type from the design-reference catalog (design-vocabulary §2
lines 156-170 + the Tailwind-Plus taxonomy in batch-3.md line 101). Agent authors 4-5
`theme.section` templates that differ only by `layout.layout` + `fields` + `style` (the
"3-5 layout variants driven by the same token set" rule), each using the modular `blocks[]`
where the type is list-shaped. Id space `SEC-<TYPE>-NN`.

| # | Section file | Variants | Block kind(s) |
|---|---|---|---|
| 1 | hero.ts | 5 (split · centered · photo-overlay · ambient-gradient · video) | (media/cta in fields) |
| 2 | feature-bento.ts | 5 | `feature` |
| 3 | feature-columns.ts | 4 | `feature` |
| 4 | pricing.ts | 5 | `plan` |
| 5 | testimonials.ts | 5 (wall · marquee · single-spotlight · carousel · grid) | `review-card` |
| 6 | faq.ts | 4 (accordion · two-column · searchable · categorized) | `faq-item` |
| 7 | carousel.ts | 5 | `slide` |
| 8 | stats.ts | 4 (counter-row · grid · big-number · split) | `stat` |
| 9 | cta-band.ts | 4 | (fields) |
| 10 | newsletter.ts | 5 (inline · centered · split-image · popup-style · footer) | (fields) |
| 11 | logo-marquee.ts | 4 (scroll-marquee · static-grid · mono-row · framed) | `logo` |
| 12 | footer.ts | 4 (multi-column · minimal · newsletter-footer · mega) | `link-group` |
| 13 | product-grid.ts | 5 | `product-card` |
| 14 | collection-list.ts | 4 | `collection-card` |
| 15 | announcement-bar.ts | 4 (static · rotating · countdown · dismissible) | `message` |
| 16 | gallery-lookbook.ts | 4 (masonry · sticky-scroll · split · fullbleed) | `slide` |
| 17 | rich-text.ts | 4 (centered · two-column · pull-quote · icon-list) | (fields) |
| 18 | image-with-text.ts | 5 | (fields) |
| 19 | comparison-table.ts | 4 | `row` |
| 20 | steps-howto.ts | 4 (numbered · timeline · cards · horizontal) | `step` |
| 21 | banner-slideshow.ts | 4 | `slide` |
| 22 | trust-badges.ts | 4 (row · grid · inline · sticky) | `badge` |
| 23 | contact-map.ts | 4 (split · stacked · full-map · card) | (fields) |
| 24 | countdown-hero.ts | 4 | (fields) |

**Section total: ~104 templates** across 24 files — **≥ 100 ✓**. Every variant is
`type: 'theme.section'`, so this pool alone over-covers the `theme.section` type requirement.

### D.3 Coverage unit — 1 unit, hand-authored, guarantees the test floors

`templates/coverage.ts` (owned by the wiring agent, authored last) fills any gap the corpus
under-produces so `templates.test.ts` stays green:
- **All 23 `RECIPE_SPEC_TYPES`** get ≥1 template — the corpus already covers the common ones;
  coverage.ts adds any rarely-used type not otherwise produced (`admin.discountUi`,
  `agentic.catalogProfile`, `functions.orderRoutingLocationRule`,
  `functions.fulfillmentConstraints`, `platform.extensionBlueprint`,
  `functions.cartAndCheckoutValidation`, `pos.extension` if unmet).
- **14-prefix ≥9 floor** — top up any of `UAO DAP BCT CUX CHK TYO ACC SHP PAY TRU SUP LOY ANA
  OPS` that the §D.1 assignment leaves under 9. The wiring agent runs the count check (§E.4)
  and adds the minimum needed. Budget ~15-25 templates here.

**Grand totals:** modules ≈ 118 + coverage ≈ 20 = **≥ 100 module templates ✓**;
sections ≈ 104 = **≥ 100 section templates ✓**; library ≈ 240 entries (test floor raised to
≥ 226, §E).

---

## E. Removal + wiring + catalog-regen + verify plan (final wiring agent)

Run **after** all 74 authoring files exist under `templates/modules/`, `templates/sections/`.

**E.1 — Scaffold the shared type + barrels** (create; authoring agents depend on `types.ts`,
so in practice this is created first, before agents run):
```bash
cd packages/core/src/templates
```
- `types.ts`:
  ```ts
  export type { TemplateEntry } from '../templates.js';
  ```
- `modules/index.ts`: import every `*_TEMPLATES` and
  `export const MODULE_APP_TEMPLATES: TemplateEntry[] = [ ...LOOX_TEMPLATES, … ];`
- `sections/index.ts`: same for `SECTION_TEMPLATES`.
- `coverage.ts`: `export const COVERAGE_TEMPLATES: TemplateEntry[] = [ … ];`
- `templates/index.ts`:
  ```ts
  import type { TemplateEntry } from './types.js';
  import { MODULE_APP_TEMPLATES } from './modules/index.js';
  import { SECTION_TEMPLATES } from './sections/index.js';
  import { COVERAGE_TEMPLATES } from './coverage.js';
  export const ALL_TEMPLATES: TemplateEntry[] =
    [...MODULE_APP_TEMPLATES, ...SECTION_TEMPLATES, ...COVERAGE_TEMPLATES];
  ```

**E.2 — Swap the registry seam** in `packages/core/src/templates.ts`:
- Delete the four `import { PARTn_TEMPLATES } from './_templates_partn.js';` lines (`:5-8`).
- Replace `const TEMPLATE_SOURCE = [...PART1…PART4]` (`:63-68`) with:
  ```ts
  import { ALL_TEMPLATES } from './templates/index.js';
  const TEMPLATE_SOURCE: TemplateEntry[] = ALL_TEMPLATES;
  ```
- **Everything else in `templates.ts` is untouched.**

**E.3 — Remove the old files:**
```bash
cd packages/core/src && git rm _templates_part1.ts _templates_part2.ts _templates_part3.ts _templates_part4.ts
grep -rn "_templates_part" ../../ --include="*.ts" --include="*.tsx"   # must return nothing but this doc
```

**E.4 — Update the test floors** in `packages/core/src/__tests__/templates.test.ts`:
- `:14-16` bump `>= 126` → `>= 226` (or the actual final count minus headroom).
- `:73-80` keep the 14 prefixes + `>= 9` (coverage.ts guarantees it) — **do not weaken**.
- `:55-67` keep anchor IDs `UAO-001`, `CHK-037`, `ANA-109` (assigned in §D.1).
- Add a one-line assertion that `theme.section` count ≥ 100 and non-`theme.section` module
  count ≥ 100, so the "≥100 + ≥100" goal is regression-guarded.

**E.5 — Build + gate:**
```bash
cd packages/core
pnpm build          # tsc -p tsconfig.json — proves every unit file typechecks
pnpm test           # runs templates.test.ts (schema parse on ALL entries) + recipe.test.ts + catalog.test.ts
```
The `templates.test.ts:35-40` loop is the schema gate — a single invalid `spec` in any of the
74 files fails the suite with the offending `id`.

**E.6 — Catalog regen (belt-and-suspenders; templates do NOT feed the catalog, §A.4):**
```bash
cd packages/core && pnpm exec tsx src/catalog.generator.ts
git diff --stat src/catalog.generated.json   # EXPECT: no change (decoupled)
```
If it diffs, something coupled catalog↔templates unexpectedly — investigate before merge.

**E.7 — Whole-repo verify:**
```bash
cd <repo root>
pnpm --filter @superapp/core build && pnpm --filter @superapp/core test
pnpm --filter web typecheck    # solution-search.server.ts + template routes still compile
```
`solution-search.server.ts`, `api.modules.from-template.tsx`, and the four template routes
consume only the unchanged registry API, so they need no edits — the typecheck confirms it.

**E.8 — Done criteria:**
- `MODULE_TEMPLATES.length ≥ 226`, all parse, all ids unique.
- `theme.section` entries ≥ 100; non-section module entries ≥ 100.
- All 23 `RECIPE_SPEC_TYPES` covered; 14 prefixes each ≥ 9.
- `pnpm test` green; `catalog.generated.json` unchanged; `_templates_part*.ts` gone.

---

## Appendix — files the authoring agents read

- Module content: `specs/028-recipe-vocabulary/research/plugins/<app>.md` — sections
  `surfaces`, `settings_taxonomy` (content/style/targeting/behavior/data), `visual_patterns`,
  `data_model`. (58 records; loox.md:34-95 is the structural reference.)
- Section content: `specs/028-recipe-vocabulary/research/design/design-vocabulary.md` §2
  (lines 156-170, the section-block catalog + variants) and §4 (lines 210-227, the six style
  packs) + `design/batch-3.md:101` (Tailwind-Plus module taxonomy) + `batch-4.md`, `batch-8.md`
  (ui-layouts block taxonomy).
- Schema of record: `packages/core/src/recipe.ts` (`theme.section` = 136-191) and
  `packages/core/src/storefront-style.ts:40-129` (the `style` object).
- Placement enums: `packages/core/src/allowed-values.ts` — `THEME_PLACEABLE_TEMPLATES`,
  `THEME_SECTION_GROUPS`.
```
