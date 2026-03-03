import { describe, it, expect } from 'vitest';
import {
  FLOW_TRIGGERS,
  FLOW_ACTIONS,
  FLOW_CONNECTORS,
  FLOW_CONDITION_OPERATORS,
  FLOW_CONDITION_DATA_TYPES,
  getTriggersByCategory,
  getTriggersBySource,
  getActionsByCategory,
  getActionsBySource,
  getConnectorsBySource,
  getTriggerCategories,
  getActionCategories,
} from '../flow-catalog';

describe('Flow Catalog', () => {
  describe('FLOW_TRIGGERS', () => {
    it('contains at least 40 triggers', () => {
      expect(FLOW_TRIGGERS.length).toBeGreaterThanOrEqual(40);
    });

    it('includes Shopify order created trigger', () => {
      const t = FLOW_TRIGGERS.find(t => t.id === 'shopify.order.created');
      expect(t).toBeDefined();
      expect(t!.source).toBe('shopify');
      expect(t!.category).toBe('Orders');
    });

    it('includes SuperApp triggers', () => {
      const superapp = FLOW_TRIGGERS.filter(t => t.source === 'superapp');
      expect(superapp.length).toBe(5);
    });

    it('all triggers have required fields', () => {
      for (const t of FLOW_TRIGGERS) {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(['shopify', 'superapp', 'connector']).toContain(t.source);
      }
    });

    it('trigger IDs are unique', () => {
      const ids = FLOW_TRIGGERS.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('FLOW_CONDITION_OPERATORS', () => {
    it('contains at least 10 operators', () => {
      expect(FLOW_CONDITION_OPERATORS.length).toBeGreaterThanOrEqual(10);
    });

    it('includes equal_to operator', () => {
      const op = FLOW_CONDITION_OPERATORS.find(o => o.id === 'equal_to');
      expect(op).toBeDefined();
    });

    it('includes list operators', () => {
      const listOps = FLOW_CONDITION_OPERATORS.filter(o => o.appliesTo.includes('list'));
      expect(listOps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('FLOW_CONDITION_DATA_TYPES', () => {
    it('includes all 6 types', () => {
      expect(FLOW_CONDITION_DATA_TYPES.length).toBe(6);
      const ids = FLOW_CONDITION_DATA_TYPES.map(d => d.id);
      expect(ids).toContain('string');
      expect(ids).toContain('number');
      expect(ids).toContain('boolean');
      expect(ids).toContain('date');
      expect(ids).toContain('enum');
      expect(ids).toContain('list');
    });
  });

  describe('FLOW_ACTIONS', () => {
    it('contains at least 30 actions', () => {
      expect(FLOW_ACTIONS.length).toBeGreaterThanOrEqual(30);
    });

    it('includes send HTTP request action', () => {
      const a = FLOW_ACTIONS.find(a => a.id === 'shopify.flow.send_http_request');
      expect(a).toBeDefined();
      expect(a!.inputFields).toBeDefined();
      expect(a!.inputFields!.length).toBeGreaterThanOrEqual(2);
    });

    it('includes SuperApp actions', () => {
      const superapp = FLOW_ACTIONS.filter(a => a.source === 'superapp');
      expect(superapp.length).toBe(4);
    });

    it('action IDs are unique', () => {
      const ids = FLOW_ACTIONS.map(a => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('FLOW_CONNECTORS', () => {
    it('contains at least 10 connectors', () => {
      expect(FLOW_CONNECTORS.length).toBeGreaterThanOrEqual(10);
    });

    it('includes SuperApp connector with triggers and actions', () => {
      const c = FLOW_CONNECTORS.find(c => c.id === 'superapp');
      expect(c).toBeDefined();
      expect(c!.providesTriggers).toBe(true);
      expect(c!.providesActions).toBe(true);
    });

    it('connector IDs are unique', () => {
      const ids = FLOW_CONNECTORS.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Helper functions', () => {
    it('getTriggersByCategory returns filtered results', () => {
      const orderTriggers = getTriggersByCategory('Orders');
      expect(orderTriggers.length).toBeGreaterThanOrEqual(5);
      orderTriggers.forEach(t => expect(t.category).toBe('Orders'));
    });

    it('getTriggersBySource filters by source', () => {
      const shopify = getTriggersBySource('shopify');
      expect(shopify.length).toBeGreaterThan(0);
      shopify.forEach(t => expect(t.source).toBe('shopify'));
    });

    it('getActionsByCategory returns filtered results', () => {
      const integrations = getActionsByCategory('Integrations');
      expect(integrations.length).toBeGreaterThan(0);
    });

    it('getActionsBySource filters by source', () => {
      const superapp = getActionsBySource('superapp');
      expect(superapp.length).toBe(4);
    });

    it('getConnectorsBySource filters by source', () => {
      const thirdParty = getConnectorsBySource('connector');
      expect(thirdParty.length).toBeGreaterThan(0);
    });

    it('getTriggerCategories returns unique categories', () => {
      const categories = getTriggerCategories();
      expect(categories.length).toBeGreaterThanOrEqual(8);
      expect(new Set(categories).size).toBe(categories.length);
    });

    it('getActionCategories returns unique categories', () => {
      const categories = getActionCategories();
      expect(categories.length).toBeGreaterThanOrEqual(5);
      expect(new Set(categories).size).toBe(categories.length);
    });
  });
});
