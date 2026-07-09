import { describe, expect, it } from 'vitest';
import { findTemplate, type RecipeSpec } from '@superapp/core';
import { defaultSimulationInput } from '@superapp/platform-contracts';
import { simulateFunction } from '~/services/preview/function-simulation.server';

/**
 * Config-driven Function simulation (fixes the "function-preview collapse" bug):
 * every functions.* template must preview a DISTINCT, semantically-correct outcome
 * derived from its own `config.pricing` / rules — mirroring the Rust interpreters.
 */

const sim = (id: string) => {
  const tpl = findTemplate(id)!;
  expect(tpl, `template ${id} exists`).toBeTruthy();
  return simulateFunction(tpl.spec as never, defaultSimulationInput());
};
const labels = (id: string) => sim(id).outcomes.map((o) => o.label);
const joined = (id: string) => sim(id).outcomes.map((o) => `${o.label} | ${o.detail}`).join('\n');

describe('discountRules — pricing pack interpretation', () => {
  it('FN-DISC-01 tiered cart-value: shows the tier ladder + which tier the cart hits', () => {
    const out = sim('FN-DISC-01').outcomes;
    const text = out.map((o) => o.label).join('\n');
    expect(text).toContain('Spend $75.00 → 5% off');
    expect(text).toContain('Spend $150.00 → 10% off');
    expect(text).toContain('Spend $300.00 → 15% off');
    // non-triggering + triggering contrast
    expect(out.some((o) => o.effect === 'none' && /no discount/.test(o.label))).toBe(true);
    expect(out.some((o) => /tier 2\/3/.test(o.label))).toBe(true);
  });

  it('FN-DISC-02 tiered quantity: uses Buy-N wording, not cart value', () => {
    const text = labels('FN-DISC-02').join('\n');
    expect(text).toContain('Buy 2 → 5% off');
    expect(text).toContain('Buy 3 → 10% off');
    expect(text).toContain('Buy 5 → 15% off');
  });

  it('FN-DISC-03 BOGO showAsFree: reads as buy 1 get 1 free (not 100% off whole cart)', () => {
    const out = sim('FN-DISC-03').outcomes;
    const text = out.map((o) => o.label).join('\n');
    expect(text).toMatch(/Buy 1, get 1 → free/);
    // must NOT claim the whole cart is 100% off
    expect(text).not.toMatch(/100% off/);
    expect(out.some((o) => o.effect === 'none')).toBe(true);
  });

  it('FN-DISC-04 BOGO partial reward: buy 2 get 1 at 50% off', () => {
    expect(labels('FN-DISC-04').join('\n')).toMatch(/Buy 2, get 1 → 50% off/);
  });

  it('FN-DISC-05 gift-with-purchase: spend threshold → free gift', () => {
    const text = joined('FN-DISC-05');
    expect(text).toMatch(/Spend \$100\.00\+ → auto-added free gift/);
    expect(text).toMatch(/no gift/);
  });

  it('FN-DISC-06 selectable gift: choose 1 of N', () => {
    expect(labels('FN-DISC-06').join('\n')).toMatch(/choose 1 of 3 gifts/);
  });

  it('FN-DISC-07 cheapest-free: buy 3 cheapest free', () => {
    expect(labels('FN-DISC-07').join('\n')).toMatch(/Buy 3 → cheapest 1 free/);
  });

  it('FN-DISC-09 fixed-price volume tiers: 2 for $30', () => {
    expect(labels('FN-DISC-09').join('\n')).toMatch(/set price \$30\.00/);
  });

  it('FN-DISC-11 single fixed-amount with .99 charm ending', () => {
    expect(joined('FN-DISC-11')).toMatch(/ends in \.99/);
  });

  it('FN-DISC-12 VIP single: matches the fixture VIP tag case-insensitively', () => {
    const out = sim('FN-DISC-12').outcomes;
    // gate is ['vip','member']; fixture tag is 'VIP'
    expect(out.some((o) => /Fixture customer/.test(o.label) && o.effect === 'applied')).toBe(true);
    expect(out.some((o) => /Untagged customer/.test(o.label) && o.effect === 'none')).toBe(true);
  });

  it('templates FN-DISC-01..14 all produce distinct outcome sets', () => {
    const sets = new Set<string>();
    for (let i = 1; i <= 14; i++) {
      const id = `FN-DISC-${String(i).padStart(2, '0')}`;
      sets.add(joined(id));
    }
    expect(sets.size).toBe(14);
  });
});

describe('cartTransform — adaptive fixtures + bundle pricing', () => {
  it('FN-CART-01 forms the bundle from its own component SKUs (no "no rule matched")', () => {
    const out = sim('FN-CART-01').outcomes;
    expect(out.some((o) => o.effect === 'bundled' && o.label.includes('BUNDLE-STARTER-KIT'))).toBe(true);
    expect(out.every((o) => o.label !== 'No rule matched the fixture')).toBe(true);
  });

  it('FN-CART-02 fixed-price bundle shows the charm-ending price', () => {
    expect(joined('FN-CART-02')).toMatch(/\$88\.99/);
  });

  it('FN-CART-08 multi-bundle catalog forms each kit distinctly', () => {
    const out = sim('FN-CART-08').outcomes.filter((o) => o.effect === 'bundled');
    expect(out.length).toBe(3);
  });

  it('all 8 cart-transform templates produce distinct outcomes', () => {
    const sets = new Set<string>();
    for (let i = 1; i <= 8; i++) sets.add(joined(`FN-CART-0${i}`));
    expect(sets.size).toBe(8);
  });

  it('non-Plus store shows the theme fallback', () => {
    const tpl = findTemplate('FN-CART-01')!;
    const res = simulateFunction(tpl.spec as never, { ...defaultSimulationInput(), isPlus: false });
    expect(res.fallbackNote).toContain('Plus');
  });
});

describe('shipping / fulfillment / routing', () => {
  it('FN-SHIP-03 member free shipping matches the VIP fixture tag case-insensitively', () => {
    expect(labels('FN-SHIP-03').join('\n')).toMatch(/FREE shipping/);
  });

  it('FN-SHIP-07 fulfillment ship-alone fires against a synthesized matching SKU', () => {
    const out = sim('FN-SHIP-07').outcomes;
    expect(out.some((o) => o.effect === 'constrained' && /ship alone/.test(o.label))).toBe(true);
    expect(out.some((o) => o.effect === 'none')).toBe(true); // non-matching contrast
  });

  it('FN-SHIP-09 fulfillment must-fulfil-from surfaces the location id', () => {
    expect(labels('FN-SHIP-09').join('\n')).toMatch(/fulfil from location 101122334455/);
  });

  it('FN-SHIP-11 order routing surfaces country + preferred location + priority', () => {
    const text = joined('FN-SHIP-11');
    expect(text).toMatch(/Destination DE → prefer location 303344556677/);
    expect(text).toMatch(/Priority 10/);
  });

  it('FN-SHIP-13 routing picks the fixture (US) winner by priority', () => {
    expect(labels('FN-SHIP-13').join('\n')).toMatch(/Fixture: US order → routed to location 606677889900/);
  });

  it('fulfillment templates FN-SHIP-07..10 are distinct', () => {
    const sets = new Set<string>();
    for (const id of ['FN-SHIP-07', 'FN-SHIP-08', 'FN-SHIP-09', 'FN-SHIP-10']) sets.add(joined(id));
    expect(sets.size).toBe(4);
  });
});

describe('delivery / payment predicates', () => {
  it('FN-CHKC-01 delivery hides express when the freight product-type predicate holds', () => {
    expect(joined('FN-CHKC-01')).toMatch(/product type Freight\/Oversized\/Furniture/);
  });

  it('FN-CHKC-03 delivery reorder targets a specific customer id', () => {
    expect(joined('FN-CHKC-03')).toMatch(/1 specific customer/);
  });

  it('FN-CHKC-06 delivery restriction reads province predicate', () => {
    expect(joined('FN-CHKC-06')).toMatch(/province in YT\/NT\/NU/);
  });

  it('validation FN-CHKC-18 shows min & max cart-value guards', () => {
    const text = labels('FN-CHKC-18').join('\n');
    expect(text).toMatch(/cart < \$25\.00/);
    expect(text).toMatch(/cart > \$10000\.00/);
  });
});
