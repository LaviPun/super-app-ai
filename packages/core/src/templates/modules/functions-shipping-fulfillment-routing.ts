/**
 * functions.shippingDiscount + fulfillmentConstraints + orderRoutingLocationRule +
 * localPickup / pickupPoint — the shipping / fulfillment / routing Function authoring
 * unit (034 surface-coverage). 16 templates spread across five Function targets.
 *
 * Grounding (028 corpus):
 *  - Discount Ninja — shipping-level discount Function (`entitlement.level='shipping'`,
 *    discount-ninja.md:23): free-shipping / percentage-shipping run as a delivery-
 *    options discount, not a rename/hide. → `functions.shippingDiscount`.
 *  - UpCart — in-drawer reward tiers instruct the merchant to earn a native Shopify
 *    free-shipping rate at a spend threshold (upcart.md:18-19,31); the discount is
 *    resolved by Shopify's engine. → spend-threshold `functions.shippingDiscount`.
 *  - Bold Memberships — free-shipping perk auto-applied per cycle keyed off the
 *    member CUSTOMER TAG (bold-memberships.md:30,40,72). The tag gate honestly
 *    degrades to "no match" until Bold's billing engine applies the tag — it never
 *    implies a guaranteed live waiver. → customer-tag `functions.shippingDiscount`.
 *  - Intuitive Shipping — multi-warehouse origins, zones, ship-alone / pack-separately
 *    boxes, and per-item fulfillment rules (intuitive-shipping.md:35-44,62-69,97).
 *    → `functions.fulfillmentConstraints` (ship-alone / group / must-fulfill-from) +
 *    `functions.orderRoutingLocationRule` (prefer origin by country / inventory).
 *
 * Honesty (a review caught fake-success bugs — not reintroduced here):
 *  - Only resolvable vocab is used. `functions.shippingDiscount` waives/discounts
 *    delivery via `apply.shippingPercentage` (100 = free); customer-tag gates degrade
 *    to "no match" until the tag exists, never a guaranteed waiver.
 *  - `functions.fulfillmentConstraints`: `when.productTagIn` is parsed-but-inert per
 *    the schema note (tag lookups need static input-query args) — `skuIn` is the
 *    supported matcher, so every fulfillment template gates on `skuIn`.
 *    `mustFulfillFromLocationIds` uses canonical `gid://shopify/Location/<id>`.
 *  - `functions.localPickupDeliveryOption` / `functions.pickupPointDeliveryOption`
 *    are on Shopify's `unstable` API only (verified 2026-07-04) and classify
 *    `needs_runtime` until the generator target ships on a stable version — authored
 *    honestly as needs_runtime, not implied deployable.
 *
 * All 16 parse against RecipeSpecSchema (recipe.ts:627 shippingDiscount, :581
 * fulfillmentConstraints, :604 orderRoutingLocationRule, :661 localPickup, :687
 * pickupPoint). Category is FUNCTION throughout; no placement/style (not in these
 * members). `requires` left to schema defaults + the barrel's modernize layer.
 */
import type { TemplateEntry } from '../types.js';

export const FUNCTIONS_SHIPPING_FULFILLMENT_ROUTING_TEMPLATES: TemplateEntry[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // functions.shippingDiscount (6) — cart.delivery-options.discounts.generate.run
  // ─────────────────────────────────────────────────────────────────────────────

  // FN-SHIP-01 — Free shipping over a spend threshold (UpCart reward-bar goal / the
  // universal "spend $X, ship free" native rate the drawer nudges toward).
  {
    id: 'FN-SHIP-01',
    name: 'Free Shipping Over Threshold',
    description:
      'Waives delivery for any cart above a spend threshold — the free-shipping goal an UpCart-style reward bar nudges toward, applied at checkout by the shipping Function.',
    category: 'FUNCTION',
    type: 'functions.shippingDiscount',
    icon: 'shipping',
    tags: ['upcart', 'shipping', 'free-shipping', 'threshold', 'cart', 'aov'],
    spec: {
      type: 'functions.shippingDiscount',
      name: 'Free Shipping Over Threshold',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [{ when: { minSubtotal: 75 }, apply: { shippingPercentage: 100 } }],
      },
    },
  },

  // FN-SHIP-02 — Shipping-level percentage discount (Discount Ninja shipping
  // entitlement: discount rates rather than waive them — half-off delivery promo).
  {
    id: 'FN-SHIP-02',
    name: 'Half-Off Shipping Promo',
    description:
      'Applies a partial (e.g. 50%) discount to delivery for qualifying carts — the discounted-delivery half of a Discount Ninja shipping-entitlement offer.',
    category: 'FUNCTION',
    type: 'functions.shippingDiscount',
    icon: 'shipping',
    tags: ['discount-ninja', 'shipping', 'discounted-delivery', 'promo', 'checkout'],
    spec: {
      type: 'functions.shippingDiscount',
      name: 'Half-Off Shipping Promo',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [{ when: { minSubtotal: 40 }, apply: { shippingPercentage: 50 } }],
      },
    },
  },

  // FN-SHIP-03 — Member free shipping keyed off the Bold Memberships customer TAG.
  // Honest: gate degrades to "no match" until Bold's billing engine tags the member.
  {
    id: 'FN-SHIP-03',
    name: 'Member Free Shipping',
    description:
      'Free delivery for tagged members — the Bold Memberships free-shipping perk gated on the member customer tag (applies only once the membership tag is present).',
    category: 'FUNCTION',
    type: 'functions.shippingDiscount',
    icon: 'shipping',
    tags: ['bold-memberships', 'shipping', 'free-shipping', 'members', 'loyalty', 'customer-tag'],
    spec: {
      type: 'functions.shippingDiscount',
      name: 'Member Free Shipping',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [{ when: { customerTags: ['member', 'vip'] }, apply: { shippingPercentage: 100 } }],
      },
    },
  },

  // FN-SHIP-04 — Tiered spend-to-ship-free via the pricing pack (free-shipping model).
  // Supersedes rules[]; lowers into the Function's rules via lowerPricingToShippingDiscount.
  {
    id: 'FN-SHIP-04',
    name: 'Spend-to-Ship-Free (Pricing Pack)',
    description:
      'Spend-threshold free shipping authored through the pricing vocabulary — a free-shipping gate that lowers into the shipping Function; pairs with a cart progress bar.',
    category: 'FUNCTION',
    type: 'functions.shippingDiscount',
    icon: 'shipping',
    tags: ['upcart', 'discount-ninja', 'shipping', 'free-shipping', 'pricing', 'threshold'],
    spec: {
      type: 'functions.shippingDiscount',
      name: 'Spend-to-Ship-Free (Pricing Pack)',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [{ when: { minSubtotal: 60 }, apply: { shippingPercentage: 100 } }],
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-discount',
          discount: { kind: 'free-shipping', value: 0 },
          gate: { minSubtotal: 60, customerTags: [], prerequisiteProductIds: [], prerequisiteCollectionIds: [] },
          stacking: {
            combinable: true,
            combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false },
            order: 'after',
          },
        },
      },
    },
  },

  // FN-SHIP-05 — Geo + quantity gated free shipping (Intuitive Shipping "free shipping
  // to these zones over N items"). Domestic-only, bulk-order waiver.
  {
    id: 'FN-SHIP-05',
    name: 'Domestic Bulk-Order Free Shipping',
    description:
      'Free delivery for domestic carts of N+ units — a country + quantity gated waiver mirroring an Intuitive Shipping zone-restricted free-shipping scenario.',
    category: 'FUNCTION',
    type: 'functions.shippingDiscount',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'free-shipping', 'geo', 'quantity', 'zone'],
    spec: {
      type: 'functions.shippingDiscount',
      name: 'Domestic Bulk-Order Free Shipping',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          { when: { countryCodeIn: ['US'], minQty: 3 }, apply: { shippingPercentage: 100 } },
          { when: { countryCodeIn: ['US'], minSubtotal: 50 }, apply: { shippingPercentage: 50 } },
        ],
      },
    },
  },

  // FN-SHIP-06 — VIP-tag + spend combined free shipping (Discount Ninja customer-tag
  // prerequisite × subtotal). Honest tag degrade until the VIP tag is applied.
  {
    id: 'FN-SHIP-06',
    name: 'VIP Spend Free Shipping',
    description:
      'Free delivery for VIP-tagged customers once they clear a spend floor — a customer-tag prerequisite combined with a subtotal gate (tag must be present to match).',
    category: 'FUNCTION',
    type: 'functions.shippingDiscount',
    icon: 'shipping',
    tags: ['discount-ninja', 'shipping', 'free-shipping', 'vip', 'customer-tag', 'spend'],
    spec: {
      type: 'functions.shippingDiscount',
      name: 'VIP Spend Free Shipping',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [{ when: { customerTags: ['vip'], minSubtotal: 100 }, apply: { shippingPercentage: 100 } }],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // functions.fulfillmentConstraints (4) — cart.fulfillment-constraints.generate.run
  // Only `skuIn` matches (productTagIn is parsed-but-inert); locations are Location GIDs.
  // ─────────────────────────────────────────────────────────────────────────────

  // FN-SHIP-07 — Hazmat / oversized SKUs ship alone (Intuitive Shipping "Pack
  // Separately" toggle → these lines must be their own parcel).
  {
    id: 'FN-SHIP-07',
    name: 'Hazmat Ship-Alone Constraint',
    description:
      'Forces flagged SKUs (hazmat, oversized, fragile) to ship as their own parcel — the fulfillment side of an Intuitive Shipping "pack separately" rule.',
    category: 'FUNCTION',
    type: 'functions.fulfillmentConstraints',
    icon: 'fulfillment',
    tags: ['intuitive-shipping', 'fulfillment', 'ship-alone', 'hazmat', 'pack-separately'],
    spec: {
      type: 'functions.fulfillmentConstraints',
      name: 'Hazmat Ship-Alone Constraint',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          { when: { skuIn: ['HAZMAT-AEROSOL', 'HAZMAT-BATTERY', 'OVERSIZE-SURFBOARD'] }, apply: { shipAlone: true } },
        ],
      },
    },
  },

  // FN-SHIP-08 — Group a cold-chain / same-shipment set together (Intuitive Shipping
  // "blend / group" — perishables travel in one insulated shipment).
  {
    id: 'FN-SHIP-08',
    name: 'Cold-Chain Group Constraint',
    description:
      'Keeps perishable / cold-chain SKUs in a single grouped shipment so they travel together — an Intuitive Shipping grouping constraint for temperature-sensitive goods.',
    category: 'FUNCTION',
    type: 'functions.fulfillmentConstraints',
    icon: 'fulfillment',
    tags: ['intuitive-shipping', 'fulfillment', 'group', 'cold-chain', 'perishable'],
    spec: {
      type: 'functions.fulfillmentConstraints',
      name: 'Cold-Chain Group Constraint',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          { when: { skuIn: ['FROZEN-MEAL-01', 'FROZEN-MEAL-02', 'ICE-PACK'] }, apply: { groupWithTag: 'cold-chain' } },
        ],
      },
    },
  },

  // FN-SHIP-09 — SKUs must fulfill from a specific fulfillment location (Intuitive
  // Shipping multi-origin: this made-to-order line only ships from the craft warehouse).
  {
    id: 'FN-SHIP-09',
    name: 'Made-to-Order From Origin Constraint',
    description:
      'Requires made-to-order SKUs to fulfill from a designated location (craft / MTO warehouse) — an Intuitive Shipping multi-origin constraint pinning lines to one origin.',
    category: 'FUNCTION',
    type: 'functions.fulfillmentConstraints',
    icon: 'fulfillment',
    tags: ['intuitive-shipping', 'fulfillment', 'multi-origin', 'made-to-order', 'location'],
    spec: {
      type: 'functions.fulfillmentConstraints',
      name: 'Made-to-Order From Origin Constraint',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          {
            when: { skuIn: ['MTO-DESK-OAK', 'MTO-SHELF-WALNUT'] },
            apply: { mustFulfillFromLocationIds: ['gid://shopify/Location/101122334455'] },
          },
        ],
      },
    },
  },

  // FN-SHIP-10 — Combined: heavy freight SKUs both ship alone AND fulfill from the
  // freight-dock location (Intuitive Shipping heavy-goods scenario).
  {
    id: 'FN-SHIP-10',
    name: 'Freight-Dock Heavy-Goods Constraint',
    description:
      'Heavy freight SKUs ship as their own shipment and fulfill from the freight-dock location — a combined ship-alone + must-fulfill-from Intuitive Shipping heavy-goods rule.',
    category: 'FUNCTION',
    type: 'functions.fulfillmentConstraints',
    icon: 'fulfillment',
    tags: ['intuitive-shipping', 'fulfillment', 'freight', 'ship-alone', 'location'],
    spec: {
      type: 'functions.fulfillmentConstraints',
      name: 'Freight-Dock Heavy-Goods Constraint',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          {
            when: { skuIn: ['FREIGHT-PALLET-TILE', 'FREIGHT-APPLIANCE'] },
            apply: { shipAlone: true, mustFulfillFromLocationIds: ['gid://shopify/Location/202233445566'] },
          },
        ],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // functions.orderRoutingLocationRule (3) — prefer an origin/location per rule.
  // Multi-origin routing (Intuitive Shipping "unlimited origins", intuitive-shipping.md:40).
  // ─────────────────────────────────────────────────────────────────────────────

  // FN-SHIP-11 — Route EU-destination orders to the EU fulfillment hub (Intuitive
  // Shipping origin selection by destination country → cheaper/faster cross-border).
  {
    id: 'FN-SHIP-11',
    name: 'Route EU Orders to EU Hub',
    description:
      'Prefers the EU fulfillment hub for EU-destination orders so cross-border parcels ship from the nearest origin — an Intuitive Shipping destination-based routing rule.',
    category: 'FUNCTION',
    type: 'functions.orderRoutingLocationRule',
    icon: 'routing',
    tags: ['intuitive-shipping', 'order-routing', 'multi-origin', 'geo', 'location'],
    spec: {
      type: 'functions.orderRoutingLocationRule',
      name: 'Route EU Orders to EU Hub',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          {
            when: { countryCode: 'DE' },
            apply: { preferLocationId: 'gid://shopify/Location/303344556677', priority: 10 },
          },
        ],
      },
    },
  },

  // FN-SHIP-12 — Prefer the primary warehouse when it holds inventory; fall back by
  // priority (Intuitive Shipping origin priority ordering across warehouses).
  {
    id: 'FN-SHIP-12',
    name: 'Primary Warehouse Priority Routing',
    description:
      'Ranks the primary warehouse first and a secondary origin next when the primary holds stock — a priority-ordered multi-warehouse routing rule (Intuitive Shipping origins).',
    category: 'FUNCTION',
    type: 'functions.orderRoutingLocationRule',
    icon: 'routing',
    tags: ['intuitive-shipping', 'order-routing', 'inventory', 'priority', 'warehouse'],
    spec: {
      type: 'functions.orderRoutingLocationRule',
      name: 'Primary Warehouse Priority Routing',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          {
            when: { inventoryLocationIds: ['gid://shopify/Location/404455667788'] },
            apply: { preferLocationId: 'gid://shopify/Location/404455667788', priority: 100 },
          },
          {
            when: { inventoryLocationIds: ['gid://shopify/Location/505566778899'] },
            apply: { preferLocationId: 'gid://shopify/Location/505566778899', priority: 50 },
          },
        ],
      },
    },
  },

  // FN-SHIP-13 — Route domestic orders to the domestic distribution center, everything
  // else to the international origin (destination-split routing, Intuitive Shipping).
  {
    id: 'FN-SHIP-13',
    name: 'Domestic vs International Routing Split',
    description:
      'Sends US orders to the domestic distribution center and routes remaining destinations through the international origin — a destination-split multi-origin routing rule.',
    category: 'FUNCTION',
    type: 'functions.orderRoutingLocationRule',
    icon: 'routing',
    tags: ['intuitive-shipping', 'order-routing', 'geo', 'multi-origin', 'distribution'],
    spec: {
      type: 'functions.orderRoutingLocationRule',
      name: 'Domestic vs International Routing Split',
      category: 'FUNCTION',
      requires: [],
      config: {
        rules: [
          {
            when: { countryCode: 'US' },
            apply: { preferLocationId: 'gid://shopify/Location/606677889900', priority: 90 },
          },
          {
            when: { inventoryLocationIds: ['gid://shopify/Location/707788990011'] },
            apply: { preferLocationId: 'gid://shopify/Location/707788990011', priority: 20 },
          },
        ],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // functions.localPickupDeliveryOption (2) — BOPIS. NEEDS_RUNTIME (unstable API only,
  // verified 2026-07-04). Authored honestly; not implied deployable today.
  // ─────────────────────────────────────────────────────────────────────────────

  // FN-SHIP-14 — Store-pickup at a single flagship location (Zapiet/Store-Pickup-style
  // BOPIS surfaced via the local-pickup generator).
  {
    id: 'FN-SHIP-14',
    name: 'Flagship Store Pickup (BOPIS)',
    description:
      'Offers free in-store pickup at a flagship location at checkout — a BOPIS local-pickup option (needs_runtime until the generator API ships on a stable Shopify version).',
    category: 'FUNCTION',
    type: 'functions.localPickupDeliveryOption',
    icon: 'pickup',
    tags: ['intuitive-shipping', 'local-pickup', 'bopis', 'pickup', 'checkout', 'needs-runtime'],
    spec: {
      type: 'functions.localPickupDeliveryOption',
      name: 'Flagship Store Pickup (BOPIS)',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        locations: [
          {
            locationId: 'gid://shopify/Location/808899001122',
            cost: 0,
            title: 'Pick up at our flagship store',
            pickupInstruction: 'Ready in 2 hours during store hours. Bring your order confirmation and photo ID.',
          },
        ],
      },
    },
  },

  // FN-SHIP-15 — Multi-location pickup network (several stores, some with a small
  // handling fee) — the multi-origin BOPIS grid Intuitive Shipping merchants run.
  {
    id: 'FN-SHIP-15',
    name: 'Multi-Store Pickup Network (BOPIS)',
    description:
      'Presents a network of store-pickup locations at checkout (free or small handling fee per store) — a multi-location BOPIS option; needs_runtime until the API is stable.',
    category: 'FUNCTION',
    type: 'functions.localPickupDeliveryOption',
    icon: 'pickup',
    tags: ['intuitive-shipping', 'local-pickup', 'bopis', 'multi-location', 'pickup', 'needs-runtime'],
    spec: {
      type: 'functions.localPickupDeliveryOption',
      name: 'Multi-Store Pickup Network (BOPIS)',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        locations: [
          {
            locationId: 'gid://shopify/Location/909900112233',
            cost: 0,
            title: 'Downtown store',
            pickupInstruction: 'Ready same day if ordered before 3pm.',
          },
          {
            locationId: 'gid://shopify/Location/111200334455',
            cost: 2.5,
            title: 'Airport kiosk',
            pickupInstruction: 'Ready next business day. $2.50 handling.',
          },
        ],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // functions.pickupPointDeliveryOption (1) — parcel lockers / post offices.
  // NEEDS_RUNTIME (unstable API only, verified 2026-07-04). Full third-party identity.
  // ─────────────────────────────────────────────────────────────────────────────

  // FN-SHIP-16 — Parcel-locker pickup point (carrier third-party drop-off), the
  // pickup-point generator surface. Honest needs_runtime.
  {
    id: 'FN-SHIP-16',
    name: 'Parcel Locker Pickup Point',
    description:
      'Offers a third-party parcel-locker pickup point at checkout with the provider identity and address — needs_runtime until the pickup-point generator API ships on a stable version.',
    category: 'FUNCTION',
    type: 'functions.pickupPointDeliveryOption',
    icon: 'pickup',
    tags: ['pickup-point', 'parcel-locker', 'carrier', 'checkout', 'delivery', 'needs-runtime'],
    spec: {
      type: 'functions.pickupPointDeliveryOption',
      name: 'Parcel Locker Pickup Point',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        points: [
          {
            externalId: 'LOCKER-DE-10115-004',
            name: 'PackStation 004 — Mitte',
            cost: 0,
            provider: {
              name: 'ParcelLocker Network',
              logoUrl: 'https://cdn.example.com/carriers/parcel-locker.png',
            },
            address: {
              address1: 'Invalidenstrasse 112',
              city: 'Berlin',
              countryCode: 'DE',
              province: 'Berlin',
              provinceCode: 'BE',
              zip: '10115',
              latitude: 52.5304,
              longitude: 13.3849,
            },
            countryCodeIn: ['DE'],
          },
        ],
      },
    },
  },
];
