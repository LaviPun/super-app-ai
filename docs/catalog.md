# Module Catalog (Day-1) — 12000 templates

The project ships a **generated catalog** (`packages/core/src/catalog.generated.json`) with ~12000 templates.
This covers storefront UI, admin UI, function rules, integrations, and automations.

## Why generated
Instead of hand-writing thousands of templates, we define **axes** (surface, intent, trigger, etc.) and generate combinations.

## Template ID format
Examples:
- `storefront.popup.capture.product.trigger.exit_intent`
- `storefront.search_facets.performance.search_results`
- `admin.analytics.dashboard.anomaly_detection`
- `function.payment_customization.country.hide_method`
- `integration.ai_enrichment.order_paid.two_way`
- `flow.order_paid.enrich_with_ai.advanced`

## UI performance
The admin UI should not load all templates into memory at once.
Add server-side pagination + search endpoints; only fetch what the merchant needs.

## Next expansions
Add more axes (industries, compliance regimes, theme families) to reach 50k+ templates if desired.
