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

## Curated module templates (12 ready-to-use)

In addition to the generated catalog IDs, the app ships **12 curated templates** with complete `RecipeSpec` JSON in `packages/core/src/templates.ts`. These are available to merchants via the "From Template" tab on the Home page.

### How it works
1. `MODULE_TEMPLATES` array in `packages/core/src/templates.ts` holds `TemplateEntry` objects.
2. Each entry includes: `id`, `name`, `description`, `category`, `tags`, and a full `spec` (RecipeSpec).
3. `POST /api/modules/from-template` accepts `{ templateId }`, looks up the template, enforces quota, and creates a draft module.

### Current templates
| Category | Templates |
|---|---|
| STOREFRONT_UI | Promotional Banner, Exit Intent Popup, Free Shipping Bar, Styled Proxy Widget |
| FUNCTION | VIP Customer Discount, Free Shipping Threshold, Block PO Box Addresses |
| INTEGRATION | ERP Order Sync |
| FLOW | Tag Customer on Order, Low Stock Alert |
| CUSTOMER_ACCOUNT | Customer Profile Block |
| ADMIN_UI | Extension Blueprint |

### Adding a new template
1. Append a `TemplateEntry` to `MODULE_TEMPLATES` in `packages/core/src/templates.ts`.
2. Ensure the `spec` is a valid `RecipeSpec` (Zod-validated at build).
3. Rebuild core: `pnpm --filter @superapp/core build`.

---

## Next expansions
Add more axes (industries, compliance regimes, theme families) to the generated catalog to reach 50k+ template IDs.
Expand curated templates to cover more use cases (B2B, subscriptions, loyalty programs).
