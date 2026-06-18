import { describe, it, expect } from 'vitest';
import { topicToEnum } from '~/services/shopify/webhook-subscriptions.service';

describe('webhook subscription verification — topic ⇄ enum mapping', () => {
  it('maps registry slash-topics to the GraphQL WebhookSubscriptionTopic enum', () => {
    expect(topicToEnum('orders/create')).toBe('ORDERS_CREATE');
    expect(topicToEnum('fulfillment_orders/order_routing_complete')).toBe('FULFILLMENT_ORDERS_ORDER_ROUTING_COMPLETE');
    expect(topicToEnum('returns/request')).toBe('RETURNS_REQUEST');
    expect(topicToEnum('inventory_levels/update')).toBe('INVENTORY_LEVELS_UPDATE');
  });
});
