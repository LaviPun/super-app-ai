/**
 * `progressGoal` control pack (basic) — V-B B1: the CART-GOAL / free-shipping
 * PROGRESS-BAR vocabulary (competitor parity: UpCart / Rebuy / FoxKit — the
 * most-installed conversion widget in the 028 corpus).
 *
 * A goal-progress bar drives AOV by showing shoppers how close they are to the
 * next reward (free shipping, a discount, a gift). The pack carries 1–3 ordered
 * `tiers` (each a threshold + reward kind + label), the before/after copy (both
 * token-aware), and a bar-thickness preset. It is presentation-only vocabulary:
 * the storefront renders the bar and computes live progress from `/cart.js`; the
 * merchant still provisions the actual free-shipping rate / discount / gift via
 * Shopify (upcart.md §data — the bar surfaces progress toward a reward, it does
 * not apply it). That honesty boundary is identical to the cart-surface
 * templates that predate this pack.
 *
 * MONEY UNITS: `tiers[].threshold` is expressed in the store's MAJOR currency
 * unit (e.g. `75` = $75) when `basis: 'cart-total'`, matching every other money
 * amount in the vocabulary (pricing pack `gate.minSubtotal`, the discount-rule
 * `when.minSubtotal` templates all use major units). The storefront JS multiplies
 * by 100 to compare against the `/cart.js` cents total. When `basis: 'item-count'`
 * the threshold is a plain item count.
 *
 * Flat-pin path (post R2.4 prune): the pack `schema` is pinned as an `.optional()`
 * `progressGoal` key onto `theme.section.config` (see recipe.ts). Optional →
 * recipes that omit it validate + compile byte-identically (back-compat).
 */
import { z } from 'zod';
import type { ControlPack } from '../types.js';

/** What the shopper's progress is measured against. */
export const PROGRESS_GOAL_BASES = ['cart-total', 'item-count'] as const;
export type ProgressGoalBasis = (typeof PROGRESS_GOAL_BASES)[number];

/** The reward unlocked at a tier. Presentation only — the merchant provisions it. */
export const PROGRESS_REWARD_TYPES = ['shipping', 'discount', 'product'] as const;
export type ProgressRewardType = (typeof PROGRESS_REWARD_TYPES)[number];

/** Bar thickness preset. */
export const PROGRESS_BAR_STYLES = ['slim', 'chunky'] as const;
export type ProgressBarStyle = (typeof PROGRESS_BAR_STYLES)[number];

/** One reward milestone. `threshold` is major-currency (cart-total) or a count (item-count). */
export const ProgressTierSchema = z.object({
  /** Spend/count at which this reward unlocks. Major currency units for cart-total. */
  threshold: z.number().positive(),
  rewardType: z.enum(PROGRESS_REWARD_TYPES).default('shipping'),
  /** Short reward label shown at the milestone marker (e.g. "Free shipping"). */
  label: z.string().min(1).max(60),
});
export type ProgressTier = z.infer<typeof ProgressTierSchema>;

export const ProgressGoalPackSchema = z.object({
  basis: z.enum(PROGRESS_GOAL_BASES).default('cart-total'),
  /** 1–3 ascending reward milestones. */
  tiers: z.array(ProgressTierSchema).min(1).max(3),
  /**
   * Copy shown while the (next) reward is unmet. Supports `{amount}` (current
   * cart total/count) and `{remaining}` (distance to the next tier) tokens.
   */
  beforeText: z.string().min(1).max(160),
  /** Copy shown once the final tier is reached. Same `{amount}` / `{remaining}` tokens. */
  afterText: z.string().min(1).max(160),
  barStyle: z.enum(PROGRESS_BAR_STYLES).default('slim'),
});
export type ProgressGoalPack = z.infer<typeof ProgressGoalPackSchema>;

export const progressGoalPack: ControlPack<typeof ProgressGoalPackSchema> = {
  id: 'progressGoal',
  namespace: 'progressGoal',
  label: 'Cart goal / progress bar',
  tier: 'basic',
  schema: ProgressGoalPackSchema,
  uiSchema: {
    groupLabel: 'Cart goal / progress bar',
    order: ['basis', 'tiers', 'beforeText', 'afterText', 'barStyle'],
    fields: {
      beforeText: { help: 'Use {amount} for the cart total and {remaining} for the distance to the next reward.' },
      afterText: { help: 'Shown once the final reward is unlocked. Same {amount} / {remaining} tokens.' },
      barStyle: { tier: 'advanced' },
    },
  },
};
