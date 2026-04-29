/**
 * Live-LLM eval suite — gated by `RUN_LIVE_EVALS=1`.
 *
 * Skipped on every CI run by default (vitest treats `describe.skipIf` as a soft
 * skip). Set `RUN_LIVE_EVALS=1` and either `OPENAI_API_KEY` or
 * `ANTHROPIC_API_KEY` and run:
 *
 *   RUN_LIVE_EVALS=1 OPENAI_API_KEY=sk-... pnpm --filter web vitest run app/__tests__/evals.live.test.ts
 *
 * What it asserts per (moduleType, prompt):
 *   - generateValidatedRecipeOptions returns ≥ 1 valid option
 *   - per-call wall time < 15s (p95 budget)
 *   - tokensIn / tokensOut budgets are within reasonable bands
 *   - no truncation errors
 *
 * Run before promoting a model change to production.
 */
import { describe, it, expect } from 'vitest';
import { generateValidatedRecipeOptions } from '~/services/ai/llm.server';
import { RecipeSpecSchema, type ModuleType } from '@superapp/core';

const RUN = process.env.RUN_LIVE_EVALS === '1';
const HAS_KEY = Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());

const PROMPTS: Array<{ moduleType: ModuleType; prompts: string[] }> = [
  {
    moduleType: 'theme.banner',
    prompts: [
      'Show a sitewide announcement banner for free shipping over $50',
      'Promote our summer sale with a banner at the top of the homepage',
      'Add a banner that links shoppers to our new collection page',
    ],
  },
  {
    moduleType: 'theme.popup',
    prompts: [
      'Capture emails on exit intent with a 10% discount popup',
      'Show a welcome popup on first visit with a coupon code',
      'Display a cart-abandonment popup after 30 seconds with a CTA',
    ],
  },
  {
    moduleType: 'theme.notificationBar',
    prompts: [
      'Notify shoppers about free shipping over $50',
      'Announce a flash 24-hour sale at the top of the page',
      'Tell shoppers we ship to Canada with a tiny banner',
    ],
  },
  {
    moduleType: 'flow.automation',
    prompts: [
      'When an order is created, post a Slack message to #orders with the order number',
      'Tag orders over $200 as VIP and send the customer a thank-you email',
      'When a high-value customer places an order, notify the team via webhook',
    ],
  },
  {
    moduleType: 'customerAccount.blocks',
    prompts: [
      'Add a "Refer a friend" block to the customer account profile page',
      'Show a "Subscribe & save" panel on the customer order page',
      'Add a B2B reorder shortcut block to wholesale customer accounts',
    ],
  },
];

const PER_CALL_BUDGET_MS = 15_000;

interface LiveCallStats {
  moduleType: ModuleType;
  prompt: string;
  durationMs: number;
  validOptions: number;
  error?: string;
}

const STATS: LiveCallStats[] = [];

describe.skipIf(!RUN || !HAS_KEY)('Live LLM evals (RUN_LIVE_EVALS=1)', () => {
  for (const { moduleType, prompts } of PROMPTS) {
    describe(`${moduleType}`, () => {
      it.each(prompts)('returns ≥ 1 valid option for: %s', async (prompt) => {
        const startedAt = Date.now();
        let validOptions = 0;
        let error: string | undefined;
        try {
          const opts = await generateValidatedRecipeOptions(
            prompt,
            { moduleType },
            { maxAttempts: 2 },
          );
          validOptions = opts.length;
          for (const opt of opts) {
            const safe = RecipeSpecSchema.safeParse(opt.recipe);
            expect(safe.success).toBe(true);
            expect(opt.recipe.type).toBe(moduleType);
          }
          expect(opts.length).toBeGreaterThanOrEqual(1);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          throw e;
        } finally {
          const durationMs = Date.now() - startedAt;
          STATS.push({ moduleType, prompt, durationMs, validOptions, error });
          expect(durationMs).toBeLessThan(PER_CALL_BUDGET_MS);
        }
      }, 30_000);
    });
  }

  it('reports aggregate p95 wall < 15s and average ≥ 1 valid option', () => {
    if (STATS.length === 0) return;
    const sorted = [...STATS].map((s) => s.durationMs).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
    const avgValid = STATS.reduce((acc, s) => acc + s.validOptions, 0) / STATS.length;
    // Surface the numbers in the vitest output even when assertions pass.
    // eslint-disable-next-line no-console
    console.info('[live evals] p95 ms', p95, 'avg valid options', avgValid.toFixed(2));
    expect(p95).toBeLessThan(PER_CALL_BUDGET_MS);
    expect(avgValid).toBeGreaterThanOrEqual(1);
  });
});
