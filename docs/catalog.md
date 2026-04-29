# Module Catalog

## Generated catalog (12,000 IDs)

The project ships a **generated catalog** (`packages/core/src/catalog.generated.json`) with ~12,000 template IDs.
This covers storefront UI, admin UI, function rules, integrations, and automations.

### Why generated
Instead of hand-writing thousands of templates, we define **axes** (surface, intent, trigger, etc.) and generate combinations.

### Template ID format
Examples:
- `storefront.popup.capture.product.trigger.exit_intent`
- `storefront.search_facets.performance.search_results`
- `admin.analytics.dashboard.anomaly_detection`
- `function.payment_customization.country.hide_method`
- `integration.ai_enrichment.order_paid.two_way`
- `flow.order_paid.enrich_with_ai.advanced`

### UI performance
The admin UI should not load all templates into memory at once.
Add server-side pagination + search endpoints; only fetch what the merchant needs.

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

All 23 RecipeSpec types are covered. All templates validate against RecipeSpecSchema. All 83 tests pass.

### Adding a new template
1. Append a `TemplateEntry` to `MODULE_TEMPLATES` in the appropriate `packages/core/src/_templates_partN.ts` file.
2. Ensure the `spec` is a valid `RecipeSpec` (Zod-validated at build).
3. Rebuild core: `pnpm --filter @superapp/core build`.

---

## AI retry context (catalog details)

When the AI generate flow retries after a validation failure, it requests **catalog details** filtered by module type to give the model relevant examples. The mapping from module type to catalog filter is in `apps/web/app/services/ai/catalog-details.server.ts`:

| Module type    | templateKind (for filter) | Notes |
|----------------|---------------------------|--------|
| theme.banner   | banner                    | |
| theme.popup    | popup                     | |
| theme.notificationBar | notification_bar | |
| proxy.widget   | quick_view (or widget)    | Planned: use `widget` when catalog entries use that templateKind |
| theme.effect   | *(none today)*            | **Planned:** Add `effect`; ensure `catalog.generated.json` / generator includes effect templateKind so effect prompts get relevant examples. See [implementation-status.md](./implementation-status.md) § “AI Patch Plan — Remove Generic Outputs”. |

Keeping this mapping in sync with the catalog generator and with intent/routing (e.g. `utility.effect`, `utility.floating_widget`) ensures retries and low-confidence prompts receive the right inspiration and reduces generic fallback outputs.

---

## Next expansions
Add more axes (industries, compliance regimes, theme families) to the generated catalog to reach 50k+ template IDs.
Expand curated templates to cover more use cases (B2B, subscriptions, loyalty programs).
