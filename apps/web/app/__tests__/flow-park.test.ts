import { describe, it, expect } from 'vitest';
import { computeResumeAt, parkRemainderAsWorkflow } from '~/services/flows/flow-park';
import { validateWorkflow } from '@superapp/core';

/**
 * R3.5 durable scheduler — park helper (flow-park.ts). Pure + deterministic:
 * computeResumeAt resolves the absolute resume instant; parkRemainderAsWorkflow
 * builds a valid canonical Workflow with a durable wait head chained to the
 * remaining steps.
 */

describe('computeResumeAt (R3.5)', () => {
  it('duration mode → now + durationMs', () => {
    const now = new Date('2026-07-03T00:00:00.000Z');
    const at = computeResumeAt({ kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 }, {}, now);
    expect(at.toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });

  it('defaults to duration mode when mode omitted', () => {
    const now = new Date('2026-07-03T00:00:00.000Z');
    const at = computeResumeAt({ kind: 'DELAY', durationMs: 60_000 }, {}, now);
    expect(at.getTime()).toBe(now.getTime() + 60_000);
  });

  it('until mode → literal ISO instant', () => {
    const at = computeResumeAt({ kind: 'DELAY', mode: 'until', until: '2026-08-01T12:00:00.000Z' }, {});
    expect(at.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('until mode → resolves a {{ref}} out of the event', () => {
    const event = { order: { fulfillment: { eta: '2026-09-09T00:00:00.000Z' } } };
    const at = computeResumeAt({ kind: 'DELAY', mode: 'until', until: '{{order.fulfillment.eta}}' }, event);
    expect(at.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('throws when duration mode has no durationMs', () => {
    expect(() => computeResumeAt({ kind: 'DELAY', mode: 'duration' }, {})).toThrow(/durationMs/);
  });

  it('throws when until does not resolve to a valid date', () => {
    expect(() => computeResumeAt({ kind: 'DELAY', mode: 'until', until: 'not-a-date' }, {})).toThrow(/valid date/);
  });
});

describe('parkRemainderAsWorkflow (R3.5)', () => {
  const resumeAt = new Date('2026-07-06T00:00:00.000Z');
  const build = () =>
    parkRemainderAsWorkflow({
      shopId: 'shop_abc123',
      flowId: 'module_xyz',
      flowName: 'Dunning',
      remainderSteps: [
        { kind: 'SEND_EMAIL_NOTIFICATION', to: 'a@b.com', subject: 'Reminder', body: 'pay up' },
        { kind: 'TAG_CUSTOMER', tag: 'dunning-lapsed' },
      ],
      event: { admin_graphql_api_id: 'gid://shopify/Order/1' },
      resumeAt,
    });

  it('produces a schema-valid workflow with a durable wait head', () => {
    const wf = build();
    expect(validateWorkflow(wf).valid).toBe(true);
    const wait = wf.nodes.find((n) => n.id === 'wait')!;
    expect(wait.type).toBe('wait');
    // inlineThresholdMs 0 ⇒ the engine parks immediately against resumeAt.
    expect(wait.wait).toMatchObject({ mode: 'until', until: resumeAt.toISOString(), inlineThresholdMs: 0 });
  });

  it('chains the wait → remainder → end and snapshots the event', () => {
    const wf = build();
    const ids = wf.nodes.map((n) => n.id);
    expect(ids).toEqual(['wait', 'body_0', 'body_1', 'end']);
    // wait → first body node
    expect(wf.edges.some((e) => e.from === 'wait' && e.to === 'body_0' && e.label === 'next')).toBe(true);
    // last body node → end
    expect(wf.edges.some((e) => e.from === 'body_1' && e.to === 'end' && e.label === 'next')).toBe(true);
    expect(wf.variables?.__event).toMatchObject({ admin_graphql_api_id: 'gid://shopify/Order/1' });
    expect(wf.tenantId).toBe('shop_abc123');
  });

  it('chains the wait straight to end when the remainder maps to nothing', () => {
    const wf = parkRemainderAsWorkflow({
      shopId: 'shop_abc123',
      flowId: 'module_xyz',
      flowName: 'Trailing',
      remainderSteps: [{ kind: 'UNKNOWN_KIND' }], // maps to no node
      event: {},
      resumeAt,
    });
    expect(validateWorkflow(wf).valid).toBe(true);
    expect(wf.edges.some((e) => e.from === 'wait' && e.to === 'end')).toBe(true);
  });

  it('compiles a chained DELAY in the remainder to a wait node (re-parks on resume)', () => {
    const wf = parkRemainderAsWorkflow({
      shopId: 'shop_abc123',
      flowId: 'module_xyz',
      flowName: 'Chained',
      remainderSteps: [
        { kind: 'DELAY', mode: 'duration', durationMs: 7 * 24 * 3600_000 },
        { kind: 'TAG_CUSTOMER', tag: 'day-10' },
      ],
      event: {},
      resumeAt,
    });
    expect(validateWorkflow(wf).valid).toBe(true);
    const chainedWait = wf.nodes.find((n) => n.id === 'body_0')!;
    expect(chainedWait.type).toBe('wait');
  });
});
