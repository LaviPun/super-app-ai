# Boost AI Search & Filter

> Vocabulary research record. Facts labeled **confirmed** (from App Store listing / vendor support docs) or **(inferred)** (deduced, not directly stated). Sources: Shopify App Store listing + reviews, Boost `support.boostcommerce.net` help center, `boostcommerce.net` marketing pages.

## identity
- **name**: Boost AI Search & Filter — confirmed. Vendor also markets it as "Boost AI Search & Discovery." Formerly "Product Filter & Search" / "Boost PFS." **confirmed** (renamed; same app slug `product-filter-search`, no deprecation — the Bold-app confusion in the brief does not apply here; this is Boost Commerce, not Bold).
- **vendor**: Boost Commerce — confirmed.
- **category**: Search and Filters (Store design → Search and navigation) — confirmed.
- **App Store URL**: https://apps.shopify.com/product-filter-search — confirmed.
- **rating**: 4.7 / 5 — confirmed.
- **review count**: ~1,588 reviews — confirmed (drifts over time).
- **install signal**: unknown exact install count (Shopify hides it). Signal: launched 2017-01-17, long-tenured merchants (4–6 yr) in reviews, positioned as a top-3 enterprise search/filter app — established, high-volume install base **(inferred)**.
- **pricing model**: Tiered monthly subscription, tier caps scale with store GMV; 21-day free trial. Named tiers **confirmed**: Launch $29/mo (5 filter trees, 10 campaigns, 3x daily sync), Convert $299/mo (20 filter trees, 40 campaigns, 7x daily sync), Accelerate $699/mo (unlimited filter trees, 365-day reports). Higher GMV bands push effective price up to ~$599–$1,499/mo **confirmed** (per listing GMV-scaled caps).

## surfaces
Boost is inherently **multi-surface** and coordinates through a shared, app-owned search/filter index synced from the Shopify catalog (not a single theme block).

- **theme.section** — confirmed. Core rendering surface. Boost injects storefront widgets via **theme app blocks / app embed** into the theme: (1) the **Instant Search Widget** (predictive dropdown attached to the theme search bar), (2) the **Filter tree + Product list** widget that takes over collection pages and the search-results page, (3) **Recommendation / Bestseller / Bundle** widgets on product and other pages. Shows: search box, autocomplete dropdown, faceted filter sidebar, sorted/paginated product grid, recommendation carousels.
- **proxy.widget** — confirmed **(inferred as the mechanism)**. Search results, autocomplete, and filtering are served from Boost's hosted search API (app-side index), rendered client-side into the theme — i.e. a hosted widget backed by an external service rather than native Shopify Storefront filtering. Coordinates with theme.section by hydrating the injected blocks.
- **admin.block / admin.action** — confirmed. Full embedded admin app (Filters, Search, Merchandising, Recommendations, Analytics dashboards) where merchants build filter trees, campaigns, synonyms, and read analytics. This is the configuration console, not a storefront surface.
- **analytics.pixel** — **(inferred)**. Captures on-storefront search queries, filter usage, clicks, no-result searches, and conversion events to feed the analytics dashboard and personalization — behaves like a first-party analytics/event collector.
- **flow.automation** — not a native surface, but scheduled **background sync jobs** (3x–7x daily per tier) and **scheduled merchandising campaigns** (date-range activation/expiry) give it flow-like automation **confirmed** (sync cadence + campaign scheduling are documented).
- Not applicable / not used: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.upsell, checkout.block, postPurchase.offer, pos.extension, customerAccount.blocks — no evidence Boost renders in checkout, POS, or customer accounts. (Listing mentions checkout/admin/Klaviyo *integrations*, but the product surface is storefront search/discovery.) **(inferred, absence of evidence.)**

**Coordination**: One shared app-owned index is the source of truth. The admin app writes config (filter trees, campaign rules, synonyms, suggestion dictionary) → sync jobs pull the Shopify catalog into the index → storefront widgets (instant search, filter/product-list, recommendations) all read the same indexed data + rules, so a merchandising "Pin" rule affects both the Instant Search Widget AND the Search Results page consistently. **confirmed** (docs state pin/boost rules apply across instant-search widget and results page).

## functional_model
Core entities (concrete shapes, field names from docs; types **(inferred)** where not stated):

- **FilterTree** = { name, appliesTo: (collection[] | search-results | default), filterOptions: FilterOption[], displaySettings } — confirmed. Different trees can be assigned per collection or to search results; tier-capped count (5 / 20 / unlimited).
- **FilterOption** = { optionLabel, sourceType: (tag | metafield | variant-option/title | color | size | height | collection | product-type | vendor | stockStatus | price), optionDisplay: (list | box | swatch | range | same-level-collection | multi-level-collection), optionSelect: (single | multiple), values: (auto | manual[]), advanced: {...} } — confirmed.
- **FilterValue** = { rawValue, displayLabel (renamable), swatchImage|colorCode, mergedFrom: value[], excluded: bool, sortRank } — confirmed (merge/reorder/rename/exclude/custom-swatch all documented).
- **MerchandisingRule (Campaign)** = { name, scope: (specific-search-queries | all-queries) | collection, schedule: {start,end}?, market?, strategies: Strategy[] } — confirmed.
- **Strategy** = one of Pin | Boost | Demote | Hide | Filter | Banner, each with its own config. Pin = manual product list (≤20, positions 1–20) + `mustMatchQuery` toggle. Boost/Demote = up to 3 condition-sets × 3 product attributes. Hide = up to 7 condition-sets. Filter = up to 5 sets × 3 attrs. Banner (V3+) = { image, redirectUrl, position 1–6 }. Applied in fixed priority Hide > Banner > Pin > Filter > Demote > Boost. **confirmed.**
- **Synonym group** = { terms: string[] } (bidirectional term equivalence) — confirmed.
- **Stopword** = filler term ignored at match time — confirmed.
- **Redirect** = { query → destinationUrl } — confirmed.
- **SuggestionDictionary entry** = { term, rank } for custom autocomplete ranking — confirmed.
- **InstantSearchWidget config** = { components: [PopularSuggestions, ProductSuggestions, Collections, Pages, TrendingSearches, TrendingItems], perComponent: { enabled, label, maxResults 1–10, order }, noResultBehavior } — confirmed.
- **Recommendation/Bundle** = { type: (predictive-bundle | related | recently-viewed | bestseller/AI), IF/THEN rules, placement } — confirmed (bundles render in instant search, results, and product pages).
- **AnalyticsRecord** = aggregates of { topProducts, popularFilters, topQueries, noResultQueries, conversion } — confirmed.

## settings_taxonomy
The actual merchant-facing controls, grouped. Field names from Boost docs unless marked **(inferred)**.

### content (what data/text is shown)
- Filter option **Option label** — text — confirmed.
- Filter **value rename / display label** — text (per value) — confirmed.
- Filter **merge values** (combine multiple raw values into one) — rule/multi-select — confirmed.
- Filter **excluded values** — multi-select — confirmed.
- **Custom swatch image upload** per value — image — confirmed.
- **Swatch color code** per value — color — confirmed.
- **Tooltip text** per filter option — text/toggle ("Display tooltip") — confirmed.
- Instant search **component label** rename (e.g. "Popular Suggestions") — text — confirmed.
- Instant search **max results** per component — number (1–10) — confirmed.
- **No-result message** text + curated fallback terms/products/trending items — text + product-picker — confirmed.
- **Synonym groups** — text (comma/term list) — confirmed.
- **Stop words** — text list — confirmed.
- **Search redirects** (query → URL) — text pair — confirmed.
- **Suggestion dictionary** (term + rank) — text + number — confirmed.
- Product card fields shown in results (vendor, price, sale price, SKU, image) — toggles — confirmed.
- **Banner** image + redirect URL (merchandising) — image + text — confirmed.

### style (visual appearance)
- **Option display type**: select[ list | box | swatch | range slider | color | same-level collection | multi-level collection ] — confirmed.
- **Swatch style**: select[ grid view | list view ] — confirmed.
- **Display all values in uppercase** — toggle — confirmed.
- **Filter layout**: select[ vertical sidebar | horizontal | off-canvas/drawer ] — confirmed.
- **Product grid columns** — number/select **(inferred; standard for the widget)**.
- Typography / **font size / color** for filter tree — color + number/select — confirmed (marketing: "customizable styling: typography, font size, color").
- **Show product count** in parentheses — toggle — confirmed.
- **Show 'Refine by' block** (selected filters chips) — toggle — confirmed.
- **Show loading icon when filtering** — toggle — confirmed.
- **Show scroll-to-top button** — toggle — confirmed.
- **Custom CSS** — text/code — confirmed (listing: custom CSS styling).
- **Clear cache of swatch images** — action button — confirmed.

### targeting (who / which context sees it)
- **Filter tree → collection assignment** (which tree renders on which collection / on search) — select/rule — confirmed.
- **Merchandising rule scope**: select[ specific search queries | all queries ] (+ collection-page rules) — confirmed.
- **Market targeting** on rules — select (multi-market) — confirmed.
- **Schedule / date range** on campaigns (start–end, auto-expire) — date range — confirmed.
- **A/B test** on merchandising campaigns — toggle/action — confirmed.
- Boost/Demote/Hide/Filter **conditions** (product attribute = tag / type / vendor / price / inventory / on-sale …) — rule-builder (condition-sets × attributes) — confirmed. (Metafield attrs currently NOT supported in rule conditions — confirmed limitation.)
- Recommendation **IF/THEN rules** (context-based pinning/prioritizing by reviews/ratings) — rule-builder — confirmed.

### behavior (interaction logic)
- **Option select**: select[ single | multiple ] — confirmed.
- **Use AND condition** (tags only) — toggle — confirmed.
- **Sort type** of filter values: select[ Alphabetical | Product Number ] — confirmed.
- **Sort manual value** (drag-order override) — ordering — confirmed.
- **Show more type**: select[ Scrollbar | Display all values | View more | View more with Scrollbar ] — confirmed.
- **Collapse on PC / Mobile** — toggle (per platform) — confirmed.
- **Show search box on PC / Mobile** (within a filter option) — toggle — confirmed.
- **Keep filter options collapsed status after filtering** — toggle — confirmed.
- **Hide filter options with only one value** — toggle — confirmed.
- **Show all irrelevant values (product count = 0)** — toggle — confirmed.
- **Shorten URL when selecting multiple values** — toggle — confirmed.
- **Use canonical URLs for product pages** — toggle (SEO) — confirmed.
- **Out-of-stock display options** — select — confirmed.
- **Sort available products first** — toggle — confirmed.
- **Show matched variant image by filter option** — toggle/select — confirmed.
- **Pagination type**: select[ Pagination (numbered) | Infinite loading | Load more ] — confirmed.
- **Default sort order** of product list (9 options: title, price asc/desc, created date, relevance/best-match, bestseller, …) — select + drag-order — confirmed.
- **Instant search component order** (drag & drop) + enable/disable per component — ordering + toggles — confirmed.
- **Typo tolerance / spell check** — enabled behavior (toggle-level) — confirmed.
- **Pinned products must match active query** — toggle — confirmed.
- **Sync frequency** (index refresh cadence) — tier-gated (3x/7x/day) — confirmed.

### data (sourcing & indexing)
- **Searchable fields / indexed product attributes** — multi-select (control which attributes are searchable) — confirmed.
- **Metafield source selection** for a filter option ("Metafield-<namespace>.<key>", best with single_line_text_field) — select — confirmed.
- **Metaobject-based filtering** (newer) — select — confirmed (Boost updates: filtering by metaobjects).
- **Variant-option vs separate-product display** for variants — select — confirmed.
- Catalog **sync scope** incl. B2B / wholesale catalog sync, multi-currency, multi-language/market — toggle/config — confirmed.

## data_model
- **App-owned external search index / DB** (Boost-hosted) — the real store of truth for search & faceting; the storefront queries Boost's API, not Shopify's native product filtering. **confirmed** (behavior) / hosting specifics **(inferred)**.
- **Merchant config store** (Boost-hosted): filter trees, filter options/values, merchandising campaigns & rules, synonyms, stop words, redirects, suggestion dictionary, instant-search widget config, recommendation rules. **confirmed** (all editable in the embedded admin; persisted server-side).
- **Analytics/event store**: aggregated search queries, no-result queries, filter usage, top products, conversion — retained per tier (e.g. 365-day reports on Accelerate). **confirmed.**
- **Shopify-side data**: reads Products, Variants, Collections, **Metafields**, and **Metaobjects**; uses **product tags** heavily as a filter source; may rely on **Smart Collections** as a workaround for metafield-based merchandising targeting. **confirmed.** Writes/uses **canonical URL** hints and had a documented incident touching **noindex** on products (see complaints).
- **Media/CDN**: custom **swatch images** and merchandising **banner images** are uploaded and cached (with a "clear swatch image cache" control) — image assets stored/served by the app. **confirmed.**
- No use of discount codes, gift cards, or checkout tokens — not a promotions engine. **(inferred.)**

## visual_patterns
- **Layout archetypes**: (a) predictive **search dropdown** anchored to the theme search bar — multi-column panel with suggestions list + product tiles; (b) **faceted collection/search page** = filter sidebar (vertical) OR horizontal bar OR off-canvas drawer on mobile + product grid; (c) **recommendation carousels / bundle blocks** on product pages. **confirmed.**
- **Component states**: filter option collapsed/expanded; value selected/unselected; single vs multi-select; product count badge; "0 results" greyed/hidden values; loading spinner during filter; no-result state with fallback suggestions; out-of-stock badge / hidden; sale price vs regular price; matched-variant image swap. **confirmed.**
- **Value display components**: checkbox list, box/button, color swatch (grid or list), image swatch, range slider, rating stars, nested/multi-level collection tree. **confirmed.**
- **Motion/interaction**: instant (AJAX) re-render on filter/search without full page reload; drag-and-drop ordering in admin (filter values, instant-search components, sort options); type-ahead autocomplete; infinite-scroll / load-more / numbered pagination; scroll-to-top button; "Refine by" removable filter chips; tooltip on hover; drawer slide-in on mobile. **confirmed.**

## reviews_signal
**Top praises (up-to-the-mark bar):**
1. **Customer support** — the single most-cited strength; "responsive, knowledgeable, quick to resolve," hands-on help with custom CSS/theme integration. confirmed.
2. **Filter flexibility & depth** — granular faceting by tag/metafield/variant, custom swatches, per-collection trees. confirmed.
3. **Search quality** — typo tolerance, synonyms, semantic/AI relevance across languages. confirmed.
4. **Reliability & performance** — fast, stable on desktop/mobile; long-tenured merchants renew for years. confirmed.
5. **Customization** — deep control to match brand/theme. confirmed.

**Top complaints (failure modes to avoid):**
1. **Theme coupling / dev dependency** — "ANY CHANGE you want to make is THEME specific," needs a developer, creating a "timing and process chokehold"; limits automation. confirmed.
2. **Serious SEO incident** — app set products to **noindex** across markets for ~a month → "financial losses in the thousands." confirmed. (Signals risk of an app mutating SEO/index state.)
3. **Feature gaps** — e.g. no variant-image display driven by more than one filter option; metafield attrs unsupported in merchandising rule conditions. confirmed.
4. **Price / GMV-scaled cost** — effective cost climbs steeply for larger stores. **(inferred from tiered GMV pricing + general category sentiment.)**
5. **Setup / learning curve** — powerful config surface implies non-trivial onboarding; offset by support. **(inferred.)**

## mapping_note
Boost maps to our vocabulary primarily as a **theme.section / proxy.widget pair backed by admin.block config + an analytics.pixel**, but it decisively **exceeds a single-module RecipeSpec** on several axes:

1. **Requires a persistent, app-owned data store + external search index.** Faceting, typo-tolerance, synonyms, and relevance are served from a Boost-hosted index continuously synced from the Shopify catalog — not derivable from a single self-contained theme module. A recipe can render a filter UI, but not own the index it queries.
2. **Needs scheduled background jobs.** Tier-gated catalog **re-sync** (3–7×/day) and **scheduled campaigns** (date-range activation/expiry) are cron/queue-shaped side effects, outside a stateless render module.
3. **Is a cross-surface blueprint with shared state.** Instant-search dropdown, collection/results faceting, and recommendation/bundle blocks are separate surfaces that must stay consistent with one rule/config store (a Pin rule affects both the dropdown and the results page). That's a coordinated multi-module blueprint, not one recipe.
4. **Carries a full rule engine.** Merchandising (Pin/Boost/Demote/Hide/Filter/Banner with condition-sets, priority ordering, market/schedule scoping, A/B tests) plus IF/THEN recommendation rules require a rule-builder + evaluation engine — beyond the fixed knob set of a single RecipeSpec.
5. **Performs external side-effects on Shopify state** (canonical URLs, and — per the incident — product index/SEO flags) and manages **uploaded media** (swatch/banner images with a cache). A recipe emitting a validated spec would need explicit, guarded capabilities to touch catalog SEO state and host assets.

Net: a single recipe could reproduce the *look* of the filter sidebar or an instant-search dropdown (settings_taxonomy → content/style/behavior knobs translate cleanly), but the *system* — index + sync jobs + rule engine + cross-surface coordination + analytics + media — is a data-backed, multi-module, background-job application.
