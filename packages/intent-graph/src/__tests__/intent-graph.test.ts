import { describe, expect, it } from 'vitest';
import { InMemoryIntentGraphStore } from '../intent-graph.js';

describe('InMemoryIntentGraphStore', () => {
  it('persists intent nodes and edges', async () => {
    const store = new InMemoryIntentGraphStore();
    const now = new Date().toISOString();
    await store.saveNode({
      id: 'intent_1',
      shopId: 'shop_1',
      intentKey: 'promo.banner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await store.saveEdge({
      id: 'edge_1',
      fromIntentId: 'intent_1',
      toIntentId: 'intent_2',
      relation: 'depends_on',
    });

    expect((await store.listNodes('shop_1')).length).toBe(1);
    expect((await store.listEdges('intent_1')).length).toBe(1);
  });
});
