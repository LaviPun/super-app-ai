import { describe, it, expect } from 'vitest';
import {
  getRecipeTokenBudget,
  getRecipeOptionsTokenBudget,
  getRepairTokenBudget,
  getDeltaTokenBudget,
} from '~/services/ai/token-budget.server';

describe('token-budget.server', () => {
  describe('getRecipeTokenBudget', () => {
    it('returns the configured per-type budget', () => {
      // theme.section/proxy.widget raised 3000/2500 -> 7000/5500 (generation-aesthetics
      // quality pass, 2026-08): empirically the OLD values truncated
      // (stop_reason=max_tokens) on ALL 3 parallel option attempts for a real prompt
      // through the live pipeline — see the comment on RECIPE_TOKEN_BUDGETS.
      expect(getRecipeTokenBudget('theme.section')).toBe(7000);
      expect(getRecipeTokenBudget('proxy.widget')).toBe(5500);
      expect(getRecipeTokenBudget('flow.automation')).toBe(6000);
    });

    it('falls back to the 4000 default for an unlisted type', () => {
      expect(getRecipeTokenBudget('pos.extension' as never)).toBe(4000);
    });
  });

  describe('getDeltaTokenBudget', () => {
    // Sonnet-5 outputs run longer than the old default model's, so delta calls
    // were truncating (stop_reason=max_tokens) at the old 0.5x ratio and falling
    // back to freeform on nearly every Tier-1 call. Raised to 0.75x.
    it('is 0.75x the recipe budget, floored at MIN_DELTA_BUDGET', () => {
      expect(getDeltaTokenBudget('theme.section')).toBe(5250); // 7000 * 0.75
      expect(getDeltaTokenBudget('proxy.widget')).toBe(4125); // 5500 * 0.75
      expect(getDeltaTokenBudget('flow.automation')).toBe(4500); // 6000 * 0.75
      expect(getDeltaTokenBudget('customerAccount.blocks')).toBe(3375); // 4500 * 0.75
      expect(getDeltaTokenBudget('checkout.upsell')).toBe(3000); // 4000 * 0.75
    });

    it('falls back to 0.75x the 4000 default for an unlisted type', () => {
      expect(getDeltaTokenBudget('pos.extension' as never)).toBe(3000);
    });

    it('never binds against MIN_DELTA_BUDGET for any currently configured type', () => {
      // Every listed RECIPE_TOKEN_BUDGETS type, plus the unlisted-type default,
      // must clear the floor on its own — if this ever fails, MIN_DELTA_BUDGET
      // needs to move up proportionally (see the comment on getDeltaTokenBudget).
      const types: Array<Parameters<typeof getDeltaTokenBudget>[0]> = [
        'theme.section',
        'proxy.widget',
        'flow.automation',
        'customerAccount.blocks',
        'functions.discountRules',
        'functions.deliveryCustomization',
        'functions.paymentCustomization',
        'functions.cartAndCheckoutValidation',
        'functions.cartTransform',
        'functions.fulfillmentConstraints',
        'functions.orderRoutingLocationRule',
        'checkout.upsell',
        'integration.httpSync',
        'platform.extensionBlueprint',
      ];
      for (const type of types) {
        const budget = getDeltaTokenBudget(type);
        const floor = Math.floor(getRecipeTokenBudget(type) * 0.75);
        expect(budget).toBe(floor); // floor value itself, not the MIN_DELTA_BUDGET clamp
        expect(budget).toBeGreaterThan(1200); // MIN_DELTA_BUDGET is not binding
      }
    });
  });

  describe('getRecipeOptionsTokenBudget', () => {
    it('scales by option count and adds envelope overhead, clamped to MAX_BUDGET', () => {
      expect(getRecipeOptionsTokenBudget('theme.section', 1)).toBe(7500); // 7000 + 500
      expect(getRecipeOptionsTokenBudget('theme.section', 3)).toBe(16000); // 7000*3+500=21500 clamped to 16000
      expect(getRecipeOptionsTokenBudget('flow.automation', 3)).toBe(16000); // 6000*3+500=18500 clamped to 16000
    });
  });

  describe('getRepairTokenBudget', () => {
    it('is half the recipe budget, floored at MIN_BUDGET (1500)', () => {
      expect(getRepairTokenBudget('theme.section')).toBe(3500); // floor(7000/2)=3500
      expect(getRepairTokenBudget('proxy.widget')).toBe(2750); // floor(5500/2)=2750
      expect(getRepairTokenBudget('flow.automation')).toBe(3000); // floor(6000/2)=3000
    });
  });
});
