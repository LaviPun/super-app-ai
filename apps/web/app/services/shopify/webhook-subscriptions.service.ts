/**
 * Verifies which webhook topics are ACTUALLY subscribed (active) for this shop, by
 * querying the live Admin API — so the flow builder shows real availability instead
 * of a static guess. An app can always read its own subscriptions (no extra scope).
 *
 * The registry uses slash topics (`orders/create`); the API returns the
 * `WebhookSubscriptionTopic` enum (`ORDERS_CREATE`). `topicToEnum` maps registry →
 * enum so we can test membership without a lossy reverse mapping.
 */

/** `orders/create` → `ORDERS_CREATE` (the GraphQL enum form). */
export function topicToEnum(topic: string): string {
  return topic.toUpperCase().replace(/\//g, '_');
}
