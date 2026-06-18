import type { AdminApiContext } from '~/types/shopify';

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

/**
 * Returns the set of active webhook topic enums for the shop, or null if the lookup
 * failed (caller should then fall back to "unknown availability", never block).
 */
export async function listActiveWebhookTopicEnums(
  admin: AdminApiContext['admin'],
): Promise<Set<string> | null> {
  try {
    const res = await admin.graphql(
      `#graphql
      query ActiveWebhooks { webhookSubscriptions(first: 250) { edges { node { id topic } } } }`,
    );
    const body = (await res.json()) as {
      data?: { webhookSubscriptions?: { edges?: Array<{ node?: { topic?: string } }> } };
    };
    const edges = body?.data?.webhookSubscriptions?.edges ?? [];
    return new Set(edges.map((e) => String(e.node?.topic ?? '')).filter(Boolean));
  } catch {
    return null;
  }
}
