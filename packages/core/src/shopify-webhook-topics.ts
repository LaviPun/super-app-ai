/**
 * Shopify webhook topic registry — the single source of truth that links a Shopify
 * Admin webhook **topic** (e.g. `orders/create`) to:
 *   - a canonical flow **trigger** id (`shopify.order.created`, matching FLOW_TRIGGERS),
 *   - the access **scope** it requires (or null when none beyond install),
 *   - a UI **category** + the reference fields the payload carries,
 *   - the **legacy** FlowRunnerService trigger enum (back-compat for stored flows).
 *
 * Used in three places so "select a trigger and start working" is real, not cosmetic:
 *   1. `shopify.app.toml` subscribes every topic whose scope is granted (always-on set).
 *   2. The generic `/webhooks` route maps any incoming topic → trigger → FlowRunner.
 *   3. The flow builder lists every topic as a selectable trigger (with scope status).
 *
 * Topic strings + scope names are validated against Admin 2026-04 via
 * `shopify app config validate` before deploy. Topics whose scope is NOT granted
 * still appear in the catalog (shown as "enable scope X"); they are not subscribed.
 */

export interface ShopifyWebhookTopic {
  /** Shopify webhook topic, lower-case slash form, e.g. `orders/create`. */
  topic: string;
  /** Canonical flow trigger id (matches FLOW_TRIGGERS), e.g. `shopify.order.created`. */
  trigger: string;
  /** Human label for the trigger picker. */
  label: string;
  /** UI grouping. */
  category: string;
  /** Access scope this topic requires for delivery, or null if none beyond install. */
  scope: string | null;
  /** Reference fields present on the payload (drives expression auto-complete). */
  referenceFields?: string[];
  /** Legacy FlowRunnerService trigger enum, for back-compat with stored flows. */
  legacy?: string;
  /**
   * Some topics (e.g. metaobjects/*) require a subscription `filter` and so cannot be
   * subscribed via a plain topic list — excluded from the always-on toml set until a
   * filtered subscription is authored. Still selectable in the catalog.
   */
  requiresFilter?: boolean;
}

/**
 * Scopes actually granted by `shopify.app.toml` (write_* implies read_*). Topics whose
 * `scope` is in this set are subscribed automatically (the "select and go" set); topics
 * whose scope is NOT here stay selectable-but-unsubscribed (`isTopicGranted` → false),
 * so callers must not offer them as live.
 *
 * MUST mirror the `access_scopes.scopes` line in `shopify.app.toml` exactly. The toml
 * currently grants: read_customers, read_metaobjects, read_products, read_themes,
 * write_app_proxy, write_customers, write_metaobjects, write_orders. Do NOT list a scope
 * here that the toml does not request — doing so lets `alwaysOnWebhookTopics()` /
 * `isTopicGranted()` advertise topics Shopify will never deliver (e.g. fulfillments/create
 * needs read_fulfillments, draft_orders/create needs read_draft_orders — neither is
 * granted). Add the scope to the toml AND here together when that delivery is needed.
 */
export const GRANTED_WEBHOOK_SCOPES = new Set<string>([
  'read_orders', 'write_orders', // write_orders is granted (implies read_orders)
  'read_products', // granted directly in the toml
  'read_customers', 'write_customers',
  'read_metaobjects', 'write_metaobjects',
  'read_themes',
]);

export const SHOPIFY_WEBHOOK_TOPICS: ShopifyWebhookTopic[] = [
  // ─── Orders ───
  { topic: 'orders/create', trigger: 'shopify.order.created', label: 'Order created', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference', 'customer_reference'], legacy: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
  { topic: 'orders/updated', trigger: 'shopify.order.updated', label: 'Order updated', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'orders/cancelled', trigger: 'shopify.order.cancelled', label: 'Order cancelled', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'orders/fulfilled', trigger: 'shopify.order.fulfilled', label: 'Order fulfilled', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'orders/partially_fulfilled', trigger: 'shopify.order.partially_fulfilled', label: 'Order partially fulfilled', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'orders/paid', trigger: 'shopify.order.paid', label: 'Order paid', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'orders/edited', trigger: 'shopify.order.edited', label: 'Order edited', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'orders/delete', trigger: 'shopify.order.deleted', label: 'Order deleted', category: 'Orders', scope: 'read_orders' },
  { topic: 'order_transactions/create', trigger: 'shopify.order.transaction_created', label: 'Order transaction created', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'refunds/create', trigger: 'shopify.order.refunded', label: 'Order refund created', category: 'Orders', scope: 'read_orders', referenceFields: ['order_reference'] },
  { topic: 'tender_transactions/create', trigger: 'shopify.tender_transaction.created', label: 'Tender transaction created', category: 'Financial', scope: 'read_orders', referenceFields: ['order_reference'] },

  // ─── Draft orders ───
  { topic: 'draft_orders/create', trigger: 'shopify.draft_order.created', label: 'Draft order created', category: 'Orders', scope: 'read_draft_orders', referenceFields: ['order_reference'], legacy: 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED' },
  { topic: 'draft_orders/update', trigger: 'shopify.draft_order.updated', label: 'Draft order updated', category: 'Orders', scope: 'read_draft_orders' },
  { topic: 'draft_orders/delete', trigger: 'shopify.draft_order.deleted', label: 'Draft order deleted', category: 'Orders', scope: 'read_draft_orders' },

  // ─── Checkouts ───
  { topic: 'checkouts/create', trigger: 'shopify.checkout.created', label: 'Checkout created', category: 'Checkout', scope: 'read_orders', referenceFields: ['customer_reference'] },
  { topic: 'checkouts/update', trigger: 'shopify.checkout.updated', label: 'Checkout updated', category: 'Checkout', scope: 'read_orders', referenceFields: ['customer_reference'] },
  { topic: 'checkouts/delete', trigger: 'shopify.checkout.deleted', label: 'Checkout deleted', category: 'Checkout', scope: 'read_orders' },

  // ─── Customers ───
  { topic: 'customers/create', trigger: 'shopify.customer.created', label: 'Customer created', category: 'Customers', scope: 'read_customers', referenceFields: ['customer_reference'], legacy: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED' },
  { topic: 'customers/update', trigger: 'shopify.customer.updated', label: 'Customer updated', category: 'Customers', scope: 'read_customers', referenceFields: ['customer_reference'] },
  { topic: 'customers/delete', trigger: 'shopify.customer.deleted', label: 'Customer deleted', category: 'Customers', scope: 'read_customers' },
  { topic: 'customers/enable', trigger: 'shopify.customer.enabled', label: 'Customer account enabled', category: 'Customers', scope: 'read_customers', referenceFields: ['customer_reference'] },
  { topic: 'customers/disable', trigger: 'shopify.customer.disabled', label: 'Customer account disabled', category: 'Customers', scope: 'read_customers', referenceFields: ['customer_reference'] },
  { topic: 'customers/merge', trigger: 'shopify.customer.merged', label: 'Customers merged', category: 'Customers', scope: 'read_customer_merge' },
  { topic: 'customers_marketing_consent/update', trigger: 'shopify.customer.email_subscribed', label: 'Customer marketing consent updated', category: 'Customers', scope: 'read_customers', referenceFields: ['customer_reference'] },

  // ─── Products ───
  { topic: 'products/create', trigger: 'shopify.product.created', label: 'Product created', category: 'Products', scope: 'read_products', referenceFields: ['product_reference'] },
  { topic: 'products/update', trigger: 'shopify.product.updated', label: 'Product updated', category: 'Products', scope: 'read_products', referenceFields: ['product_reference'], legacy: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' },
  { topic: 'products/delete', trigger: 'shopify.product.deleted', label: 'Product deleted', category: 'Products', scope: 'read_products' },

  // ─── Collections ───
  { topic: 'collections/create', trigger: 'shopify.collection.created', label: 'Collection created', category: 'Collections', scope: 'read_products', legacy: 'SHOPIFY_WEBHOOK_COLLECTION_CREATED' },
  { topic: 'collections/update', trigger: 'shopify.collection.updated', label: 'Collection updated', category: 'Collections', scope: 'read_products' },
  { topic: 'collections/delete', trigger: 'shopify.collection.deleted', label: 'Collection deleted', category: 'Collections', scope: 'read_products' },

  // ─── Inventory ───
  { topic: 'inventory_levels/connect', trigger: 'shopify.inventory.level_connected', label: 'Inventory level connected', category: 'Inventory', scope: 'read_inventory' },
  { topic: 'inventory_levels/update', trigger: 'shopify.inventory.quantity_changed', label: 'Inventory quantity changed', category: 'Inventory', scope: 'read_inventory', referenceFields: ['product_reference'] },
  { topic: 'inventory_levels/disconnect', trigger: 'shopify.inventory.level_disconnected', label: 'Inventory level disconnected', category: 'Inventory', scope: 'read_inventory' },
  { topic: 'inventory_items/create', trigger: 'shopify.inventory.item_created', label: 'Inventory item created', category: 'Inventory', scope: 'read_inventory' },
  { topic: 'inventory_items/update', trigger: 'shopify.inventory.item_updated', label: 'Inventory item updated', category: 'Inventory', scope: 'read_inventory' },
  { topic: 'inventory_items/delete', trigger: 'shopify.inventory.item_deleted', label: 'Inventory item deleted', category: 'Inventory', scope: 'read_inventory' },

  // ─── Fulfillments ───
  { topic: 'fulfillments/create', trigger: 'shopify.fulfillment.created', label: 'Fulfillment created', category: 'Fulfillment', scope: 'read_fulfillments', referenceFields: ['order_reference'], legacy: 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED' },
  { topic: 'fulfillments/update', trigger: 'shopify.fulfillment.updated', label: 'Fulfillment updated', category: 'Fulfillment', scope: 'read_fulfillments', referenceFields: ['order_reference'] },
  { topic: 'fulfillment_events/create', trigger: 'shopify.fulfillment.event_created', label: 'Fulfillment event created', category: 'Fulfillment', scope: 'read_fulfillments' },

  // ─── Fulfillment orders (order routing) ───
  { topic: 'fulfillment_orders/order_routing_complete', trigger: 'shopify.fulfillment_order.routing_complete', label: 'Order routing complete', category: 'Fulfillment', scope: 'read_merchant_managed_fulfillment_orders', referenceFields: ['order_reference'] },
  { topic: 'fulfillment_orders/moved', trigger: 'shopify.fulfillment_order.moved', label: 'Fulfillment order moved', category: 'Fulfillment', scope: 'read_merchant_managed_fulfillment_orders', referenceFields: ['order_reference'] },
  { topic: 'fulfillment_orders/placed_on_hold', trigger: 'shopify.fulfillment_order.placed_on_hold', label: 'Fulfillment order placed on hold', category: 'Fulfillment', scope: 'read_merchant_managed_fulfillment_orders' },
  { topic: 'fulfillment_orders/fulfillment_request_submitted', trigger: 'shopify.fulfillment_order.request_submitted', label: 'Fulfillment request submitted', category: 'Fulfillment', scope: 'read_merchant_managed_fulfillment_orders' },
  { topic: 'fulfillment_orders/cancelled', trigger: 'shopify.fulfillment_order.cancelled', label: 'Fulfillment order cancelled', category: 'Fulfillment', scope: 'read_merchant_managed_fulfillment_orders' },

  // ─── Returns ───
  { topic: 'returns/request', trigger: 'shopify.return.requested', label: 'Return requested', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },
  { topic: 'returns/approve', trigger: 'shopify.return.approved', label: 'Return approved', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },
  { topic: 'returns/decline', trigger: 'shopify.return.declined', label: 'Return declined', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },
  { topic: 'returns/cancel', trigger: 'shopify.return.cancelled', label: 'Return cancelled', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },
  { topic: 'returns/close', trigger: 'shopify.return.closed', label: 'Return closed', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },
  { topic: 'returns/reopen', trigger: 'shopify.return.reopened', label: 'Return reopened', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },
  { topic: 'returns/update', trigger: 'shopify.return.updated', label: 'Return updated', category: 'Returns', scope: 'read_returns', referenceFields: ['order_reference'] },

  // ─── Discounts ───
  { topic: 'discounts/create', trigger: 'shopify.discount.created', label: 'Discount created', category: 'Discounts', scope: 'read_discounts' },
  { topic: 'discounts/update', trigger: 'shopify.discount.updated', label: 'Discount updated', category: 'Discounts', scope: 'read_discounts' },
  { topic: 'discounts/delete', trigger: 'shopify.discount.deleted', label: 'Discount deleted', category: 'Discounts', scope: 'read_discounts' },

  // ─── Themes (online store) ───
  { topic: 'themes/publish', trigger: 'shopify.theme.published', label: 'Theme published', category: 'Online Store', scope: 'read_themes' },
  { topic: 'themes/update', trigger: 'shopify.theme.updated', label: 'Theme updated', category: 'Online Store', scope: 'read_themes' },

  // ─── Custom data ───
  { topic: 'metaobjects/create', trigger: 'shopify.metaobject.created', label: 'Metaobject created', category: 'Custom Data', scope: 'read_metaobjects', requiresFilter: true },
  { topic: 'metaobjects/update', trigger: 'shopify.metaobject.updated', label: 'Metaobject updated', category: 'Custom Data', scope: 'read_metaobjects', requiresFilter: true },
  { topic: 'metaobjects/delete', trigger: 'shopify.metaobject.deleted', label: 'Metaobject deleted', category: 'Custom Data', scope: 'read_metaobjects', requiresFilter: true },

  // ─── Shop / app lifecycle (no extra scope) ───
  { topic: 'shop/update', trigger: 'shopify.shop.updated', label: 'Shop settings updated', category: 'Store', scope: null },

  // ─── Subscriptions (require read_own_subscription_contracts — not granted by default) ───
  { topic: 'subscription_contracts/create', trigger: 'shopify.subscription.contract_created', label: 'Subscription contract created', category: 'Subscriptions', scope: 'read_own_subscription_contracts', referenceFields: ['customer_reference'] },
  { topic: 'subscription_contracts/update', trigger: 'shopify.subscription.contract_updated', label: 'Subscription contract updated', category: 'Subscriptions', scope: 'read_own_subscription_contracts', referenceFields: ['customer_reference'] },
  { topic: 'subscription_billing_attempts/success', trigger: 'shopify.subscription.billing_success', label: 'Subscription billing succeeded', category: 'Subscriptions', scope: 'read_own_subscription_contracts', referenceFields: ['customer_reference'] },
  { topic: 'subscription_billing_attempts/failure', trigger: 'shopify.subscription.billing_attempt_failed', label: 'Subscription billing failed', category: 'Subscriptions', scope: 'read_own_subscription_contracts', referenceFields: ['customer_reference'] },

  // ─── B2B companies (require read_customers — granted, but B2B feature must be on) ───
  { topic: 'companies/create', trigger: 'shopify.company.created', label: 'Company created', category: 'B2B', scope: 'read_customers' },
  { topic: 'companies/update', trigger: 'shopify.company.updated', label: 'Company updated', category: 'B2B', scope: 'read_customers' },
  { topic: 'companies/delete', trigger: 'shopify.company.deleted', label: 'Company deleted', category: 'B2B', scope: 'read_customers' },
];

// ─── Lookups ──────────────────────────────────────────────────────────

const TOPIC_INDEX = new Map(SHOPIFY_WEBHOOK_TOPICS.map((t) => [t.topic.toLowerCase(), t]));
const TRIGGER_INDEX = new Map(SHOPIFY_WEBHOOK_TOPICS.map((t) => [t.trigger, t]));
const LEGACY_INDEX = new Map(
  SHOPIFY_WEBHOOK_TOPICS.filter((t) => t.legacy).map((t) => [t.legacy as string, t]),
);

/** Map a raw Shopify webhook topic (any case / form) to its canonical trigger id. */
export function topicToTrigger(topic: string): string | null {
  return TOPIC_INDEX.get(String(topic).toLowerCase().trim())?.trigger ?? null;
}

/** Look up a topic registry entry by its Shopify topic. */
export function getWebhookTopic(topic: string): ShopifyWebhookTopic | null {
  return TOPIC_INDEX.get(String(topic).toLowerCase().trim()) ?? null;
}

/**
 * Normalize a flow's stored trigger to the canonical id: accepts the canonical id,
 * a legacy `SHOPIFY_WEBHOOK_*` enum, or a raw topic. Returns the input unchanged when
 * it is already a non-webhook trigger (MANUAL, SCHEDULED, superapp.*).
 */
export function normalizeTrigger(trigger: string): string {
  if (TRIGGER_INDEX.has(trigger)) return trigger;
  const byLegacy = LEGACY_INDEX.get(trigger);
  if (byLegacy) return byLegacy.trigger;
  const byTopic = topicToTrigger(trigger);
  return byTopic ?? trigger;
}

/** Is this topic deliverable with the given granted scopes? */
export function isTopicGranted(topic: ShopifyWebhookTopic, granted: Set<string> = GRANTED_WEBHOOK_SCOPES): boolean {
  return topic.scope === null || granted.has(topic.scope);
}

/**
 * Topics subscribed automatically in `shopify.app.toml` (the "select and go" set):
 * scope is granted AND no per-topic subscription filter is required.
 */
export function alwaysOnWebhookTopics(granted: Set<string> = GRANTED_WEBHOOK_SCOPES): ShopifyWebhookTopic[] {
  return SHOPIFY_WEBHOOK_TOPICS.filter((t) => isTopicGranted(t, granted) && !t.requiresFilter);
}
