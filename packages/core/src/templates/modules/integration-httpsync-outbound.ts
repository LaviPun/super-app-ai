import type { TemplateEntry } from '../types.js';

/**
 * integration.httpSync — outbound sync to a merchant-connected service +
 * inbound reconciliation, keyed on SUBSCRIBED Shopify webhook triggers only.
 *
 * Honesty posture (034 §GAP-8, §buildsNeeded #7): integration.httpSync is an
 * outbound dispatcher — it forwards a mapped payload to the merchant's connected
 * connector endpoint when a subscribed webhook fires. It does NOT stand up the
 * third-party platform (contact/event store, automation engine, billing clock)
 * that the corpus apps (Klaviyo, Omnisend, Brevo/PushOwl, Recharge, Loop,
 * Intuitive Shipping) run in their own cloud — those exceed a single module (see
 * each record's mapping_note). What this type honestly owns is the Shopify-side
 * capture→map→forward tap into that cloud.
 *
 * Trigger discipline: ONLY the four subscribed webhook triggers are used here —
 * SHOPIFY_WEBHOOK_ORDER_CREATED, SHOPIFY_WEBHOOK_PRODUCT_UPDATED,
 * SHOPIFY_WEBHOOK_CUSTOMER_CREATED, SHOPIFY_WEBHOOK_COLLECTION_CREATED. No
 * fulfillment/draft-order triggers, no MANUAL/SCHEDULED (those webhook
 * subscriptions are not authored by this unit).
 *
 * Vocab is authored strictly against the integration.httpSync config member
 * (recipe.ts): { connectorId, endpointPath (^/[a-z0-9-/]{1,200}$), trigger,
 * payloadMapping: Record<string,string> }. `requires` is left to the schema
 * default ([]) + the barrel's modernize pass.
 */
export const INTEG_TEMPLATES: TemplateEntry[] = [
  {
    id: 'INTEG-01',
    name: 'Klaviyo — Placed Order → Profile Event Sync',
    description:
      'On every order/create, forward the order + buyer identity to a connected Klaviyo integration so the Placed Order metric and profile update in Klaviyo\'s cloud.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['klaviyo', 'email', 'sync', 'order', 'profile', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Klaviyo — Placed Order → Profile Event Sync',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'klaviyo',
        endpointPath: '/klaviyo/events/placed-order',
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        // Maps Shopify order fields → Klaviyo profile + Placed Order metric
        // properties. Profile is deduped by email/phone in Klaviyo's cloud.
        payloadMapping: {
          'profile.email': 'order.email',
          'profile.phone_number': 'order.phone',
          'profile.first_name': 'order.customer.first_name',
          'profile.last_name': 'order.customer.last_name',
          'metric.name': 'literal:Placed Order',
          'properties.$value': 'order.total_price',
          'properties.order_id': 'order.id',
          'properties.currency': 'order.currency',
          'properties.items': 'order.line_items',
        },
      },
    },
  },
  {
    id: 'INTEG-02',
    name: 'Klaviyo — New Customer → Subscriber Profile',
    description:
      'On customer/create, push the new customer (email, marketing consent, name) to a connected Klaviyo integration to create or update the subscriber profile.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['klaviyo', 'email', 'sync', 'customer', 'consent', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Klaviyo — New Customer → Subscriber Profile',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'klaviyo',
        endpointPath: '/klaviyo/profiles/upsert',
        trigger: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
        // Consent is honored downstream: Klaviyo only sets email-subscribed
        // when accepts_marketing is true. This tap forwards the signal; it
        // does not itself subscribe.
        payloadMapping: {
          'profile.email': 'customer.email',
          'profile.phone_number': 'customer.phone',
          'profile.first_name': 'customer.first_name',
          'profile.last_name': 'customer.last_name',
          'profile.consent.email': 'customer.email_marketing_consent.state',
          'profile.consent.sms': 'customer.sms_marketing_consent.state',
          'profile.properties.shopify_customer_id': 'customer.id',
          'profile.properties.tags': 'customer.tags',
        },
      },
    },
  },
  {
    id: 'INTEG-03',
    name: 'Omnisend — Order → Contact + Event Sync',
    description:
      'On order/create, sync the order to a connected Omnisend integration so the contact record and Placed Order event update in Omnisend\'s cloud contact timeline.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['omnisend', 'email', 'sync', 'order', 'contact', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Omnisend — Order → Contact + Event Sync',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'omnisend',
        endpointPath: '/omnisend/events/placed-order',
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        // Omnisend keys the contact by email/phone and appends a placedOrder
        // event to that person's timeline (feeds real-time segments).
        payloadMapping: {
          'contact.email': 'order.email',
          'contact.phone': 'order.phone',
          'event.type': 'literal:placedOrder',
          'event.orderId': 'order.id',
          'event.value': 'order.total_price',
          'event.currency': 'order.currency',
          'event.products': 'order.line_items',
          'event.timestamp': 'order.created_at',
        },
      },
    },
  },
  {
    id: 'INTEG-04',
    name: 'Omnisend — Product Update → Catalog Reconcile',
    description:
      'On product/update, re-sync the product (title, price, inventory, image) to a connected Omnisend integration to reconcile its catalog for recommendation and price-drop use.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['omnisend', 'sync', 'product', 'catalog', 'reconcile', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Omnisend — Product Update → Catalog Reconcile',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'omnisend',
        endpointPath: '/omnisend/catalog/reconcile',
        trigger: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        // Inbound reconciliation: Omnisend re-reads the mapped product state so
        // its cloud catalog (used by the product-recommendation block + price
        // -drop triggers) stays consistent with Shopify.
        payloadMapping: {
          'product.productID': 'product.id',
          'product.title': 'product.title',
          'product.status': 'product.status',
          'product.price': 'product.variants.0.price',
          'product.inventory': 'product.variants.0.inventory_quantity',
          'product.imageURL': 'product.image.src',
          'product.updatedAt': 'product.updated_at',
        },
      },
    },
  },
  {
    id: 'INTEG-05',
    name: 'Brevo PushOwl — Back-in-Stock Reconcile',
    description:
      'On product/update, forward inventory + price to a connected Brevo/PushOwl integration so its back-in-stock and price-drop waitlists reconcile and fire web-push automations.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['pushowl', 'brevo', 'web-push', 'back-in-stock', 'product', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Brevo PushOwl — Back-in-Stock Reconcile',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'pushowl',
        endpointPath: '/pushowl/inventory/reconcile',
        trigger: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        // Honest scope: this forwards the inventory/price signal. The actual
        // waitlist match + outbound web-push send happens in Brevo/PushOwl's
        // backend against its own subscriber-token store — not in this module.
        payloadMapping: {
          'product.external_id': 'product.id',
          'product.variant_inventory': 'product.variants.0.inventory_quantity',
          'product.price': 'product.variants.0.price',
          'product.available': 'product.variants.0.available',
          'product.hero_image': 'product.image.src',
          'product.landing_url': 'product.handle',
        },
      },
    },
  },
  {
    id: 'INTEG-06',
    name: 'Recharge — New Order → Subscription Sync',
    description:
      'On order/create, forward the order + customer reference to a connected Recharge integration to reconcile subscription/charge state keyed to the Shopify customer.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['recharge', 'subscriptions', 'sync', 'order', 'customer', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Recharge — New Order → Subscription Sync',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'recharge',
        endpointPath: '/recharge/orders/sync',
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        // Recharge keys Customer/Subscription/Charge to external_customer_id
        // (the Shopify customer id). This tap forwards the order so Recharge's
        // backend can reflect it against the subscription contract it owns.
        payloadMapping: {
          'order.external_order_id': 'order.id',
          'order.external_customer_id': 'order.customer.id',
          'order.email': 'order.email',
          'order.total': 'order.total_price',
          'order.currency': 'order.currency',
          'order.line_items': 'order.line_items',
          'order.created_at': 'order.created_at',
        },
      },
    },
  },
  {
    id: 'INTEG-07',
    name: 'Loop Subscriptions — Customer → Contract Reconcile',
    description:
      'On customer/create, push the customer to a connected Loop Subscriptions integration to reconcile the subscriber record its subscription contracts and Flows key off.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['loop', 'subscriptions', 'sync', 'customer', 'contract', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Loop Subscriptions — Customer → Contract Reconcile',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'loop-subscriptions',
        endpointPath: '/loop/customers/reconcile',
        trigger: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
        // Loop's When-If-Then Flows + portal read a subscription contract keyed
        // to the customer. This forwards the new customer so Loop can align its
        // customer_ref; contract lifecycle itself lives in Loop's backend.
        payloadMapping: {
          'customer.external_id': 'customer.id',
          'customer.email': 'customer.email',
          'customer.phone': 'customer.phone',
          'customer.first_name': 'customer.first_name',
          'customer.last_name': 'customer.last_name',
          'customer.tags': 'customer.tags',
          'customer.total_spent': 'customer.total_spent',
        },
      },
    },
  },
  {
    id: 'INTEG-08',
    name: 'Intuitive Shipping — Collection → Zone Rule Reconcile',
    description:
      'On collection/create, forward the collection to a connected Intuitive Shipping integration so its scenario/zone conditions that target by collection stay reconciled.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tags: ['intuitive-shipping', 'shipping', 'sync', 'collection', 'reconcile', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Intuitive Shipping — Collection → Zone Rule Reconcile',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'intuitive-shipping',
        endpointPath: '/intuitive-shipping/collections/reconcile',
        trigger: 'SHOPIFY_WEBHOOK_COLLECTION_CREATED',
        // Intuitive Shipping's Product conditions target Collections. This
        // forwards a new collection so the app's server-side rate-rule store
        // (scenarios/zones/conditions) can reconcile its collection references.
        payloadMapping: {
          'collection.external_id': 'collection.id',
          'collection.title': 'collection.title',
          'collection.handle': 'collection.handle',
          'collection.products_count': 'collection.products_count',
          'collection.updated_at': 'collection.updated_at',
        },
      },
    },
  },
];
