# 033 — Theme Edit API: Native Liquid Section Push (`themeFilesUpsert`)

**Status:** design only (read + design; no code changed, no agents fired).
**Goal:** add a SECOND deploy path for storefront `theme.section` modules — compile a
generated module to a **real, self-contained `sections/superapp-<slug>.liquid` file with a
native `{% schema %}`** and push it into the merchant's theme via the Shopify **Theme
Files API** (`themeFilesUpsert`), alongside the existing theme-app-extension (app-block +
metaobject) path. The app-block path stays the default and stays intact.

**One-line reversal note:** the codebase made a deliberate "no raw-Liquid codegen" decision
(memory `store-aesthetic-section-generation`, `generic-theme-section`; `publish.service.ts:107-109`
throws on `THEME_ASSET_UPSERT`). This spec **re-enables that seam for one narrow case** —
merchant-initiated push of a validated native section to a **non-live / duplicated** theme —
and keeps it safe by (a) writing to a duplicated unpublished theme by default, (b) validating
the Liquid before push, (c) requiring explicit merchant confirmation, and (d) a first-class
rollback. See §8 for the honest gating caveats.

---

## 1. Current state (file:line)

### 1.1 The disabled `THEME_ASSET_UPSERT` seam
- The compiler's `DeployOperation` union already carries the two theme-file ops, unused:
  `apps/web/app/services/recipes/compiler/types.ts:2-3`
  ```ts
  | { kind: 'THEME_ASSET_UPSERT'; themeId: string; key: string; value: string }
  | { kind: 'THEME_ASSET_DELETE'; themeId: string; key: string }
  ```
- `PublishService.publish()` iterates `ops` and **throws** on both — the deliberate disablement:
  `apps/web/app/services/publish/publish.service.ts:105-109`
  ```ts
  case 'THEME_ASSET_UPSERT':
  case 'THEME_ASSET_DELETE':
    throw new Error('Theme file writes are not used. Theme modules deploy via app extension (metaobjects).');
  ```
- No compiler currently *emits* these ops — grep shows only the type decl + the throw + tests.
  So the scaffold is inert on both ends (nothing produces them; the consumer rejects them).

### 1.2 The theme service (thin, read-only today)
- `apps/web/app/services/shopify/theme.service.ts:21-37` — `ThemeService.listThemes()` runs a
  `themes(first: 25)` GraphQL query, returns `{ id:number, name, role }` where role is
  normalized to `'main' | 'unpublished' | …`. **This is the only theme-write/read seam today and
  it does not write anything.** (Note: it parses GIDs down to numeric ids — the new path needs the
  GID, see §5.4.)
- Theme *asset reads* already migrated to GraphQL `theme.files(filenames:)` in
  `theme-analyzer.service.ts` (per memory) — so the read half of the Theme Files API is already in use.

### 1.3 The existing `theme.section` compile → publish path (the one we parallel)
- **Schema:** `theme.section` is the single generic storefront type —
  `packages/core/src/recipe.ts:132-191`. Carries `config.kind` (free-form tag),
  `config.activation` (`section|global|overlay`), `config.fieldSchema`+`config.fields`
  (typed settings), `config.blocks[]` (`.max(50)` — the reorderable content array),
  `config.advancedCustom` (sanitized HTML/CSS/JS), `placement`, `style`.
- **Compiler entry:** `apps/web/app/services/recipes/compiler/index.ts:23-27` →
  `compileThemeSection` → `theme-module.ts:compileThemeModule()`
  (`theme-module.ts:86-115`). It requires `target.moduleId`, compiles inline CSS
  (`compileThemeStyleCss`), and returns a `ThemeModulePayload` (**not** any `THEME_ASSET_*` op) —
  i.e. today's path is metaobject-only.
- **Publish:** `PublishService.writeThemeModule()` (`publish.service.ts:149-161`) upserts a
  `$app:superapp_module` metaobject and appends its GID to the `superapp.theme/module_refs`
  shop metafield list.
- **Render:** the theme-app-extension snippet
  `extensions/theme-app-extension/snippets/superapp-module.liquid` reads that metaobject
  (`config_json.kind`) and renders every kind (incl. the generic `blocks[]` loop at
  `:438` per spec 032 §A.6). Placed on the page by the app embed + universal/product/collection
  slot blocks.
- **DeployTarget:** `packages/core/src/recipe.ts:72-88` — a 2-arm union keyed on `kind`:
  `THEME { themeId, moduleId? }` and `PLATFORM { moduleId? }`.
  `DEPLOY_TARGET_KINDS = ['THEME','PLATFORM']` (`allowed-values.ts:940`).

### 1.4 Current app scopes (the gate)
- `shopify.app.toml` `[access_scopes]`:
  `read_customers,read_metaobjects,read_products,read_themes,write_app_proxy,write_customers,write_metaobjects,write_orders`.
  **`write_themes` is NOT present** — only `read_themes`. This feature cannot ship until
  `write_themes` is added AND the app is granted a Shopify exemption (see §2, §8).

---

## 2. The Shopify API contract (verified via Shopify dev MCP, API 2026-04 / docs 2026-07)

All confirmed against the live Admin GraphQL docs — not guessed.

### 2.1 The mutation
```graphql
mutation themeFilesUpsert($files: [OnlineStoreThemeFilesUpsertFileInput!]!, $themeId: ID!) {
  themeFilesUpsert(files: $files, themeId: $themeId) {
    upsertedThemeFiles { filename }
    job { id }
    userErrors { field message }
  }
}
```
Input shapes (verified):
- `OnlineStoreThemeFilesUpsertFileInput` = `{ filename: String!, body: OnlineStoreThemeFileBodyInput! }`
- `OnlineStoreThemeFileBodyInput` = `{ type: OnlineStoreThemeFileBodyInputType!, value: String! }`
- `OnlineStoreThemeFileBodyInputType` enum = `TEXT | BASE64 | URL`.
  For a Liquid section we use `type: TEXT`, `value: "<the .liquid source>"`.
- `themeId` is a **GID**: `gid://shopify/OnlineStoreTheme/<numeric>`.

Companion mutations (verified, same requirements):
- **`themeFilesDelete(files: [String!]!, themeId: ID!)`** — deletes by filename. Our rollback primitive.
- **`themeFilesCopy(files: [ThemeFilesCopyFileInput!]!, themeId: ID!)`** — `{ srcFilename, dstFilename }`;
  copying onto an existing file overwrites it. Useful for backup-before-overwrite.
- **`themeDuplicate(id: ID!, name: String)`** — duplicates a theme (2025-10+). Our "write to a copy" primitive.
- **`themeCreate(source: URL!, name, role: UNPUBLISHED|DEVELOPMENT)`** and **`themePublish(id)`** — full theme lifecycle.

### 2.2 Scope + exemption (the hard gate)
- `themeFilesUpsert`, `themeFilesCopy`, `themeFilesDelete`, `themeCreate`, `themeDuplicate` all state:
  **"Requires the user needs `write_themes` AND an exemption from Shopify to modify theme files.
  If you think your app is eligible… you can submit an exception request."**
- Reads (`theme`, `themes`, `theme.files`, `OnlineStoreThemeFile*`) require only `read_themes`
  (already held) — **no exemption needed to read.**
- **Built-for-Shopify policy** (`built-for-shopify/requirements` §3.2.2, verified):
  "Your app shouldn't add, remove, or edit a merchant's theme files." Three exceptions:
  **page-builder** apps that provide an alternative customization experience, **backup/restore**
  apps, and **SEO / content-locking / developer-tooling** apps. Asset/Theme-file usage is
  **audited** at BFS review. Our super-app's section-authoring surface plausibly qualifies under
  the **page-builder** exception, and that is the justification the exemption request must make.

### 2.3 Version, limits, async
- Repo API version is **2026-04** (`shopify.app.toml [webhooks] api_version`, extension tomls).
  The Theme Files API has been GA since **2024-10**; `themeDuplicate` since **2025-10**; all present in 2026-04.
- **Max 50 files per `themeFilesUpsert` request** (enforced).
- The mutation is **asynchronous**: it returns a `job { id }`. Poll `Job.done` (via `node(id:)`)
  before claiming the write landed and before running any post-write validation/read-back.
- Standard Admin GraphQL cost/rate limits apply (leaky bucket). A single section = 1 file = well
  within limits; batch multiple sections up to 50/request.

### 2.4 The Asset REST API (legacy — do NOT use)
- REST `Asset` PUT/DEL is legacy (since 2023-04) and gated by the same `write_themes` + exemption.
  REST Admin is legacy as of Oct 2024; new public apps must be GraphQL-only (Apr 2025).
  **This spec uses `themeFilesUpsert` (GraphQL) exclusively.** The `key`/`value` field names on the
  existing `THEME_ASSET_UPSERT` op are Asset-API-flavored; we re-map them (§5.1) to `filename`/`body`.

---

## 3. SAFETY MODEL (critical — live-theme writes can break a storefront)

Design principle: **never silently write to the live (MAIN-role) theme.** A bad `{% schema %}`
or a Liquid syntax error in a pushed file can break theme customization or the storefront render.
The flow below makes every write reversible and merchant-consented.

### 3.1 Target-theme selection (default safe)
Merchant picks one of three, default = **(A)**:
- **(A) Duplicate & push (default, safest).** `themeDuplicate(mainThemeId)` → an UNPUBLISHED copy
  named `"<theme> + SuperApp <slug>"`; push the section into the copy; hand the merchant the
  **theme preview link** and a one-click "Publish this theme" (they can also publish from Shopify
  admin). The live storefront is untouched until *they* publish. Cost: an extra theme in the list.
- **(B) Push to an existing UNPUBLISHED / DEVELOPMENT theme** the merchant chose (staging). No live impact.
- **(C) Push to the live (MAIN) theme directly.** Allowed only behind an explicit, typed
  confirmation ("I understand this edits my live theme") and only after validation passes and a
  backup is taken (§3.3). Adding the *section file* alone does not render it anywhere until the
  merchant adds the section in the theme editor — so even (C) is non-destructive to existing pages
  as long as we ONLY write `sections/superapp-*.liquid` and never touch `templates/*.json`,
  `config/settings_data.json`, or `layout/*` (§3.4).

### 3.2 Pre-push validation (before any write)
1. **Schema/Liquid validation via the dev MCP `validate_theme` tool** (and/or `shopify theme check`
   in CI) on the generated file — must pass with zero errors. Note: `shopify` CLI / theme-check is
   NOT currently in `node_modules/.bin` (verified), so CI must install it; the runtime path relies on
   `validate_theme` + our own compile-time guarantees.
2. **`{% schema %}` JSON.parse + shape check** — valid JSON, `name` present, `settings[]`/`blocks[]`
   well-formed, `max_blocks ≤ 50`, `presets[]` present. (Our compiler emits this deterministically,
   so it is valid by construction; validation is defense-in-depth against the `advancedCustom` escape hatch.)
3. **Reuse the existing trust boundary:** the section body is assembled from the *already-sanitized*
   `theme.section` config (RecipeSpec validation + the existing HTML/CSS/JS sanitizer +
   `compileThemeStyleCss`), so no un-sanitized model output reaches Liquid. `advancedCustom` is the
   only free-form surface and it is already CSP/scope-bound in the app-block path — the same
   sanitizer runs here.

### 3.3 Backup before overwrite (idempotent, reversible)
- Section filename is **namespaced**: `sections/superapp-<slug>.liquid`. Slug derives from `moduleId`,
  so an app-owned file can only ever collide with a *previous SuperApp push*, never a merchant/theme file.
- Before overwriting an existing SuperApp file, `themeFilesCopy` it to
  `sections/superapp-<slug>.bak.liquid` (or record the prior body in our DB) so the previous version
  is restorable.

### 3.4 Allow-list of writable paths (hard guard)
The publish path **only** permits writes matching `^sections/superapp-[a-z0-9-]+\.liquid$`
(plus, if ever needed, `assets/superapp-<slug>.(css|js)`). Any op targeting `templates/`,
`config/`, `layout/`, `locales/`, `snippets/` (non-superapp), or `settings_data.json` is **rejected
in code** before the mutation runs. This keeps us inside the BFS page-builder exception (we add our
own files; we never edit theirs) and makes even a live-theme push non-destructive to existing content.

### 3.5 Rollback
- **Section file:** `themeFilesDelete(["sections/superapp-<slug>.liquid"], themeId)` removes it;
  restore the `.bak` via `themeFilesCopy` if a prior version existed.
- **Whole theme (path A/B):** the duplicated theme can simply be deleted (`themeDelete`) — the live
  theme was never touched, so "rollback" is "don't publish / delete the copy."
- **Placement:** if the merchant added the section to a template and we delete the file, Shopify
  degrades gracefully (missing-section placeholder) — documented in the merchant-facing copy.

### 3.6 Never auto-publish
The app **never** calls `themePublish` automatically. Publishing a theme is always a merchant action
(in-app button that we may offer, or in Shopify admin). Default path (A) makes this explicit.

---

## 4. The NATIVE SECTION MODEL

### 4.1 Shape of a generated `sections/superapp-<slug>.liquid`
A self-contained native section — Liquid markup + a valid `{% schema %}` with `settings`, `blocks`,
`max_blocks`, and `presets`. Sketch (structure, not final markup):

```liquid
{%- comment -%} SuperApp — generated native section. module:<moduleId> {%- endcomment -%}
{%- style -%}
  #shopify-section-{{ section.id }} .superapp-section { /* compiled --sa-* vars + base rules */ }
{%- endstyle -%}

<div class="superapp-section superapp-section--{{ section.settings.kind }}"
     {{ section.shopify_attributes }}>
  {%- if section.settings.title != blank -%}
    <h2 class="superapp-section__title">{{ section.settings.title | escape }}</h2>
  {%- endif -%}
  <div class="superapp-section__blocks superapp-section__blocks--{{ section.settings.layout }}">
    {%- for block in section.blocks -%}
      <div class="superapp-section__block superapp-section__block--{{ block.type }}"
           {{ block.shopify_attributes }}>
        {%- case block.type -%}
          {%- when 'plan' -%}
            <span class="price">{{ block.settings.price }}</span>
            <span class="period">/{{ block.settings.period }}</span>
            <p>{{ block.settings.text }}</p>
          {%- when 'review-card' -%}
            {{ block.settings.text }}
          {# … one branch per block kind used by this section … #}
        {%- endcase -%}
      </div>
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "Pricing — 3-Tier Compare",
  "tag": "section",
  "class": "superapp-section-wrapper",
  "settings": [
    { "type": "text",   "id": "title",  "label": "Title",  "default": "Choose your plan" },
    { "type": "select", "id": "layout", "label": "Layout",
      "options": [
        { "value": "columns", "label": "Columns" },
        { "value": "grid",    "label": "Grid" },
        { "value": "carousel","label": "Carousel" }
      ], "default": "columns" }
  ],
  "blocks": [
    { "type": "plan", "name": "Plan", "settings": [
        { "type": "text", "id": "text",   "label": "Name" },
        { "type": "text", "id": "price",  "label": "Price" },
        { "type": "text", "id": "period", "label": "Period", "default": "mo" },
        { "type": "checkbox", "id": "recommended", "label": "Recommended", "default": false }
    ]}
  ],
  "max_blocks": 50,
  "presets": [
    { "name": "Pricing — 3-Tier Compare",
      "settings": { "title": "Choose your plan", "layout": "columns" },
      "blocks": [
        { "type": "plan", "settings": { "text": "Starter", "price": "19", "period": "mo" } },
        { "type": "plan", "settings": { "text": "Growth",  "price": "49", "period": "mo", "recommended": true } },
        { "type": "plan", "settings": { "text": "Scale",   "price": "99", "period": "mo" } }
      ]
    }
  ]
}
{% endschema %}
```

### 4.2 How a RecipeSpec `theme.section` maps to native section Liquid
| RecipeSpec field | Native section artifact |
|---|---|
| `config.title` / `config.subtitle` | `{% schema %}.settings[]` (`type:"text"`, ids `title`/`subtitle`) + the `presets[0].settings` defaults |
| `config.fieldSchema` (typed settings) | additional `{% schema %}.settings[]` entries; DataModel field types map to Shopify setting types (text→text, longtext→textarea/richtext, number→number/range, boolean→checkbox, enum→select, image→image_picker, url→url, color→color) |
| `config.fields` (values) | `presets[0].settings` defaults |
| `config.blocks[]` (the reorderable array) | `{% schema %}.blocks[]` **block type definitions** (one per distinct `kind`) + `presets[0].blocks[]` **instances** (one per entry). This is the big win: `blocks[]` becomes NATIVE theme-editor-reorderable blocks. `.max(50)` → `max_blocks: 50`. |
| `blocks[].kind` | block `type` slug; `text`/`imageUrl`/`url` → block settings `text`/`image_picker`/`url`; `blocks[].fields.*` → per-block settings |
| `config.layout.layout` | a `select` setting driving the layout variant class (same "3–5 variants from one token set" model as §032) |
| `style.*` | compiled to a scoped `{%- style -%}` block at the top (reuse `compileThemeStyleCss`, re-scoped to `#shopify-section-{{ section.id }}` instead of `[data-module-id]`) |
| `config.advancedCustom` | sanitized markup/CSS/JS inlined into the section body (same sanitizer as app-block path) |
| `placement.enabled_on.templates` | `{% schema %}.enabled_on.templates` (native section placement) |
| `config.ruleEngine` | server-resolvable rules → `{% if %}` gate inside the section; behavioral rules cannot be evaluated in a static file → either dropped with a warning or deferred to a small inline JS shim reusing `superapp-modules.js` semantics (recommend: warn + drop for v1) |

### 4.3 DECISION: new **deploy target** on `theme.section`, NOT a new RecipeSpec type
**Recommendation: make "native section file" a new DEPLOY TARGET, not a new type.** The merchant
(or the app) chooses, per publish, between **"App block" (metaobject + theme-app-extension, default)**
and **"Theme section file" (native `.liquid` via `themeFilesUpsert`)**. Same `theme.section` spec,
two compile targets.

Why:
- **The spec is identical.** A `theme.section` already fully describes title/blocks/fields/style/
  placement. Nothing about the *authoring* changes — only *where the bytes land*. A new RecipeSpec
  type would duplicate the entire schema, classifier entries, preview renderer, templates, and the
  023 guardrails, for zero authoring gain, and would violate the standing "only `theme.section` +
  `proxy.widget` are first-class storefront types" invariant (`generic-theme-section` memory).
- **The seam already models this.** `DeployTarget` is a discriminated union and the compiler already
  branches on `target.kind`. Adding a target arm is the minimal, idiomatic change.
- **Same module, two lifecycles.** A merchant can even do both (app block for merchants who won't
  edit theme code; native file for those who want a real section they own) from one generated module.
- **Trust model is unchanged** — the reversal (§8) is about *output medium*, not about letting the
  model emit arbitrary Liquid. The section body is still assembled deterministically from a validated,
  sanitized `theme.section`.

Concretely: extend `DEPLOY_TARGET_KINDS` to `['THEME','PLATFORM','THEME_NATIVE_SECTION']` (or add a
`mode: 'app_block' | 'native_section'` discriminant to the existing `THEME` arm — **preferred**, since
it keeps `themeId`/`moduleId` and avoids touching every `DeployTargetKind` consumer). The `THEME` arm
becomes `{ kind:'THEME', themeId, moduleId?, mode?: 'app_block' | 'native_section' }`, default `'app_block'`.

---

## 5. COMPILER + PUBLISH wiring

### 5.1 Compiler: `theme.section` → native section op
- In `compileThemeSection` / `theme-module.ts`, when `target.kind==='THEME' && target.mode==='native_section'`:
  1. Build the section Liquid string via a new pure module
     `apps/web/app/services/recipes/compiler/native-section.ts`:
     `renderNativeSection(spec, { sectionId }): string` — deterministic, no I/O; produces markup +
     `{% schema %}` per §4. Reuses `compileThemeStyleCss` (re-scoped) and the existing sanitizer.
  2. Emit a single `THEME_ASSET_UPSERT` op — **re-purposing the existing op fields**:
     `{ kind:'THEME_ASSET_UPSERT', themeId: <resolved GID>, key: 'sections/superapp-<slug>.liquid', value: <liquid> }`.
     (`key` = filename, `value` = body. Keep the op shape; the publish layer maps to
     `filename`/`body:{type:TEXT,value}`.) Do **not** emit a `themeModulePayload` for this target
     (the two targets are mutually exclusive per publish).
- App-block target (`mode` absent/`'app_block'`): **unchanged** — still returns `themeModulePayload`,
  never a `THEME_ASSET_*` op. Full back-compat.

### 5.2 Publish: replace the throw with a real writer
`PublishService` gains a `ThemeFilesService` dependency and the `THEME_ASSET_*` cases stop throwing:
```ts
case 'THEME_ASSET_UPSERT':
  assertWritablePath(op.key);                 // §3.4 allow-list guard
  await this.themeFiles.upsertSection(op.themeId, op.key, op.value); // themeFilesUpsert + job poll
  break;
case 'THEME_ASSET_DELETE':
  assertWritablePath(op.key);
  await this.themeFiles.deleteFiles(op.themeId, [op.key]);           // themeFilesDelete (rollback)
  break;
```
New `apps/web/app/services/shopify/theme-files.service.ts`:
- `upsertSection(themeGid, filename, body)` → runs `themeFilesUpsert`, checks `userErrors`, polls `job.id`.
- `deleteFiles(themeGid, filenames)` → `themeFilesDelete`.
- `duplicateTheme(themeGid, name)` → `themeDuplicate`.
- `backupFile(themeGid, filename)` → `themeFilesCopy` to `.bak`.
- All are behind a capability check that the app actually holds `write_themes` (surface a clear
  "not eligible / exemption pending" error otherwise — reuse the `ModuleNotPublishableError` shape).

### 5.3 Theme-selection + safety flow (publish orchestration)
1. UI (merchant) picks native-section target → chooses theme strategy A/B/C (§3.1), default A.
2. Preflight: confirm `write_themes` present; run `validate_theme` on the rendered section; JSON-parse
   the schema (§3.2). Any failure → block with reasons (never a partial write).
3. If strategy A: `themeDuplicate(main)` → get the copy's GID → target that GID.
   If overwriting an existing SuperApp file: `backupFile` first (§3.3).
4. Compile → `THEME_ASSET_UPSERT` with the resolved theme GID → `PublishService` writes it, polls the job.
5. Read-back verify (`theme.files(filenames:[...])`) that the file exists with the expected checksum.
6. Return the theme preview URL + a "Publish theme" affordance (never auto-publish, §3.6).
7. Persist a publish record (theme GID, filename, prior-body backup ref) for rollback.

### 5.4 GID handling
`ThemeService.listThemes()` currently returns numeric ids. The native path needs the **GID**. Add
`listThemesWithGid()` (or stop stripping the GID) so the publish path passes
`gid://shopify/OnlineStoreTheme/<n>` straight to `themeFilesUpsert`.

---

## 6. How this reshapes the 100+ section templates (spec 032)

Spec 032 authors ≥100 `theme.section` templates using the `config.blocks[]` model and notes
(§A.6, lines 169-177) that "the real valid way to author a section with modular blocks in THIS
system is the app-block / `config.blocks[]` model — **not** Shopify's native `{% schema %}` blocks."
**This spec makes that a compile choice, so the templates become dual-emit for free.**

Template-shape implications for the 032 authoring contract:
1. **No new template shape required.** The same `TemplateEntry.spec` (a `theme.section`) compiles to
   EITHER an app block OR a native section. Authors keep writing `config.blocks[]` — the native
   compiler maps `blocks[]` → `{% schema %}.blocks[]` + `presets[].blocks[]` (§4.2). This is strictly
   additive to 032.
2. **`blocks[].kind` must map to a native block `type`.** Native block `type` values are used as
   object keys and CSS class suffixes; constrain `kind` to `^[a-z][a-z0-9_-]{0,24}$` (a lint 032 can
   add to its `templates.test.ts` gate). The 032 kinds (`plan`, `review-card`, `faq-item`, `logo`,
   `stat`, `slide`, `feature`) already satisfy this.
3. **Per-kind block settings need declared field types.** For native output, each `blocks[].fields.*`
   key must resolve to a Shopify setting type. Recommend 032 attach an optional `fieldSchema` at the
   block level (or a small per-kind field-type registry in the native compiler) so `price`/`features[]`/
   `recommended` map to `text`/`? `/`checkbox`. For v1, untyped fields default to `text` and arrays
   (`features[]`) render via a delimited text setting — documented limitation.
4. **`max_blocks: 50`** falls straight out of `blocks.max(50)` — no author action.
5. **`presets` come from the authored `blocks[]` + `fields`** — the template's example content
   *becomes* the section's default preset, so a merchant dragging the section in gets the designed
   layout immediately. This is a real UX upgrade the app-block path can't give.
6. **Authoring-contract revision:** add one sentence to 032 — "every `theme.section` template MUST be
   native-emittable: `blocks[].kind` slug-safe, block fields typed (or defaulted), layout variants via
   `config.layout.layout`." The existing schema-parse gate (`templates.test.ts:35-40`) is extended
   with a `renderNativeSection(spec)` + `validate_theme` assertion so a template that can't produce a
   valid native section fails CI (§7).

---

## 7. Build plan (increment-sized) + test plan

### 7.1 Build increments (each independently shippable / testable)
1. **Read-only scope + theme service GID** — add `write_themes` to `optional_scopes` (not `scopes`, so
   installs don't break pre-exemption); `ThemeService.listThemesWithGid()`. No behavior change yet.
2. **`native-section.ts` renderer (pure)** — `renderNativeSection(spec, opts): string`. No I/O. Unit
   + `validate_theme` tested. Nothing wired to publish yet.
3. **`DeployTarget` mode discriminant** — add `mode?: 'app_block'|'native_section'` to the `THEME`
   arm (default `app_block`); thread through `compileThemeSection`. App-block path byte-identical.
4. **Compiler emits `THEME_ASSET_UPSERT`** for `mode:'native_section'` (§5.1).
5. **`ThemeFilesService` + un-throw publish** (§5.2) behind an `assertWritablePath` guard + a
   `write_themes`-present capability gate. `THEME_ASSET_DELETE` rollback included.
6. **Safety orchestration** — duplicate-theme strategy A default, backup-before-overwrite, job poll,
   read-back verify, preview URL, no auto-publish (§5.3).
7. **UI** — target picker ("App block" vs "Theme section file") + theme strategy A/B/C + typed
   live-theme confirmation.
8. **032 gate extension** — native-emittability lint + `validate_theme` in `templates.test.ts`.

### 7.2 Test plan
- **`shopify theme check` / dev-MCP `validate_theme`** on a generated section — zero errors. Run in
  CI (install CLI; it's not currently in `.bin`) and at publish preflight.
- **Schema validity:** `JSON.parse` the `{% schema %}`; assert `name`, well-formed `settings[]`/`blocks[]`,
  `max_blocks ≤ 50`, `presets[].blocks[].type ∈ blocks[].type`.
- **Golden-file render:** snapshot `renderNativeSection` output for representative kinds
  (banner, pricing-with-blocks, faq, contactForm) — catches accidental markup drift.
- **Path guard:** `assertWritablePath` rejects `templates/*`, `config/*`, `settings_data.json`,
  non-superapp `snippets/*`; accepts only `sections/superapp-*.liquid` (+ superapp assets).
- **Back-compat (the load-bearing test):** for the SAME `theme.section` spec,
  `mode:'app_block'` still yields a `themeModulePayload` and **no** `THEME_ASSET_*` op, and
  `publish.service` still writes the metaobject exactly as today. The app-block path is provably untouched.
- **Rollback:** upsert → delete round-trips; `.bak` copy restores prior body.
- **Job/async:** publish waits for `Job.done` before read-back; a `userErrors` response blocks and
  surfaces reasons (no "published" claim on failure — mirrors the existing `ModuleNotPublishableError` discipline).
- **032 templates:** every `theme.section` template renders a `validate_theme`-clean native section.

---

## 8. Risks + honest reversal note + gating limits

### 8.1 The gate that blocks shipping (be honest)
- **`write_themes` + Shopify exemption is mandatory and NOT held today.** Current scopes have only
  `read_themes`. Even after adding `write_themes`, `themeFilesUpsert` **fails without a Shopify-granted
  exemption**. The exemption request must argue the **page-builder** exception (BFS §3.2.2). **Until the
  exemption is granted, this feature cannot function on production stores** — build behind a flag
  (`THEME_NATIVE_SECTION_ENABLED`, default off) and keep the app-block path as the shipping default.
  This is the single biggest risk: it is a Shopify approval dependency, not just code.
- **Built-for-Shopify audit exposure.** Theme-file writes are audited at BFS review. Writing outside the
  `sections/superapp-*` allow-list, or auto-publishing, would jeopardize BFS status. The §3.4 allow-list
  and §3.6 no-auto-publish rules exist specifically to stay inside the exception.

### 8.2 The reversal, stated honestly
- The repo deliberately chose **no raw-Liquid codegen** and disabled `THEME_ASSET_UPSERT`
  (`publish.service.ts:107-109`; memories `store-aesthetic-section-generation`, `generic-theme-section`).
  The stated reason was that the app-block + metaobject + CSP/sanitizer path preserves the trust boundary
  without ever emitting Liquid files.
- **Why the new path is still safe:** we are not letting the model emit arbitrary Liquid. The native
  `.liquid` is assembled **deterministically by our compiler** from an already-validated, already-sanitized
  `theme.section` (same RecipeSpec validation, same HTML/CSS/JS sanitizer, same `compileThemeStyleCss`).
  The only new trust surface is "these deterministic bytes are written to a theme file," and that is fenced
  by: write only to a duplicated/unpublished theme by default (§3.1), a filename allow-list (§3.4),
  pre-write `validate_theme` (§3.2), backup+delete rollback (§3.5), merchant confirmation, and never
  auto-publishing (§3.6). So the reversal changes the **output medium**, not the **trust model**.

### 8.3 Other risks
- **Async job races** — must poll `Job.done` before read-back/verify; a naive fire-and-forget would
  report success before the write lands.
- **Behavioral display rules** (`ruleEngine`) can't be evaluated in a static section file — v1 warns
  and drops them (server-resolvable rules become `{% if %}` gates); don't silently ship a section that
  ignores its audience rules.
- **Rich block fields** (arrays like `features[]`) have no clean native setting type — v1 uses a
  delimited text setting; documented limitation for 032 authors.
- **Theme sprawl** — strategy A creates a duplicate theme per push; offer "reuse my SuperApp staging
  theme" and clean up abandoned duplicates.
- **Filename collisions** — namespacing by `moduleId` means a push only overwrites a *prior SuperApp
  push*; still back up first (§3.3).
- **50-file batch limit** — a multi-section blueprint push must chunk to ≤50 files/request.

---

## 9. Summary (the asks answered)

- **Verified API + scope:** `themeFilesUpsert(files:[OnlineStoreThemeFilesUpsertFileInput!]!, themeId:ID!)`
  with body `{type: TEXT|BASE64|URL, value}`; companions `themeFilesDelete`, `themeFilesCopy`,
  `themeDuplicate`, `themeCreate`/`themePublish`. Async (`job{id}`), **max 50 files/request**, API 2026-04
  (GA since 2024-10). **Requires `write_themes` AND a Shopify exemption** (BFS page-builder exception);
  repo currently holds only `read_themes`.
- **Safety model:** default to `themeDuplicate` → push to an UNPUBLISHED copy → merchant previews and
  publishes; live-theme push only behind typed confirmation; pre-write `validate_theme` + schema JSON check;
  filename allow-list (`sections/superapp-*.liquid` only); backup-before-overwrite; `themeFilesDelete`
  rollback; **never auto-publish**.
- **Target decision:** a **new deploy target (mode) on the existing `theme.section` type**, not a new
  RecipeSpec type — add `mode:'app_block'|'native_section'` to the `THEME` `DeployTarget` arm; the spec,
  templates, classifier, and preview are all unchanged.
- **Native-section template shape:** a self-contained `sections/superapp-<slug>.liquid` with a valid
  `{% schema %}` (`settings` ← `config.fieldSchema`/`title`, `blocks` ← `config.blocks[]` distinct kinds,
  `max_blocks: 50`, `presets` ← authored blocks/fields), a scoped `{%- style -%}` block from `style.*`, and
  a `layout` select for the variant. 032's `config.blocks[]` maps 1:1 to native reorderable blocks — no new
  template shape, just a slug-safe-`kind` + typed-block-fields lint.
- **Biggest risk:** the **`write_themes` + Shopify exemption dependency** — it is an external approval
  gate (not code), it's not held today, and without it the feature is inert. Ship it flag-gated with the
  app-block path as the default, and pursue the exemption under the page-builder exception.
