# R2.3 — `recommendation.source` strategy select (control-pack)

**Phase 30 · compositional control-packs · piece R2.3 (M3 in gap-analysis).**
Vocabulary for *how offered/recommended products are chosen*: a strategy select
(Recommended / Similar / Complementary / Top-Sellers / Trending / Buy-It-Again /
Recently-Viewed / Manual / Collection) + per-strategy config. Pairs with R2.1
(rule-builder) to express a full upsell/cross-sell plugin.

This doc is buildable-from: it gives exact Zod shapes, `file:line` change points,
and — the make-or-break part — traces where each strategy is *resolved* on the two
real render seams (Liquid theme runtime; checkout Preact + Storefront API). It is
**additive**: a new optional pack + an optional `recommendation` config field. No
existing recipe changes shape.

---

## 1. Current state (file:line evidence)

**No recommendation vocabulary anywhere in the recipe.**

- `packages/core/src/recipe.ts:107-521` — `RecipeSpecSchema` discriminated union.
  The only product-bearing configs are hand-picked GIDs:
  - `checkout.upsell` (`recipe.ts:298-307`): `productVariantGid: z.string().min(10)`.
  - `checkout.block` (`recipe.ts:309-319`): optional `productVariantGid`.
  - `postPurchase.offer` (`recipe.ts:321-330`): optional `productVariantGid`.
  - `functions.cartTransform` (`recipe.ts:242-260`): `bundles[].componentSkus` (manual SKUs).
  - `theme.section` (`recipe.ts:116-149`): open `.catchall` config, `blocks[]`, no product concept.
  None of these express a *strategy* — they are all "merchant pasted a specific variant/SKU."

- `packages/core/src/control-packs/registry.ts:18-29` — 10 registered packs
  (`content`, `style`, `trigger`, `page-targeting`, `frequency-cap`, `countdown`,
  `behavior`, `audience`, `schedule`, `advanced-custom`). **No `recommendation` pack.**

- `apps/web/app/services/ai/blueprint-catalog.ts:41-90` — upsell intent
  (`upsell.bundle_builder`) resolves to a fixed 2–3 member composite with
  `componentSkus`; there is no "how are these chosen" axis. This is the "fixed
  2-entry composite" the gap-analysis cites (`gap-analysis.md:100`, M3).

**Render seams (why the resolver split matters):**

- **Storefront (Liquid + JS):** `extensions/theme-app-extension/snippets/superapp-module.liquid:51-292`
  is a fixed `{% case kind %}` allowlist. `extensions/theme-app-extension/assets/superapp-modules.js`
  (233 lines) does exactly two things — a popup engine and a contact-form `fetch()`
  POST (header comment lines 1-7). **There is zero client-side product-fetch code.**
  Liquid, however, natively exposes `recommendations` (complementary/related),
  `collections[...].products`, and `all_products` — so *static* strategies resolve
  in Liquid with **no service**.

- **Checkout (Preact + Storefront API):** `extensions/checkout-ui/src/hooks/useCheckoutConfig.ts:57-70`
  already resolves variant GIDs → title/image/price via `shopify.query()` (Storefront
  API `nodes(ids:)`). It reads `config.productVariantGid` only
  (`useCheckoutConfig.ts:137-138`); it has **no** recommendation query.

- **Compile:** `apps/web/app/services/recipes/compiler/theme-module.ts:24-46` copies
  `spec.config` verbatim into `themeModulePayload.config` → published as the
  `config_json` metaobject field. So **any new config key flows to Liquid for free**;
  the resolver just has to read it. `apps/web/app/services/recipes/compiler/index.ts:20-68`
  is the dispatch; `theme.section` → `compileThemeSection` (`compiler/theme.section.ts`).

- **Preview:** `apps/web/app/services/preview/preview.service.ts:397-400` renders
  hardcoded placeholder "Product A/B/C" cards — deterministic, no AI, no live catalog.

---

## 2. Target shape (exact TS/Zod types + example JSON)

### 2.1 New allowed-values enums

Add to `packages/core/src/allowed-values.ts` (next to `CONDITION_OPERATORS`, ~line 475):

```ts
/** recommendation.source strategy (R2.3 / pack #25). Ordered by resolver class. */
export const RECOMMENDATION_STRATEGIES = [
  // ── STATIC (resolve in Liquid / Storefront API, no service) ──
  'manual',              // merchant-picked variants
  'collection',          // products from a chosen collection (optional random)
  'related',             // Shopify product_recommendations intent=related
  'complementary',       // Shopify product_recommendations intent=complementary
  'most-expensive-in-cart',
  'cheapest-in-cart',
  // ── DYNAMIC (need the recommendation service / precomputed data) ──
  'top-sellers',         // ranked by units sold (window)
  'trending',            // ranked by recent velocity
  'buy-it-again',        // customer order history
  'recently-viewed',     // client-side view log
] as const;
export type RecommendationStrategy = (typeof RECOMMENDATION_STRATEGIES)[number];

/** Which strategies are resolvable with no backend recommendation service. */
export const STATIC_RECOMMENDATION_STRATEGIES = [
  'manual', 'collection', 'related', 'complementary',
  'most-expensive-in-cart', 'cheapest-in-cart',
] as const;
```

> Deliberately trimmed from the research list (`settings-vocabulary.md:411-426`):
> `ai-recommended`/`endpoint`/`metafield`/third-party engines are **out of scope**
> for R2.3 (no service, no vocabulary for engine credentials). `related`+
> `complementary` cover the "Shopify rec engine" cases natively. Add `aiEngine`/
> `endpoint` later only when a resolver exists.

### 2.2 The control pack

New file `packages/core/src/control-packs/packs/recommendation.pack.ts`:

```ts
import { z } from 'zod';
import { RECOMMENDATION_STRATEGIES } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

const VARIANT_GID_RE = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const PRODUCT_GID_RE = /^gid:\/\/shopify\/Product\/\d+$/;
const COLLECTION_GID_RE = /^gid:\/\/shopify\/Collection\/\d+$/;

export const RecommendationPackSchema = z.object({
  /** How the offered/recommended products are chosen. */
  strategy: z.enum(RECOMMENDATION_STRATEGIES).default('related'),

  /** manual: explicit variant GIDs (also the deterministic fallback for any dynamic strategy). */
  manualVariantGids: z.array(z.string().regex(VARIANT_GID_RE)).max(20).default([]),

  /** related/complementary/buy-it-again seed. Optional: defaults to the current PDP product at render. */
  seedProductGid: z.string().regex(PRODUCT_GID_RE).optional(),

  /** collection: source collection + optional single-random pick. */
  collectionGid: z.string().regex(COLLECTION_GID_RE).optional(),
  collectionRandom: z.boolean().default(false),

  /** Common shaping. */
  productLimit: z.number().int().min(1).max(12).default(4),
  excludeTags: z.array(z.string().min(1).max(60)).max(20).default([]),
  hideCartProducts: z.boolean().default(false),

  /**
   * Deterministic fallback when a dynamic strategy yields nothing at render
   * (empty history, service unavailable, non-Plus). Never leaves an empty slot.
   */
  fallback: z.enum(['manual', 'collection', 'related', 'hide']).default('related'),
})
.superRefine((v, ctx) => {
  if (v.strategy === 'manual' && v.manualVariantGids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manualVariantGids'],
      message: 'manual strategy requires at least one variant.' });
  }
  if (v.strategy === 'collection' && !v.collectionGid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['collectionGid'],
      message: 'collection strategy requires collectionGid.' });
  }
  if (v.fallback === 'manual' && v.manualVariantGids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fallback'],
      message: 'fallback=manual requires manualVariantGids.' });
  }
  if (v.fallback === 'collection' && !v.collectionGid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fallback'],
      message: 'fallback=collection requires collectionGid.' });
  }
});

export type RecommendationPack = z.infer<typeof RecommendationPackSchema>;

export const recommendationPack: ControlPack<typeof RecommendationPackSchema> = {
  id: 'recommendation',
  namespace: 'recommendation',
  label: 'Recommendations',
  tier: 'basic',
  schema: RecommendationPackSchema,
  uiSchema: {
    groupLabel: 'Product recommendations',
    order: ['strategy', 'manualVariantGids', 'seedProductGid', 'collectionGid',
            'collectionRandom', 'productLimit', 'excludeTags', 'hideCartProducts', 'fallback'],
    fields: {
      manualVariantGids: { widget: 'product-picker',
        showWhen: { field: 'strategy', equals: 'manual' } },
      seedProductGid: { tier: 'advanced', widget: 'product-picker',
        help: 'Defaults to the current product on a PDP.' },
      collectionGid: { widget: 'collection-picker',
        showWhen: { field: 'strategy', equals: 'collection' } },
      collectionRandom: { showWhen: { field: 'strategy', equals: 'collection' } },
      excludeTags: { tier: 'advanced' },
      hideCartProducts: { tier: 'advanced' },
      fallback: { tier: 'advanced',
        help: 'Shown when a dynamic strategy has no result (empty history / service down).' },
    },
  },
};
```

### 2.3 Where it attaches to the recipe (additive optional field)

`theme.section.config` gains an optional `recommendation`, mirroring how `audience`/
`schedule`/`advancedCustom` are already inlined there (`recipe.ts:139-142`):

```ts
// inside the theme.section config object (recipe.ts:120-146)
recommendation: RecommendationPackSchema.optional(),
```

`checkout.upsell`, `checkout.block`, `postPurchase.offer` each gain the same optional
field. `productVariantGid` stays — it is exactly `strategy:'manual'` with one variant.

### 2.4 Example JSON (a "Frequently bought together" PDP widget)

```json
{
  "type": "theme.section",
  "name": "Frequently bought together",
  "category": "STOREFRONT_UI",
  "config": {
    "kind": "product-recommendations",
    "activation": "section",
    "title": "Frequently bought together",
    "recommendation": {
      "strategy": "complementary",
      "productLimit": 3,
      "hideCartProducts": true,
      "excludeTags": ["hidden-upsell"],
      "manualVariantGids": [],
      "collectionRandom": false,
      "fallback": "related"
    }
  }
}
```

Manual example (checkout upsell, no service ever): `recommendation.strategy:"manual"`,
`manualVariantGids:["gid://shopify/ProductVariant/123"]` — or just keep the legacy
`productVariantGid`.

---

## 3. Files to change (each with what changes)

| # | File | Change |
|---|---|---|
| 1 | `packages/core/src/allowed-values.ts` (~475) | Add `RECOMMENDATION_STRATEGIES` + `STATIC_RECOMMENDATION_STRATEGIES` consts + type. |
| 2 | `packages/core/src/control-packs/packs/recommendation.pack.ts` (new) | The pack from §2.2. |
| 3 | `packages/core/src/control-packs/registry.ts:8-29` | Import `recommendationPack`; add to `ALL_PACKS`. |
| 4 | `packages/core/src/recipe.ts:9-11` | `import { RecommendationPackSchema } from './control-packs/packs/recommendation.pack.js';` |
| 5 | `packages/core/src/recipe.ts:120-146` | Add `recommendation: RecommendationPackSchema.optional()` to `theme.section` config. |
| 6 | `packages/core/src/recipe.ts:302-329` | Add same optional field to `checkout.upsell`, `checkout.block`, `postPurchase.offer` configs. |
| 7 | `packages/core/src/control-packs/module-manifests.ts` | Add `'recommendation'` to the `advancedPacks` of any product-widget `theme.section` manifest(s) so the v2 form surfaces it (manifests exist for `theme.section` per `module-system-version.md:17`). |
| 8 | `packages/core/src/index.ts` | Re-export `RecommendationPackSchema`, `RecommendationPack`, `RECOMMENDATION_STRATEGIES`, `STATIC_RECOMMENDATION_STRATEGIES` (match the existing pack/enum export pattern). |
| 9 | `extensions/theme-app-extension/snippets/superapp-module.liquid` | New `{% when 'product-recommendations' %}` branch → `{% render 'superapp-recommendations', mod_cfg: mod_cfg, module_id: module_id %}` (§5.1). Also allow *any* kind to render recs when `mod_cfg.recommendation` is present (see §5.1 note). |
| 10 | `extensions/theme-app-extension/snippets/superapp-recommendations.liquid` (new) | Liquid resolver for static strategies + a `data-superapp-recs` mount for dynamic strategies (§5.1). |
| 11 | `extensions/theme-app-extension/assets/superapp-modules.js` | Add a dynamic-recs resolver: reads `[data-superapp-recs]`, calls the App Proxy `/apps/superapp/recommend` for dynamic strategies, renders cards. (§5.2) |
| 12 | `apps/web/app/routes/proxy.recommend.tsx` (new) | App Proxy route that resolves dynamic strategies (top-sellers / trending / buy-it-again) server-side; returns JSON products. (§5.3) |
| 13 | `apps/web/app/services/recommendations/recommendation.service.ts` (new) | Pure strategy resolver used by the proxy route + preview; the single "which need a service" seam. (§5.3) |
| 14 | `extensions/checkout-ui/src/hooks/useCheckoutConfig.ts:120-142` | When `config.recommendation` present and strategy is static-resolvable via Storefront API, resolve products from it; else fall back to `productVariantGid`. (§5.4) |
| 15 | `apps/web/app/services/preview/preview.service.ts:395-401` | Render a recommendation-aware placeholder that labels the strategy + limit (deterministic, still no live catalog). (§5.5) |
| 16 | `apps/web/app/services/ai/prompt-expectations.server.ts` | Add `recommendation` pack to the type-expectations block for product-widget types (§4). |
| 17 | Tests: `packages/core/src/__tests__/recommendation-pack.test.ts` (new) + additions to recipe/blueprint tests (§7). |

---

## 4. Generation wiring (how the AI emits it)

The AI only ever emits a `RecipeSpec` (`recipe.ts:96-98`); adding an optional
`config.recommendation` object is enough for it to be *emittable*. To make the model
emit it *correctly*:

1. **JSON-Schema / structured output.** The LLM structured-output schema is derived
   from `RecipeSpecSchema`. Because `recommendation` is a real optional field on the
   discriminated union, it appears in the derived JSON Schema automatically — no
   separate wiring, matching how `audience`/`schedule` already surface.

2. **Prompt expectations** (`apps/web/app/services/ai/prompt-expectations.server.ts`).
   Add a short block, emitted only for product-widget types
   (`theme.section` with a product kind, `checkout.upsell`, `postPurchase.offer`):

   > When a module recommends/offers products, set `config.recommendation.strategy`
   > to one of: `manual`, `collection`, `related`, `complementary`,
   > `most-expensive-in-cart`, `cheapest-in-cart`, `top-sellers`, `trending`,
   > `buy-it-again`, `recently-viewed`.
   > - Use `manual` + `manualVariantGids` ONLY when the merchant named specific products.
   > - Prefer `complementary` for "frequently bought together" / cross-sell, `related`
   >   for "you may also like", `buy-it-again` for reorder, `trending`/`top-sellers`
   >   for "best sellers".
   > - Dynamic strategies (`top-sellers`,`trending`,`buy-it-again`,`recently-viewed`)
   >   MUST also set a `fallback` (`related` is a safe default) so the widget never
   >   renders empty.
   > - Do NOT invent product GIDs. Leave `manualVariantGids` empty unless the merchant
   >   provided products; hydration/merchant fills them.

3. **Blueprint catalog** (`blueprint-catalog.ts:41-90`). Give the upsell composite's
   product-facing member a default `recommendation`. E.g. `bundle-builder-ui` /
   any FBT role gets `kindHint: 'product-recommendations'` and a default
   `{ strategy: 'complementary', productLimit: 3, fallback: 'related' }` injected as
   context so a plain "add an upsell" prompt produces a working strategy, not a blank
   product picker. (Keeps generation deterministic per this file's contract.)

4. **Hydration.** `manualVariantGids` and `seedProductGid` are the merchant-supplied
   leaves. The hydrate flow already resolves picker fields; `recommendation` uses the
   same `product-picker`/`collection-picker` widgets (`uiSchema` in §2.2), so the
   admin form renders pickers with no new component work.

---

## 5. Runtime / compile / render wiring (make-or-break)

**Design principle — resolver split by strategy class:**

| Class | Strategies | Resolver | Why |
|---|---|---|---|
| **STATIC** | `manual`, `collection`, `related`, `complementary`, `most-expensive-in-cart`, `cheapest-in-cart` | **Liquid** (storefront) / **Storefront API** (checkout). No backend. | Liquid natively exposes `recommendations.products` (intent related/complementary), `collections[...].products`, and cart access. Zero-latency, cacheable, works offline of our app. |
| **DYNAMIC** | `top-sellers`, `trending`, `buy-it-again`, `recently-viewed` | **App Proxy → recommendation.service** (storefront) / degrade to `fallback` (checkout). | These need ranking over order/analytics data (`top-sellers`,`trending`,`buy-it-again`) or per-session client state (`recently-viewed`) that Liquid cannot compute. |

Compile is a no-op passthrough (§5.0) — the whole feature lives in the resolvers.

### 5.0 Compile (nothing to build)

`compiler/theme-module.ts:33-40` already copies `spec.config` verbatim into
`themeModulePayload.config`, published as `config_json`. So `config.recommendation`
reaches Liquid with **no compiler change**. Same for checkout: `checkout.upsell.ts:10-15`
copies `spec.config` into `checkoutUpsellPayload.config` → published into
`superapp.checkout/upsell_refs` → read by `useCheckoutConfig`. **No compiler edits.**
(Optional hardening: strip empty `recommendation` before publish to keep payloads lean.)

### 5.1 Storefront Liquid resolver — `superapp-recommendations.liquid` (new)

Add a branch in `superapp-module.liquid` (near the `product-bundle` branch, line 241):

```liquid
{% when 'product-recommendations' %}
  {% render 'superapp-recommendations', mod_cfg: mod_cfg, module_id: module_id %}
```

The new snippet resolves STATIC strategies inline and mounts DYNAMIC ones for JS:

```liquid
{% # superapp-recommendations.liquid — resolves config.recommendation %}
{% assign rec = mod_cfg.recommendation %}
{% assign strat = rec.strategy | default: 'related' %}
{% assign limit = rec.product_limit | default: 4 %}

{%- liquid
  assign products = null
  case strat
    when 'manual'
      # manualVariantGids are variant GIDs; render from the stamped titles/handles
      # persisted in config (hydration resolves them), OR resolve via all_products by handle.
      assign products = mod_cfg.recommendation_products   # optional pre-resolved list from hydration
    when 'collection'
      assign coll = collections[rec.collection_handle]
      assign products = coll.products
    when 'related'
      assign products = recommendations.products   # Shopify auto-injects when intent=related requested
    when 'complementary'
      assign products = recommendations.products
    when 'most-expensive-in-cart', 'cheapest-in-cart'
      # cart-derived; handled by JS from cart.js for accuracy (mount below)
      assign products = null
  endcase
-%}

{% if products %}
  <section class="superapp-recs" data-module-id="{{ module_id | escape }}" data-strategy="{{ strat | escape }}">
    {% if mod_cfg.title != blank %}<h2 class="superapp-recs__title">{{ mod_cfg.title | escape }}</h2>{% endif %}
    <ul class="superapp-recs__grid" role="list">
      {% for p in products limit: limit %}
        {% unless rec.hide_cart_products and cart.items contains p %}
          <li class="superapp-recs__card">
            <a href="{{ p.url }}">
              {% if p.featured_image %}<img src="{{ p.featured_image | image_url: width: 300 }}" alt="{{ p.title | escape }}" loading="lazy" width="150" height="150">{% endif %}
              <span class="superapp-recs__name">{{ p.title | escape }}</span>
              <span class="superapp-recs__price">{{ p.price | money }}</span>
            </a>
          </li>
        {% endunless %}
      {% endfor %}
    </ul>
  </section>
{% else %}
  {% # DYNAMIC (top-sellers/trending/buy-it-again/recently-viewed) or cart-derived → JS resolves %}
  <section
    class="superapp-recs superapp-recs--pending"
    data-superapp-recs
    data-module-id="{{ module_id | escape }}"
    data-strategy="{{ strat | escape }}"
    data-limit="{{ limit }}"
    data-fallback="{{ rec.fallback | default: 'related' | escape }}"
    data-seed-product="{{ product.id | default: '' }}"
    data-exclude-tags="{{ rec.exclude_tags | join: ',' | escape }}"
    data-hide-cart="{{ rec.hide_cart_products | default: false }}"
  >
    {% if mod_cfg.title != blank %}<h2 class="superapp-recs__title">{{ mod_cfg.title | escape }}</h2>{% endif %}
    <div class="superapp-recs__skeleton" aria-hidden="true"></div>
  </section>
{% endif %}
```

Notes:
- **`related`/`complementary`:** Shopify's `recommendations` object is populated when
  the section requests it (`recommendations.performed`). If the theme doesn't inject
  it in this context, the JS path (§5.2) falls back to fetching
  `/recommendations/products.json?product_id=…&intent=complementary` — a native,
  unauthenticated Ajax endpoint. This keeps `related`/`complementary` **service-free**
  even client-side.
- **Generic-kind opt-in:** also let the `{% else %}` (generic section) branch and the
  `product-bundle` branch render recs when `mod_cfg.recommendation != blank`, so
  recommendations compose onto other widgets (matching the "compositional" intent).

### 5.2 Storefront JS resolver (add to `superapp-modules.js`)

A third responsibility alongside popup + contact-form:

```js
/* ── product recommendations resolver ── */
function initRecs(root) {
  if (root.dataset.superappRecsBound) return;
  root.dataset.superappRecsBound = '1';
  var strat = root.getAttribute('data-strategy');
  var limit = parseInt(root.getAttribute('data-limit') || '4', 10);
  var fallback = root.getAttribute('data-fallback') || 'related';
  var seed = root.getAttribute('data-seed-product');

  function render(products) { /* build .superapp-recs__grid cards; hide skeleton */ }

  // native, service-free intents
  if (strat === 'related' || strat === 'complementary') {
    return fetch('/recommendations/products.json?product_id=' + encodeURIComponent(seed)
        + '&limit=' + limit + '&intent=' + (strat === 'complementary' ? 'complementary' : 'related'))
      .then(function (r) { return r.json(); })
      .then(function (j) { render((j.products || []).slice(0, limit)); })
      .catch(function () { resolveFallback(); });
  }
  // cart-derived — service-free (read /cart.js)
  if (strat === 'most-expensive-in-cart' || strat === 'cheapest-in-cart') {
    return fetch('/cart.js').then(...).then(pickByPrice).catch(resolveFallback);
  }
  // DYNAMIC — needs our App Proxy
  return fetch('/apps/superapp/recommend?strategy=' + strat + '&limit=' + limit
      + '&module_id=' + root.getAttribute('data-module-id'))
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (j) { render((j.products || []).slice(0, limit)); })
    .catch(function () { resolveFallback(); });

  function resolveFallback() {
    if (fallback === 'hide') { root.remove(); return; }
    // re-run with the fallback strategy (related/manual/collection)
    root.setAttribute('data-strategy', fallback); root.dataset.superappRecsBound = '';
    initRecs(root);
  }
}
// in the page-init sweep:
document.querySelectorAll('[data-superapp-recs]').forEach(initRecs);
```

`recently-viewed`: JS reads `localStorage` (the theme's own `recently-viewed` log or
our own), never the proxy.

### 5.3 App Proxy + recommendation.service (the only true "service")

`apps/web/app/routes/proxy.recommend.tsx` (mirror `proxy.$widgetId.tsx:14-68` — App
Proxy auth, `withApiLogging`, cache-control): parse `strategy`/`limit`/`shop`/customer,
delegate to the service, return `{ products: [{ id, title, url, price, featuredImage }] }`.

`apps/web/app/services/recommendations/recommendation.service.ts`:

```ts
export type ResolvedProduct = { id: string; title: string; url: string;
  price: string; featuredImage?: string };

/** ONLY dynamic strategies reach here; static ones resolve in Liquid/JS. */
export async function resolveRecommendation(args: {
  shop: string; strategy: RecommendationStrategy; limit: number;
  customerId?: string; seedProductGid?: string;
}): Promise<ResolvedProduct[]> {
  switch (args.strategy) {
    case 'top-sellers':   return topSellers(args);   // Admin GraphQL orders/product analytics
    case 'trending':      return trending(args);     // recent-window velocity
    case 'buy-it-again':  return buyItAgain(args);   // customer order history (needs customerId)
    default:              return [];                 // static → never here
  }
}
```

- `top-sellers`/`trending` can start as an Admin GraphQL query over recent orders
  ranked by line-item quantity (a ShopifyQL/analytics upgrade is a later refinement).
- `buy-it-again` needs the logged-in `customerId` (App Proxy passes it); empty for
  guests → JS uses `fallback`.
- Result is cached per (shop, strategy) for a few minutes (route `cache-control`).

**This service is the single place "which strategies need data" is answered.** Static
strategies never call it, so the feature ships useful (manual/collection/related/
complementary/cart-derived) even before the analytics queries are built — the dynamic
four degrade to `fallback` until then.

### 5.4 Checkout resolver (`useCheckoutConfig.ts`)

Checkout has no App Proxy access and must stay ≤64KB/Storefront-API-only. So:

- In `draftFromNode` (`useCheckoutConfig.ts:120-142`): if `config.recommendation`
  exists and strategy ∈ {`manual`, `collection`, `related`, `complementary`}, produce
  the seed for a Storefront-API resolution:
  - `manual` → resolve `manualVariantGids` via the existing `VARIANTS_QUERY` path.
  - `related`/`complementary` → add a `productRecommendations(productId:, intent:)`
    Storefront query (native, no backend), take `productLimit`.
  - `collection` → `collection(id:){ products(first: limit) }` Storefront query.
- Dynamic strategies (`top-sellers`/`trending`/`buy-it-again`/`recently-viewed`) are
  **not resolvable in checkout** → use `fallback`; if `fallback` is also dynamic or
  `hide`, the offer renders heading/message only (existing empty-safe behavior at
  `useCheckoutConfig.ts:212`). Legacy `productVariantGid` remains the default when no
  `recommendation` is present, so nothing regresses.

### 5.5 Preview (`preview.service.ts:395-401`)

Replace the hardcoded A/B/C block with a strategy-labelled placeholder: read
`config.recommendation?.strategy` + `productLimit`, render N skeleton cards captioned
"Strategy: complementary · up to 3 products". Deterministic, no catalog call — matches
the "PreviewService is deterministic, no AI" rule (`gap-analysis.md:177`).

---

## 6. Back-compat (existing persisted recipes MUST keep validating + rendering)

1. **Schema:** `recommendation` is `.optional()` on every config it's added to. Every
   already-persisted `theme.section`/`checkout.*`/`postPurchase.offer` recipe parses
   unchanged — the field is simply absent. `theme.section`'s `.catchall(z.unknown())`
   (`recipe.ts:146`) already tolerates unknown keys, so even a manually-injected
   `recommendation` on an old recipe never threw.

2. **Render (Liquid):** the new `{% when 'product-recommendations' %}` is additive; no
   existing `kind` value changes branch. Existing modules whose `config.recommendation`
   is blank hit no new code (the generic/product-bundle branches only render recs
   `if mod_cfg.recommendation != blank`).

3. **Render (checkout):** `useCheckoutConfig` still reads `productVariantGid` first;
   the `recommendation` path is entered only when the key exists. Every published
   `checkout.upsell` with a bare `productVariantGid` renders exactly as before.

4. **Compile:** passthrough is unchanged; old configs produce byte-identical payloads.

5. **Manual == legacy:** `strategy:'manual'` + one `manualVariantGid` is semantically
   the old `productVariantGid`. A future migration *may* fold `productVariantGid` into
   `recommendation.manualVariantGids`, but it is **not required** — both are supported
   indefinitely. Keep the old field.

6. **Blueprint coherence** (`recipe-blueprint.ts:66-71`) re-parses each member with
   `RecipeSpecSchema`; since the field is optional, existing persisted blueprints stay
   valid.

---

## 7. Test plan (concrete assertions)

**Pack unit** (`packages/core/src/__tests__/recommendation-pack.test.ts`, new):
- `RecommendationPackSchema.parse({})` → defaults `strategy:'related'`, `productLimit:4`,
  `fallback:'related'`, arrays empty.
- `strategy:'manual'` with empty `manualVariantGids` → **fails** (superRefine).
- `strategy:'manual'` + one valid variant GID → passes.
- `strategy:'collection'` without `collectionGid` → fails; with it → passes.
- `manualVariantGids:['not-a-gid']` → fails regex.
- `fallback:'manual'` with no manual products → fails.
- `productLimit: 99` → fails (max 12); `0` → fails (min 1).
- `STATIC_RECOMMENDATION_STRATEGIES` ⊂ `RECOMMENDATION_STRATEGIES`; the 4 dynamic ones
  are exactly `RECOMMENDATION_STRATEGIES \ STATIC_…`.

**Recipe integration** (extend existing recipe test):
- A `theme.section` with `config.recommendation.strategy:'complementary'` parses.
- A `theme.section` **without** `recommendation` still parses (back-compat).
- `checkout.upsell` with only legacy `productVariantGid` parses (back-compat).
- `checkout.upsell` with both `productVariantGid` and `recommendation` parses.

**Registry** (extend `control-packs` test):
- `getPack('recommendation')` returns the pack; `namespace === 'recommendation'`.
- `listPackIds()` includes `'recommendation'` (count 11).

**Compile** (extend compiler test):
- Compiling a `theme.section` with `recommendation` puts it into
  `themeModulePayload.config.recommendation` verbatim (passthrough proof).

**Service** (`recommendation.service.test.ts`, new):
- `resolveRecommendation({strategy:'manual'})` and any static strategy → `[]`
  (never touches data — the split invariant).
- `buy-it-again` with no `customerId` → `[]`.
- `top-sellers` returns ≤ `limit`, ordered.

**Resolver-class invariant test** (guards the whole design):
- For each strategy in `STATIC_RECOMMENDATION_STRATEGIES`, assert the service returns
  `[]` (i.e. static strategies must never depend on the backend). This is the
  regression fence that keeps the "renders without a service" guarantee true.

---

## 8. Risks + open questions

1. **`related`/`complementary` seed on non-PDP surfaces.** Shopify's
   `productRecommendations` needs a seed product. On cart/home/collection pages there
   is no `product`. Mitigation: require `seedProductGid` OR degrade to `fallback`
   (already modeled). Open: default seed for cart context = first/most-expensive cart
   line? (leaning: use `most-expensive-in-cart` as the implicit seed).

2. **`recommendations.products` availability in an app block.** Liquid only populates
   it when the section requests recommendations; inside a theme *app extension* block
   this isn't guaranteed. The `/recommendations/products.json` Ajax fallback (§5.2)
   de-risks this — but confirm the endpoint is enabled on target themes (it is a
   standard OS2 endpoint). If ever unavailable, `related`/`complementary` become
   DYNAMIC (route through the proxy via Admin `productRecommendations`).

3. **`top-sellers`/`trending` data source.** Starting with an Admin GraphQL orders
   scan is correct but coarse; the real parity target is analytics/ShopifyQL
   (`gap-analysis.md` Spring-26 notes). Ship the coarse version behind `fallback` so
   quality can improve without a vocabulary change.

4. **`buy-it-again` + PII/scopes.** Needs customer order history via App Proxy
   customer context; ensure `read_orders`/`read_customers` scopes and that guests
   degrade cleanly (they do → `fallback`).

5. **Discount coupling.** Recommendation chooses *which* products; R2.2 (pricing)
   decides *the offer's discount*. Keep them orthogonal packs — do NOT put discount
   fields in `recommendation`. (`discountPercent` already lives on `checkout.upsell`.)

6. **Preview fidelity.** Deterministic preview can't show real recs. Accepted per the
   no-AI-preview rule; the label ("strategy · limit") sets correct expectations.

7. **Third-party engines / `ai-recommended` deferred.** Explicitly out of R2.3. Adding
   them later means a new enum value + a service adapter, no shape change — the pack is
   forward-compatible.

---

## Summary

- **One optional `recommendation` control pack** (`strategy` select + per-strategy
  config + a mandatory `fallback`) attached optionally to `theme.section` and the
  three checkout/offer configs — fully additive, `strategy:'manual'` *is* the legacy
  `productVariantGid`, so every persisted recipe keeps validating and rendering.
- **Resolver split by strategy class is the core design:** 6 STATIC strategies resolve
  with **no backend** (Liquid `recommendations`/`collections`/cart + native
  `/recommendations/products.json`; Storefront-API `productRecommendations` in
  checkout); only 4 DYNAMIC strategies (top-sellers/trending/buy-it-again/
  recently-viewed) need the new App-Proxy `recommendation.service`, and they degrade
  to `fallback` until it exists — so the feature ships useful on day one. Compile is a
  pure passthrough (config already flows to `config_json`), so all real work is in the
  two resolvers.
- **Generation** needs only prompt-expectation guidance + a default `recommendation`
  on the upsell blueprint member; the field auto-appears in the derived LLM JSON
  Schema and reuses existing product/collection pickers for hydration.

**Biggest risk:** the STATIC-strategy guarantee leans on Shopify's native
`recommendations`/`/recommendations/products.json` being available inside a theme
*app-extension block* (not a native section). If that populates unreliably on some
themes, `related`/`complementary` silently fall through to `fallback` and the "works
without a service" promise weakens for the single most-common upsell case — so the
first build task must verify that endpoint on target themes before the pack is
advertised as service-free.
