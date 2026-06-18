import { describe, it, expect } from 'vitest';
import { extractAdminCost, RateLimitService } from '~/services/shopify/rate-limit.service';

describe('RateLimitService — Shopify Admin throttle parsing', () => {
  it('extracts extensions.cost.throttleStatus + actualQueryCost', () => {
    const body = {
      data: { shop: { id: 'gid://shopify/Shop/1' } },
      extensions: { cost: { actualQueryCost: 11, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1989, restoreRate: 100 } } },
    };
    const cost = extractAdminCost(body);
    expect(cost?.actualQueryCost).toBe(11);
    expect(cost?.throttleStatus?.currentlyAvailable).toBe(1989);
    expect(cost?.throttleStatus?.maximumAvailable).toBe(2000);
  });

  it('returns null when there is no cost block', () => {
    expect(extractAdminCost({ data: {} })).toBeNull();
    expect(extractAdminCost(null)).toBeNull();
  });

  it('computes utilization (fraction of bucket consumed)', () => {
    expect(RateLimitService.utilization({ currentlyAvailable: 2000, maximumAvailable: 2000 })).toBe(0);
    expect(RateLimitService.utilization({ currentlyAvailable: 1000, maximumAvailable: 2000 })).toBe(0.5);
    expect(RateLimitService.utilization({ currentlyAvailable: 0, maximumAvailable: 2000 })).toBe(1);
    expect(RateLimitService.utilization({ currentlyAvailable: null, maximumAvailable: 2000 })).toBeNull();
  });

  it('backs off only when below the floor, bounded to 10s', () => {
    // healthy bucket → no backoff
    expect(RateLimitService.backoffMs({ currentlyAvailable: 1500, maximumAvailable: 2000, restoreRate: 100 })).toBe(0);
    // below 10% floor (200): need to refill from 50 → 200 = 150 pts / 100 per s = 1.5s
    expect(RateLimitService.backoffMs({ currentlyAvailable: 50, maximumAvailable: 2000, restoreRate: 100 })).toBe(1500);
    // unknown restoreRate → no backoff
    expect(RateLimitService.backoffMs({ currentlyAvailable: 50, maximumAvailable: 2000, restoreRate: null })).toBe(0);
  });
});
