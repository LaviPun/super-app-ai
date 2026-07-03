import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '../recipe.js';
import { FLOW_DELAY_LIMITS } from '../allowed-values.js';

/**
 * R3.5 durable scheduler — the DELAY step (specs/031 durable-scheduler.md §2a).
 * The step is an additive discriminated-union member on flow.automation; a flow
 * with no DELAY step still parses exactly as before (back-compat).
 */

const flow = (steps: unknown[]) => ({
  type: 'flow.automation' as const,
  name: 'Dunning',
  category: 'FLOW' as const,
  config: { trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED' as const, steps },
});

describe('flow.automation DELAY step (R3.5)', () => {
  it('parses a duration-mode DELAY between two real steps', () => {
    const spec = RecipeSpecSchema.parse(flow([
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'a@b.com', subject: 'Payment issue', body: 'retry' },
      { kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 },
      { kind: 'TAG_CUSTOMER', tag: 'dunning-lapsed' },
    ]));
    expect(spec.type).toBe('flow.automation');
    if (spec.type === 'flow.automation') {
      const delay = spec.config.steps[1];
      expect(delay).toMatchObject({ kind: 'DELAY', mode: 'duration', durationMs: 259_200_000 });
    }
  });

  it('defaults mode to "duration" when omitted', () => {
    const spec = RecipeSpecSchema.parse(flow([
      { kind: 'DELAY', durationMs: FLOW_DELAY_LIMITS.durationMsMin },
    ]));
    if (spec.type === 'flow.automation') {
      expect(spec.config.steps[0]).toMatchObject({ mode: 'duration' });
    }
  });

  it('rejects a duration below the 60s floor', () => {
    const r = RecipeSpecSchema.safeParse(flow([
      { kind: 'DELAY', mode: 'duration', durationMs: 59_999 },
    ]));
    expect(r.success).toBe(false);
  });

  it('rejects a duration above the 90-day ceiling', () => {
    const r = RecipeSpecSchema.safeParse(flow([
      { kind: 'DELAY', mode: 'duration', durationMs: FLOW_DELAY_LIMITS.durationMsMax + 1 },
    ]));
    expect(r.success).toBe(false);
  });

  it('rejects duration mode with no durationMs', () => {
    const r = RecipeSpecSchema.safeParse(flow([
      { kind: 'DELAY', mode: 'duration' },
    ]));
    expect(r.success).toBe(false);
  });

  it('parses an until-mode DELAY (modeled, runner defers it)', () => {
    const spec = RecipeSpecSchema.parse(flow([
      { kind: 'DELAY', mode: 'until', until: '2026-08-01T00:00:00.000Z' },
    ]));
    expect(spec.type).toBe('flow.automation');
  });

  it('rejects until mode with no until', () => {
    const r = RecipeSpecSchema.safeParse(flow([
      { kind: 'DELAY', mode: 'until' },
    ]));
    expect(r.success).toBe(false);
  });

  it('leaves a no-DELAY flow parsing identically (back-compat)', () => {
    const spec = RecipeSpecSchema.parse(flow([
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'a@b.com', subject: 'Hi', body: 'welcome' },
      { kind: 'TAG_CUSTOMER', tag: 'welcomed' },
    ]));
    expect(spec.type).toBe('flow.automation');
    if (spec.type === 'flow.automation') {
      expect(spec.config.steps).toHaveLength(2);
      expect(spec.config.steps.some((s) => s.kind === 'DELAY')).toBe(false);
    }
  });
});
