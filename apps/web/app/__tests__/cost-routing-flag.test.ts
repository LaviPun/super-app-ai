import { describe, it, expect, afterEach } from 'vitest';
import { isCostRoutingEnabled } from '~/env.server';

/**
 * Safety guard for the cost-routing switch. Cheapest-first multi-provider routing
 * must stay OFF unless AI_COST_ROUTING_ENABLED is explicitly set, so that seeding
 * AiModelPrice rows for cost observability never silently reroutes production
 * traffic to whichever provider happens to be cheapest. If this default ever
 * flips to true, pricing data becomes a hidden routing lever again.
 */
describe('isCostRoutingEnabled', () => {
  const original = process.env.AI_COST_ROUTING_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_COST_ROUTING_ENABLED;
    else process.env.AI_COST_ROUTING_ENABLED = original;
  });

  it('defaults to false when the flag is unset', () => {
    delete process.env.AI_COST_ROUTING_ENABLED;
    expect(isCostRoutingEnabled()).toBe(false);
  });

  it('stays false for falsey-ish values', () => {
    for (const v of ['false', '0', 'no', 'off', '']) {
      process.env.AI_COST_ROUTING_ENABLED = v;
      expect(isCostRoutingEnabled(), v).toBe(false);
    }
  });

  it('turns on only for explicit truthy values', () => {
    for (const v of ['true', '1', 'yes', 'on', 'TRUE', 'On']) {
      process.env.AI_COST_ROUTING_ENABLED = v;
      expect(isCostRoutingEnabled(), v).toBe(true);
    }
  });
});
