import { describe, it, expect } from 'vitest';
import {
  SHOPIFY_WEBHOOK_TOPICS,
  GRANTED_WEBHOOK_SCOPES,
  topicToTrigger,
  getWebhookTopic,
  normalizeTrigger,
  isTopicGranted,
  alwaysOnWebhookTopics,
} from '../shopify-webhook-topics.js';

describe('shopify webhook topic registry', () => {
  it('covers the major commerce surfaces (broad catalog, not just a couple)', () => {
    expect(SHOPIFY_WEBHOOK_TOPICS.length).toBeGreaterThanOrEqual(50);
    const categories = new Set(SHOPIFY_WEBHOOK_TOPICS.map((t) => t.category));
    for (const c of ['Orders', 'Customers', 'Products', 'Inventory', 'Fulfillment', 'Returns']) {
      expect(categories.has(c)).toBe(true);
    }
  });

  it('has unique topics and unique trigger ids', () => {
    const topics = SHOPIFY_WEBHOOK_TOPICS.map((t) => t.topic);
    const triggers = SHOPIFY_WEBHOOK_TOPICS.map((t) => t.trigger);
    expect(new Set(topics).size).toBe(topics.length);
    expect(new Set(triggers).size).toBe(triggers.length);
  });

  it('maps a raw topic to its canonical trigger (case-insensitive)', () => {
    expect(topicToTrigger('orders/create')).toBe('shopify.order.created');
    expect(topicToTrigger('ORDERS/CREATE')).toBe('shopify.order.created');
    expect(topicToTrigger('fulfillment_orders/order_routing_complete')).toBe('shopify.fulfillment_order.routing_complete');
    expect(topicToTrigger('not/a-topic')).toBeNull();
  });

  it('normalizes legacy enums, raw topics, and canonical ids to one trigger', () => {
    expect(normalizeTrigger('SHOPIFY_WEBHOOK_ORDER_CREATED')).toBe('shopify.order.created');
    expect(normalizeTrigger('orders/create')).toBe('shopify.order.created');
    expect(normalizeTrigger('shopify.order.created')).toBe('shopify.order.created');
    // non-webhook triggers pass through unchanged
    expect(normalizeTrigger('MANUAL')).toBe('MANUAL');
    expect(normalizeTrigger('superapp.data.record_created')).toBe('superapp.data.record_created');
  });

  it('every topic declares a scope or null, and reference fields are arrays', () => {
    for (const t of SHOPIFY_WEBHOOK_TOPICS) {
      expect(typeof t.topic).toBe('string');
      expect(t.scope === null || typeof t.scope === 'string').toBe(true);
      if (t.referenceFields) expect(Array.isArray(t.referenceFields)).toBe(true);
    }
  });

  it('always-on set is exactly the topics whose scope is granted', () => {
    const alwaysOn = alwaysOnWebhookTopics();
    expect(alwaysOn.length).toBeGreaterThan(0);
    for (const t of alwaysOn) expect(isTopicGranted(t)).toBe(true);
    // order routing complete is a granted, selectable trigger (key for the user's flows)
    const routing = getWebhookTopic('fulfillment_orders/order_routing_complete');
    expect(routing && isTopicGranted(routing)).toBe(true);
    // subscriptions require a scope we do not grant by default → not always-on
    const sub = getWebhookTopic('subscription_contracts/create');
    expect(sub && GRANTED_WEBHOOK_SCOPES.has(sub.scope as string)).toBeFalsy();
  });
});
