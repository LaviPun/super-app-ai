# Module Catalog

## Three files, one purpose

The catalog lives in `packages/core/src/` and is split across three files for separation of concerns:

| File | Role |
|---|---|
| `catalog.generator.ts` | Build script: expands the Allowed Values Manifest axes into typed catalog entries. Owns `MODULE_TYPE_TO_TEMPLATE_KIND` (canonical templateKind per module type), tags, families, and the deterministic ordering policy. |
| `catalog.generated.json` | Snapshot output of the generator. Committed to the repo so consumers don't pay generation cost at runtime. Format: one JSON entry per line for small diffs. |
| `catalog.ts` | Runtime API: typed `MODULE_CATALOG`, `findCatalogEntry`, `findTypeEntry`, `filterCatalog`, plus re-exports of generator constants (`CATALOG_FAMILIES`, `MODULE_TYPE_TO_TEMPLATE_KIND`). |

To regenerate the snapshot after changing the manifest:

```bash
pnpm --filter @superapp/core build
node packages/core/dist/catalog.generator.js
```

The generator is **strict by default**: it throws if total entries would exceed the cap (`DEFAULT_MAX_ENTRIES = 12000`), so silent truncation cannot ship.

## Generated catalog (~6.5k entries today)

Current snapshot size is driven by the Allowed Values Manifest:

- **type.\*** rows: one per `RECIPE_SPEC_TYPES` entry (currently 26). Canonical row for every module type, with the right `templateKind`, `requires`, surface, tags.
- **storefront.\*** base rows: `CATALOG_SURFACES × CATALOG_COMPONENTS × CATALOG_INTENTS` (currently 12 × 14 × 10 = 1,680).
- **storefront.\*.trigger.\*** rows: `CATALOG_SURFACES × CATALOG_INTENTS × CATALOG_TRIGGERS × {popup, modal, drawer, toast}` (currently 12 × 10 × 10 × 4 = 4,800).

Every entry includes:

- `catalogId`, `family` (`'type'` or `'storefront'`), `category`, `requires`, `description`, `tags`.
- Optional discriminators: `moduleType`, `templateKind`, `surface`, `intent`, `trigger`.
- `defaults` bag for downstream pre-fills.

### Why generated

Instead of hand-writing thousands of templates, we define **axes** (surface, intent, trigger, component, type) in `allowed-values.ts` and generate combinations. Adding a new module type or trigger is a single-line manifest change followed by a regeneration.

### Template ID format

```
type.<moduleType>                                        # canonical per-type row
storefront.<component>.<intent>.<surface>                # base storefront row
storefront.<component>.<intent>.<surface>.trigger.<trg>  # storefront row with explicit trigger
```

Examples:
- `type.theme.popup`
- `storefront.popup.capture.product`
- `storefront.popup.capture.product.trigger.exit_intent`

### Filtering

Use `filterCatalog({ family, category, moduleType, templateKind, surface, intent, trigger, tags })`. All fields are exact-match; `tags` requires every listed tag to be present on the entry.

### UI performance

The admin UI should not load all templates into memory at once. The `/api/catalog/search` route does server-side pagination + text search; only fetch what the merchant needs.

---

## Curated module templates (144 ready-to-use)

In addition to the generated catalog IDs, the app ships **144 curated templates** (IDs UAO-001 through ORT-142) with complete `RecipeSpec` JSON, split across four files in `packages/core/src/`. These are available to merchants via the "From Template" tab on the Home page.

### How it works
1. `MODULE_TEMPLATES` array is assembled from four part files: `_templates_part1.ts` (UAO, DAP, BCT, CUX), `_templates_part2.ts` (CHK, TYO, ACC, SHP), `_templates_part3.ts` (PAY, TRU, SUP), `_templates_part4.ts` (LOY, ANA, OPS + coverage extras).
2. Each entry includes: `id`, `name`, `description`, `category`, `tags`, and a full `spec` (RecipeSpec).
3. `POST /api/modules/from-template` accepts `{ templateId }`, looks up the template, enforces quota, and creates a draft module.

### Template structure: 14 categories × 9 + 16 extras = 144
| Category prefix | Category name | Count |
|---|---|---|
| UAO | Upsell & AOV | 9 |
| DAP | Discounts & Pricing | 9 |
| BCT | Bundles & Cart Transform | 9 |
| CUX | Cart UX & Conversion | 9 |
| CHK | Checkout UX Plus | 9 |
| TYO | Thank you & Order status | 9 |
| ACC | Customer account | 9 |
| SHP | Shipping & Delivery | 9 |
| PAY | Payments & COD | 9 |
| TRU | Trust & Messaging | 9 |
| SUP | Support & Returns | 9 |
| LOY | Loyalty & Referrals | 9 |
| ANA | Analytics & Attribution | 9 |
| OPS | Automation & Ops | 9 |
| EFF/PRX/PPO/CKU/INT/VAL/FUL/ORT | Coverage extras (IDs 127–142) | 16 |

All 26 RecipeSpec types are covered. Template validity is enforced by automated tests against `RecipeSpecSchema`.

### Adding a new template
1. Append a `TemplateEntry` to `MODULE_TEMPLATES` in the appropriate `packages/core/src/_templates_partN.ts` file.
2. Ensure the `spec` is a valid `RecipeSpec` (Zod-validated at build).
3. Rebuild core: `pnpm --filter @superapp/core build`.

---

## AI retry context (catalog details)

When the AI generate flow retries after a validation failure, it requests **catalog details** filtered by module type to give the model relevant examples. `apps/web/app/services/ai/catalog-details.server.ts` no longer maintains a local module-type → templateKind table; it imports `MODULE_TYPE_TO_TEMPLATE_KIND` directly from `@superapp/core` so the AI mapping cannot drift from the generator.

This means: every `RECIPE_SPEC_TYPES` entry has a guaranteed `type.<moduleType>` catalog row with a deterministic `templateKind` (`banner`, `popup`, `notification_bar`, `effect`, `floating_widget`, `widget`, `discount_rules`, `cart_transform`, `upsell`, `flow_automation`, etc.). Adding a new module type and its templateKind in `catalog.generator.ts` automatically lights up AI inspiration for that type — no separate mapping table to keep in sync.

---

See also: [`docs/superapp-surface-inventory.md`](/Users/lavipun/Work/ai-shopify-superapp/docs/superapp-surface-inventory.md) for the full surface/capability inventory, operational boundaries, and PASS/GAP audit matrix.

---

## Next expansions
Add more axes (industries, compliance regimes, theme families) to the generated catalog to reach 50k+ template IDs.
Expand curated templates to cover more use cases (B2B, subscriptions, loyalty programs).
