# Shopify Search & Discovery

> Status: LIVE / active — not deprecated, renamed, or merged. First-party Shopify app, launched 2022-07-25, still maintained and receiving reviews as of mid-2026. This is the primary study target; no vendor-equivalent substitution was needed.

## identity
- **name**: Shopify Search & Discovery (confirmed)
- **vendor**: Shopify (first-party) (confirmed)
- **category**: Store design → Search and filters / "Search and navigation" (confirmed)
- **App Store URL**: https://apps.shopify.com/search-and-discovery (confirmed)
- **rating**: 3.0 / 5 on the App Store listing (confirmed). Aggregators diverge: Reputon reports 4.6/1,146; StoreInspect reports 3.4/462. The listing's own current number is 3.0. (confirmed the divergence)
- **review count**: 477 reviews on the App Store listing (confirmed)
- **install signal**: No public install count shown (Shopify hides these), but it is one of the most widely deployed search apps because it is free + first-party and is the de-facto replacement for the legacy filtering built into Online Store 2.0. "Widely installed / category default" (inferred from first-party + free + review volume)
- **pricing model**: Free (confirmed). No paid tiers, no usage metering.

## surfaces
Maps onto our internal extension-type vocabulary as a genuinely multi-surface app. It splits into (a) an **admin configuration app** (embedded), (b) **storefront theme app extension blocks**, and (c) **native storefront-rendering behavior** that Shopify's own search/collection routes honor without any block.

- **admin.block** (confirmed): The whole configuration UI is an embedded admin app with tabs — Filters, Search (Synonyms / Product boosts / Search settings), Product recommendations, Analytics. This is where merchants author all rules. It is the primary "settings surface."
- **admin.action** (inferred): Product recommendations and boosts can also be edited per-product via metafields / the bulk editor ("Search product boosts" metafield, related/complementary product metafields) — an admin-context editing entry point rather than a standalone action, but conceptually an in-context admin edit.
- **theme.section** / theme block (confirmed): Storefront rendering happens through **theme app extension blocks** added in the theme editor:
  - **Complementary products** block — added to the Product Information section via "+ Add block → Complementary products." Renders a "Pair with / Buy it with" slider on the product page.
  - **Product grid → "Enable sidebar filter"** — filters render inside the theme's collection/search Product grid section; the app supplies the filter data via the Liquid filter API, the theme renders it. (So the filter UI is theme-owned; the app owns the data.)
  - Related-products recommendations plug into the theme's existing "you may also like" recommendation slot (via the Product Recommendations API).
- **analytics.pixel** (inferred): The app's search/recommendation click-rate and purchase-rate reports imply storefront event capture (search impressions, clicks, downstream purchase attribution). Requires **Shopify Network Intelligence** enabled in privacy settings — i.e. it depends on Shopify's first-party behavioral pixel, not a merchant-configurable pixel. (confirmed dependency; pixel mechanism inferred)
- Explicitly NOT used: functions.cartTransform, functions.discountRules, deliveryCustomization, paymentCustomization, checkout.upsell, checkout.block, postPurchase.offer, pos.extension, customerAccount.blocks, flow.automation. This app never touches checkout, cart pricing, or automation.

**How surfaces coordinate (shared state / handoff):** The admin app is the single source of truth. Merchants author filters, synonyms, boosts, and per-product recommendation overrides in **admin.block**; these persist server-side against Shopify's search index and product metafields. The **storefront theme blocks** are thin renderers — they read that authored state at request time through Shopify's Liquid filter API / Product Recommendations API and render inside theme-owned sections. There is no client-side handoff; coordination is "author in admin → index/metafields → storefront read." The **analytics** surface closes the loop: storefront interactions feed reports back in the admin, but there is no automatic write-back (no auto-tuning of boosts from analytics — the merchant reads and re-authors manually).

## functional_model
Core entities the app manages and their relationships:

- **filter** = { source_type: enum(availability | price | category | product_type | tags | vendor | product_option | product_metafield | category_metafield | variant_metafield | standard_product_attribute), label: text, values: FilterValue[], sort: enum(automatic | manual | magic), logic: enum(OR | AND), empty_value_policy: enum(hide | show_end | default_order), visual_style?: enum(text | swatch | image) } — each source usable once per store; store cap 25 filters. (confirmed)
- **filter_value** = { raw_value, display_label, group_ref?, swatch_or_image_ref? } — up to 1,000 values per filter in-app / 100 rendered on storefront; groupable. (confirmed)
- **filter_group** = { name, member_values[≤200] } — up to 1,000 groups store-wide; merges synonymous raw values (e.g. blue/light blue/dark blue → "Blue"). (confirmed)
- **synonym_group** = { title (organizational), terms[≤20, each ≤5 words] } — bidirectional equivalence; ≤1,000 groups store-wide; each term unique store-wide. (confirmed)
- **product_boost** = { products[], search_terms[≤10 authored, up to 100 triggering], effect: rank-up } — only applies while product is available for sale; sold-out boosted products fall to the end. (confirmed)
- **recommendation_set** (per anchor product) = { product_ref, complementary_products[≤10, ordered], related_products[≤10, ordered], mode: enum(custom_only | custom_plus_auto) } — custom overrides/augments Shopify's auto recommendations (purchase co-occurrence, description similarity [EN only], related collections). (confirmed)
- **search_result_config** = { search_result_types: subset(products, pages, blog_posts), predictive_result_types: subset(query, products, collections, pages, blog_posts), out_of_stock_policy: enum(display | hidden | placed_last), combined_listings_display: enum(child_only | parent_only | both) } — store-level singleton. (confirmed)
- **analytics_report** = read-only rollups over a fixed 30-day window (see data_model). (confirmed)

Relationships: filters and boosts operate against the **search/collection index**; synonyms rewrite the query before matching; recommendation_sets attach to a product and are rendered by the complementary/related theme blocks; analytics observes all of the above but does not mutate them.

## settings_taxonomy
The actual merchant-facing controls, grouped under the five headings. (confirmed unless marked)

### content
- **Filter label** — text (rename customer-facing label without changing source). (confirmed)
- **Filter value display label** — text per value (rename an individual value). (confirmed)
- **Filter value grouping** — multi-select checkboxes → merge N raw values into one displayed value; group name = text. (confirmed)
- **Synonym group → Terms** — repeated text input (add term → chip), ≤20 terms, ≤5 words each. (confirmed)
- **Synonym group → Title** — text (organizational only). (confirmed)
- **Product boost → Search terms** — repeated text input, ≤10 authored terms. (confirmed)
- **Product recommendations → Complementary products** — product-picker (multi, ordered, ≤10). (confirmed)
- **Product recommendations → Related products** — product-picker (multi, ordered, ≤10). (confirmed)
- **Complementary block → Heading** — text; **"text before product names"** — text (e.g. "Pair with", "Buy it with"). (confirmed, theme block)

### style
(These live in the **theme editor** on the complementary-products block, not the admin app — but they are merchant-facing knobs the app's block exposes.)
- **Products per slider page** — number/select (1–4). (confirmed)
- **Maximum products shown** — number (1–10). (confirmed)
- **Pagination style** — select[dots | counter | numbers]. (confirmed)
- **Image ratio** — select[portrait | square]. (confirmed)
- **Collapsible row** — toggle. (confirmed)
- **Quick add button** — toggle. (confirmed)
- **Filter value visual style** — select[text | swatch | image] (swatch/image require a metaobject with color/file field + storefront access). (confirmed)
- **Layout / heading** of the recommendation block — theme-dependent text/select. (confirmed)

### targeting
- **Filter source** — select from the enumerated source types (Category / Product / Variant metafield, product option, price, availability, tags, type, vendor, standard attribute). One source per store. (confirmed)
- **Product boost → Products** — product-picker (which products the boost applies to). (confirmed)
- **Product boost → Search terms** — the query terms that trigger the boost (targeting rule keyed on query). (confirmed)
- **Recommendation anchor** — product-picker (which product this recommendation_set attaches to). (confirmed)
- **Search terms → product** relationship is effectively a lightweight per-query merchandising rule. (confirmed)

### behavior
- **Filter logic** — select[OR (default) | AND] (AND only available for product tag, metafield list, metaobject reference list filters). (confirmed)
- **Filter value sort** — select[Automatic (asc alpha/numeric) | Manual (drag, Move to top / Move to bottom) | "Reorder for me" (Shopify Magic)]. (confirmed)
- **Empty values** — select[Hide | Show at end | Show in default order]. (confirmed)
- **Search results content types** — multi-select[Products | Pages | Blog posts]. (confirmed)
- **Predictive (instant) search content types** — multi-select[Query | Products | Collections | Pages | Blog posts]. (confirmed)
- **Out-of-stock products** — select[Display | Hidden | Placed last (default)]. (confirmed)
- **Combined listings display** — select[Only child products | Only parent products | Show both]. (confirmed)
- **Recommendation mode** — select[custom only | custom + auto-generated]. (confirmed)
- **Standard-attribute grouping** — select[Automatic (group around taxonomy base value) | Manual]. (confirmed)
- Typo tolerance + predictive-search-as-you-type are on by default and NOT merchant-toggleable in this app (Shopify-native behavior). (confirmed)

### data
- **Filter source binding** — which product/variant/category metafield or product option feeds a filter (structural data binding). (confirmed)
- **Bulk edit via metafields** — boosts and recommendations editable through standard metafields ("Search product boosts", related/complementary product metafields) in the bulk editor. (confirmed)
- **Metaobject reference** — swatch/image filters bind a filter value to a metaobject entry (color/file field). (confirmed)
- **Shopify Network Intelligence** — privacy-settings dependency required for analytics/personalized recommendation data. (confirmed)
- No merchant-managed connection strings, API keys, or external data sources — everything binds to native Shopify product data + Shopify's index. (confirmed)

## data_model
What it persists and where:
- **Search index** (Shopify-hosted, opaque): synonyms, boosts, and result-type config are applied server-side to Shopify's storefront search index. Not a merchant-visible table. (inferred — Shopify does not expose the store)
- **Product metafields** (native Shopify): related-products and complementary-products lists persist as standard product metafields; product boosts persist via a "Search product boosts" metafield. This is why they are bulk-editable. (confirmed)
- **Metaobjects** (native Shopify): swatch/image filter values reference metaobject definitions (color or file fields) with storefront access enabled. (confirmed)
- **App/config storage** (Shopify-hosted app DB): filter definitions, labels, grouping, sort order, logic, empty-value policy, synonym groups, and search settings persist in the app's own backing store keyed to the shop. (inferred — mechanism opaque, behavior confirmed)
- **Analytics rollups**: read-only aggregates over a rolling **30-day** window (click rate, purchase rate, searches by query, no-results, no-clicks, recommendation low-engagement). Backed by Shopify's behavioral data pipeline gated behind Network Intelligence. (confirmed window; storage inferred)
- **Media/CDN**: swatch/image assets served from Shopify CDN via metaobject file fields. No app-managed media store. (confirmed)
- No external DB, no merchant-supplied codes/keys. (confirmed)

## visual_patterns
- **Admin (authoring) archetype**: Polaris resource-list + form pattern. Tabs (Filters | Search | Recommendations | Analytics). Filter editor = list of filters with drag reorder, per-filter detail page (label field, value list with drag/"Move to top/bottom", group checkboxes, logic radio, empty-value select). Synonyms = chip-input groups. Boosts = product-picker + tag-style term chips. Recommendations = per-product picker with ordered thumbnails (≤10). (confirmed pattern)
- **Storefront filter archetype**: collapsible left sidebar (or drawer on mobile) of accordion filter groups; each value a checkbox, optionally rendered as color swatch or image tile; selected values shown as removable chips above the grid; result count updates on selection. Preset Availability + Price (range/slider) filters always present. (confirmed structure; exact chrome is theme-owned)
- **Complementary-products archetype**: horizontal slider/carousel in the product info section, heading + "Pair with / Buy it with" lead-in, product cards with image (portrait/square), pagination as dots/counter/numbers, optional quick-add button, optional collapsible row. (confirmed)
- **Predictive/instant search archetype**: type-ahead dropdown under the search bar showing grouped sections (queries, products with thumbnails, collections, pages, articles) per the enabled content types. (confirmed content; chrome theme-owned)
- **Component states**: filter value empty/hidden/end states; sold-out products demoted to end; boosted products lifted to top (but only when available); recommendation items filtered out when inactive/out-of-stock/in-cart/gift-card. (confirmed)
- **Motion/interaction**: as-you-type predictive updates, slider swipe/paginate, filter accordion expand/collapse, chip add/remove. No app-defined animation system (rides theme motion). (inferred)

## reviews_signal
Rating distribution (App Store, 477 reviews): 5★ 53%, 4★ 12%, 3★ 9%, 2★ 7%, 1★ 19% — bimodal (loved or hated). (confirmed)

**Top praises:**
1. Free + first-party foundational tool; "game-changer," relied on for years with minimal issues. (confirmed)
2. Restores tag/attribute filtering that OS 2.0 stripped from native nav — fills a real gap. (confirmed)
3. Synonyms + boosts give real merchandising control without a paid app. (confirmed)
4. Complementary/related product blocks are an easy, no-code upsell surface. (confirmed)
5. Analytics (no-results / no-clicks searches) is genuinely useful for finding catalog gaps. (inferred from doc emphasis + positive reviews)

**Top complaints:**
1. **Search relevance regressions** — as of mid-2026 multiple merchants report it stopped matching SKUs, product descriptions, and keywords; "customers can not literally search for product. THIS IS THE MAIN FUNCTION." AI-rewrite blamed. (confirmed)
2. **25-filter store cap** — called a "bait-and-switch," unusable for medium/large catalogs with many attributes (size/brand/fitment/vehicle). (confirmed)
3. **~5,000-product-per-collection filter ceiling** — over the limit, filters reportedly vanish entirely on that collection. (confirmed)
4. **Archived/hidden/wholesale product leakage** — archived products can't be excluded from recommendation pickers; hidden/wholesale items surfacing in recommendations (a safety concern). (confirmed)
5. **Learning curve + no auto-tuning** — merchants must manually author boosts/synonyms; analytics doesn't feed back into ranking. (inferred)

## mapping_note
Onto our constrained RecipeSpec vocabulary, this decomposes into several module-shaped pieces: a filter/facet config (targeting a `theme.section` product-grid render), a predictive-search config, a merchandising-rules object (synonyms + boosts), and a recommendations block (`theme.section` complementary/related) with analytics (`analytics.pixel`). Each individually is expressible as a single recipe with a settings_taxonomy close to what we already model.

Where it **EXCEEDS a single-module recipe:**
1. **Persistent store + long-lived authored records at scale.** Filters, synonym groups, boosts, and per-product recommendation sets are durable multi-entity data (25 filters × ≤1,000 values × ≤1,000 groups; ≤1,000 synonym groups; per-product recommendation overrides across the whole catalog). This is a backing data store the merchant curates over time, not a one-shot module config — a recipe would need a companion data-model / metaobject provisioning story.
2. **A query-time rule engine over Shopify's search index.** Synonym rewriting, per-query product boosts (query→product targeting), OR/AND filter logic, and out-of-stock demotion are ranking/merchandising rules evaluated per request against an index we don't own — a rule-engine + external side-effect (index mutation) that a static module spec can't capture.
3. **Cross-surface blueprint with author→index/metafield→storefront handoff.** One coherent feature spans admin authoring, metafield/metaobject persistence, multiple theme-app-extension render blocks, and behavioral analytics — a coordinated multi-surface blueprint, not a lone theme section.
4. **A behavioral analytics pipeline (pixel + 30-day rollups) gated on Network Intelligence.** Search/recommendation click- and purchase-rate attribution requires storefront event capture and aggregation — background data collection and an external dependency (Shopify Network Intelligence), well beyond a self-contained recipe.
