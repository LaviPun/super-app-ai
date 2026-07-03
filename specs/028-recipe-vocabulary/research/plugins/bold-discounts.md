# Bold Discounts ‑ Flash Sales

> Rename/lineage note: The app formerly listed as "Bold Discounts ‑ The Sale App" is now
> listed as **"Bold Discounts ‑ Flash Sales"** at the same App Store handle (`/product-discount`),
> same vendor (Bold). This is a **rename, not a deprecation** — the URL, review history, and core
> product are continuous (confirmed). Separately, Bold offers a second engine, **"Discounts Powered
> by Bold Price Rules"** (a.k.a. Discounts PRE), which is a different internal mechanism switched on
> by request via Bold's team, NOT a separate App Store listing (confirmed). This record studies the
> default engine (classic Bold Discounts V1, the compare-at-price overwrite model) because that is
> what installs by default and what the reviews describe; the Price-Rules variant is called out
> where its behavior diverges.

## identity
- **name**: Bold Discounts ‑ Flash Sales (formerly "Bold Discounts ‑ The Sale App") (confirmed)
- **vendor**: Bold / Bold Commerce (confirmed)
- **category**: bold (per study brief); functionally a Discounts / Sales / Promotions app (confirmed)
- **App Store URL**: https://apps.shopify.com/product-discount (confirmed)
- **rating**: 4.0 / 5 (confirmed)
- **review count**: 484 reviews — 73% 5-star (~351), 14% 1-star (~67) (confirmed)
- **install signal**: No public install number on listing; a 10-year continuous user ("Liberty
  Maniacs") appears in reviews, and Bold is a long-standing top-tier Shopify vendor — indicates a
  large, mature install base (confirmed vendor tenure; exact installs unknown)
- **pricing model**: Free plan for development/sandbox shops only; single paid tier **Essentials /
  Basic at $19.99/month** with a 14-day free trial. Flat pricing — no usage/variant tiers; all
  features on every plan (confirmed)

## surfaces
Bold Discounts is fundamentally a **background pricing engine plus storefront decoration**, not a
checkout-time discount. It does NOT use Shopify Functions or checkout discount logic — it mutates
catalog data directly. Mapped to our internal extension-type vocabulary:

- **theme.section** (confirmed) — This is the primary rendered surface. The app injects three
  theme-level widgets via App Embed blocks / theme snippets:
  - **Sales Clock (countdown timer)** — rendered on the product page (and configurable per template),
    showing time remaining until the scheduled sale ends.
  - **Sales Icon / badge** — rendered as an overlay on product images on both the **product detail
    page** and **collection page** (starburst / tag / banner styles).
  - **Show/Hide custom text or HTML** during an active sale (sale-messaging block).
  These are theme-embedded Liquid/JS widgets driven by whether a variant is currently in an active
  discount group — closest fit is `theme.section` (app-embed/app-block widgets on the storefront).
- **admin.block** / **admin.action** (confirmed) — The entire merchant-facing configuration UI
  (create discount group, pick products, set schedule, style the clock/icon) lives in an embedded
  admin app. The "create sale group / bulk edit / activate toggle" flows are admin actions.
- **analytics.pixel** — none observed (not a tracking/analytics app) (confirmed absent)
- **functions.discountRules / checkout.upsell / postPurchase.offer** — NOT used by classic Bold
  Discounts. The discount is applied by **overwriting the variant price in the catalog**, so the
  "discount" is already baked into the price the customer sees; there is no checkout-time function or
  discount code (confirmed). (BOGO is delivered only via integration with the separate Bold Product
  Upsell app, not natively.)
- **pos.extension** (inferred) — Because the discount is a real variant-price mutation synced into
  Shopify's product catalog, the sale price propagates to Shopify POS and other sales channels
  automatically (listing claims POS compatibility). This is a *side effect of the data model*, not a
  dedicated POS extension surface (confirmed the claim; mechanism inferred).

**Cross-surface coordination**: The shared state is the **discount group** and its active/scheduled
window. When a group goes live (manually or on schedule), the backend (1) rewrites variant prices +
compare-at prices in the Shopify catalog, (2) applies the group's **Discount Tag** to affected
products, and (3) flips the storefront widgets (clock counts down to the group's end time; icon
shows on tagged/discounted products; sale message appears). All surfaces read from the same
group→product membership + schedule. The countdown timer specifically requires the group's date
range to be enabled — the clock is driven by the same `start/end` fields that drive activation.
Handoff to POS/Google/Facebook happens implicitly because the catalog price itself changed.

## functional_model
Core entities and relationships (concrete):

```
DiscountGroup = {
  name: string,                      // "Discount Name"
  discountType: "percentage" | "dollar_amount",
  amount: number,                    // "Discount Amount"
  overrideCents: number | null,      // replaces cents portion of final price only
  discountTag: string | null,        // tag stamped on member products (drives smart collections)
  enabled: boolean,                  // activation toggle (green = live)
  schedule: {
    dateRangeEnabled: boolean,       // required for the Sales Clock to render
    startDate, startTime,
    endDate, endTime
  } | null,
  duplicateAndHide: boolean          // creates hidden duplicate product (Bold Upsell integration only)
  members: [ProductRef | VariantRef] // products/variants selected into the group
}

ProductRef / VariantRef = {
  productId, variantId,
  originalPrice,                     // snapshotted so it can be restored on sale end
  discountedPrice                    // computed = f(originalPrice, discountType, amount, overrideCents)
}

// Derived / storefront-facing
SaleState(variant) = variant ∈ any(enabled DiscountGroup) within its active window
  → renders Sales Icon, Sales Clock, sale message; sets Shopify compare_at_price = originalPrice
```

Relationships: one **DiscountGroup** has many **members** (products/variants); a variant can belong
to a group; the group owns a single discount rule + optional schedule + optional tag + optional style
association. "Daily Deals / Clearance" collections are ordinary Shopify **smart collections** whose
rule is "product has tag == the group's Discount Tag" — so the app manages membership indirectly by
stamping/removing tags, and Shopify's collection engine does the grouping (confirmed).

## settings_taxonomy
The actual merchant-facing controls, grouped:

### content
- **Discount Name** — text (group label) (confirmed)
- **Sale message / custom text or HTML** — text/richtext, shown on storefront while sale is active
  ("Show/hide custom text or HTML during active sales") (confirmed)
- **Sales Icon text replacement** — text (legacy install: overrides the label baked into the icon,
  e.g. "SALE" → "50% OFF") (confirmed)
- **Countdown timer translation labels** — text set: "Sale Over", "Sale Ends In", Day/Days,
  Hour/Hours, Minute/Minutes, Second/Seconds (for localizing the clock) (confirmed)

### style
- **Sale Icon style** — select[ Tag | Banner | Starburst ] (confirmed)
- **Custom sale icon upload** — image / file URL (legacy install path) (confirmed)
- **Icon Height** — number/slider (confirmed)
- **Icon Width** — number/slider (confirmed)
- **Icon position** — select/dropdown (placement over the product image) (confirmed)
- **Sales Clock template** — select ("Select a template") (confirmed)
- **Clock Text Align** — select[ left | center | right ] (confirmed)
- **Clock Font size** — number/slider (confirmed)
- **Clock Font color** — color (confirmed)
- **Clock Margin size** — number/slider (confirmed)
- **Clock Padding size** — number/slider (confirmed)
- **Clock Border color** — color (confirmed)
- **Clock Border size** — number/slider (confirmed)
- **Clock Background color** — color (confirmed)
- **Custom CSS** — text (for both icon and clock; also present in legacy install) (confirmed)
- **Preview mode** — toggle (design-time preview of the clock) (confirmed)
- (Legacy) **Sales Clock Type** / **Sales Clock Style** — select dropdowns (confirmed)

### targeting
- **Product selection** — product-picker with filters by **product title, collection, vendor,
  product type** (confirmed)
- **Select All Results** — action/toggle to place the **entire store** on sale (confirmed)
- **Collection-based application** — pick a whole collection into the group (confirmed)
- **Product exclusion** — exclude specific products from an otherwise broad group (confirmed on
  listing as "Product exclusion options"; exact UI field name unknown)
- **Discount Tag** — text; every member product is stamped with this tag → used to build "Daily
  Deals / Clearance / On Sale" **smart collections** (targeting via tag) (confirmed)

### behavior
- **Discount Type** — select[ Percentage | Dollar amount ] (confirmed)
- **Discount Amount** — number (confirmed)
- **Override Cents** — number (forces the cents portion of the final price, e.g. always .99; does
  not change the dollar value) (confirmed)
- **Activation toggle (Enabled)** — toggle, green when live; manual on/off if no schedule (confirmed)
- **Enable Date Range** — toggle; when on, the group auto-activates/deactivates on schedule AND
  enables the Sales Clock (confirmed)
- **Start Date / Start Time** — date + time (confirmed)
- **End Date / End Time** — date + time (confirmed)
- **Update Now** — action button to sync newly created Shopify products into an existing group
  (confirmed)
- **Duplicate & Hide** — toggle: "Create a hidden duplicate (Liquid update required)" — only for the
  Bold Upsell / BOGO integration (confirmed)
- (Sync behavior, not a knob but merchant-visible): storefront prices update ~1000 products / 10s;
  admin prices ~1 product/sec (~1000 variants/hour) — large catalogs take time to fully go on sale
  and to revert (confirmed)

### data
- **Compare-at-price population** — automatic (behavioral, not a toggle): original price is moved
  into Shopify's `compare_at_price` so it renders as strikethrough; removed automatically when the
  sale ends (confirmed)
- **Auto-tagging** — automatic: Discount Tag applied to member products while active, removed when
  the sale ends (confirmed)
- **Multi-channel price propagation** — sale price syncs to POS, Google/Facebook feeds because it is
  a real catalog price (confirmed as claim)

## data_model
What it persists and where:
- **Discount groups + membership + schedule + style settings** — persisted in **Bold's own external
  database** (Bold-hosted backend), not in Shopify metafields (inferred from architecture; the admin
  UI is a Bold-hosted embedded app). This is the source of truth for original-price snapshots so
  prices can be restored (confirmed by revert behavior; storage location inferred).
- **Shopify product catalog (variant price + compare_at_price)** — the app **destructively writes
  the live variant price** and moves the original into `compare_at_price`. This is the crux of the
  data model and the source of most complaints: the "discount" lives in Shopify's real product data,
  not in a separate discount object (confirmed).
- **Shopify product tags** — the Discount Tag is written onto/removed from products (confirmed).
- **Shopify smart collections** — "Daily Deals / Clearance / On Sale" collections are native smart
  collections keyed on the Discount Tag (confirmed).
- **Theme assets** — legacy install injects Liquid snippets/assets into the theme for the icon/clock;
  modern install uses App Embed / App Blocks (theme app extensions) (confirmed).
- **Original-price backup** — Bold stores the pre-sale price to restore later; if uninstall/sync
  fails, prices can get "stuck" (the reversion depends on Bold's backend still running) (confirmed
  as the documented mechanism and the failure mode in reviews).
- **No discount codes** — no coupon codes generated or stored (confirmed).
- (Price-Rules variant differs: "Discounts Powered by Bold Price Rules" applies discounts via a
  price-rule layer rather than overwriting the base variant price — cleaner revert, but that engine
  is opt-in and not the default.) (confirmed such a variant exists; internal detail inferred)

## visual_patterns
- **Layout archetypes**: (1) storefront strikethrough price + compare-at "was" price; (2) image
  overlay badge (starburst / tag / banner corner ribbon) on product + collection thumbnails; (3)
  inline countdown timer block on the product page (DD:HH:MM:SS); (4) optional sale-message banner /
  HTML block. Admin side: list of discount groups with a prominent green on/off toggle per group, a
  product-picker table with filter chips (title/collection/vendor/type) and "Select All Results",
  and a style panel with sliders + color pickers + live "Preview mode".
- **Component states**: group = draft/disabled → scheduled (armed, not yet live) → live/active
  (green) → ended (auto-reverted). Variant = normal → on-sale (badge + strikethrough + clock) →
  reverted. Timer = counting down → "Sale Ends In" → "Sale Over" terminal label.
- **Motion / interaction**: the countdown timer ticks per second (JS interval); urgency is the whole
  design intent. Badges are static overlays. Admin toggling a group triggers the (visibly slow)
  bulk price-sync — the storefront changes progressively as ~1000 variants/10s flip, so large sales
  "roll out" rather than switch instantly (confirmed).

## reviews_signal
**Top praises** (defines up-to-the-mark):
1. **"Set it and forget it" scheduling/automation** at scale — handles thousands of variants
   automatically (a 10-year user cites this) (confirmed).
2. **Bulk operations save massive time** — does "in a few seconds what would take much much longer"
   manually (confirmed).
3. **Flash sales with no coupon codes** — storewide sales in seconds (confirmed).
4. **Countdown timers + sale icons boost conversion** via urgency (confirmed).
5. **Works out of the box; responsive, professional support** (when reachable) (confirmed).

**Top complaints** (failure modes):
1. **Prices get "stuck" / don't revert**, especially after uninstall — "deleted all sales but THE
   SALES ARE STUCK ON MY PRODUCTS." The destructive price overwrite is dangerous when the backend
   fails to restore originals (confirmed).
2. **Google Merchant Center sync failure** — app doesn't push the sale price to GMC correctly,
   getting products disallowed (confirmed).
3. **Incorrect discount application** — variants discounted at wrong amounts (all at 25% when mixed
   tiers intended) (confirmed).
4. **Server errors / app stops working** ("error del servidor") (confirmed).
5. **Support gaps during peak periods** (Cyber Monday), plus the slow sync being surprising on large
   catalogs (confirmed).

Theme: the exact thing that makes it powerful — mutating real catalog prices in bulk — is also the
root of every serious failure (stuck prices, wrong prices, channel-sync breakage).

## mapping_note
How Bold Discounts maps onto our constrained **RecipeSpec** vocabulary, and where it **exceeds a
single-module recipe**:

- **Fits** as a set of surfaces: the storefront **Sales Clock**, **Sales Icon**, and **sale-message**
  are each recipe-shaped `theme.section`/app-embed widgets with a clean settings taxonomy
  (content/style/targeting/behavior) that a single RecipeSpec could largely express. The admin
  configuration screen maps to `admin.block`/`admin.action`.

- **Exceeds a single-module recipe** in four load-bearing ways:
  1. **Requires a persistent external data store with authoritative state** — discount groups,
     membership, schedules, and crucially the **original-price snapshots** must be stored and owned
     outside any one theme widget so prices can be reverted. A recipe that only emits UI cannot own
     this; without the snapshot store the revert is impossible.
  2. **Requires background jobs / a scheduler + a rate-limited bulk mutation pipeline** — the engine
     must, on a schedule, walk thousands of variants and write price/compare-at/tag at ~1000
     variants/hour, then reverse it. This is a durable, resumable background worker (cron + queue),
     not a request/response module. The "stuck prices" failure is precisely what happens when this
     job layer is missing or dies.
  3. **Performs external, destructive side-effects on the merchant's live catalog** — it mutates
     Shopify `variant.price`, `compare_at_price`, and product tags, and those mutations fan out to
     POS / Google / Facebook channels. A recipe module in our system should not silently rewrite core
     catalog data; this needs an explicit side-effect/rule-engine capability with rollback.
  4. **Is a coordinated cross-surface blueprint with shared runtime state** — the scheduled
     activation must atomically flip catalog data, admin state, storefront clock/icon/message, and
     smart-collection membership together, all keyed on the same group + window. That coordination
     across admin, background worker, catalog, and multiple storefront widgets is a multi-module
     blueprint, not one module.

Net: Bold Discounts is expressible as a **blueprint** (admin config module + multiple storefront
widget modules) **backed by a stateful discount/scheduling engine** (external store + background
job + rate-limited catalog-mutation side-effect with revert). The UI is recipe-scale; the engine
underneath is explicitly out of single-module scope.
