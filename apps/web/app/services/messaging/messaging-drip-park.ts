import type { Workflow, WorkflowNode, WorkflowEdge } from '@superapp/core';
import type { MessagingTrigger } from './messaging-runner.service';

/**
 * Multi-step DRIP park helper (build #7b) — the drip sequence timer on the R3.5
 * durable scheduler.
 *
 * A `drip` campaign delivers step 0 (the entry send) immediately when its preset's
 * entry trigger fires. Each subsequent step is delayed relative to the previous one:
 * after delivering step N, the runner PARKS step N+1 as a WAITING WorkflowRun with
 * `resumeAt = now + step(N+1).delayMs`. The existing cron resume sweep
 * (`resumeDueWorkflowRuns`) fires the post-wait `messaging.sendDripStep` action, which
 * re-enters `MessagingRunnerService.runDripStep` to deliver that step and park the one
 * after it — until the last step.
 *
 * This reuses the durable scheduler VERBATIM (same as cross-run paging): no new queue,
 * no new sweep, no new table. The parked runId is idempotent (module + dripToken +
 * stepIndex) so a redelivery / double-resume that re-parks the same step collides on
 * the WorkflowRun unique id (P2002, swallowed) — never a duplicate send.
 *
 * Pure + deterministic (unit-tested). No DB, no Shopify calls.
 */

/** Inputs the resumed `messaging.sendDripStep` action carries. */
export type MessagingDripInputs = {
  moduleId: string;
  /** The step index to deliver on resume (1-based; step 0 is the inline entry send). */
  stepIndex: number;
  /** Stable id for this drip enrolment — shared by every step of one entry. */
  dripToken: string;
  /** The entry trigger that started the sequence (steps re-fire under it). */
  trigger: MessagingTrigger;
  /**
   * A snapshot of the entry EVENT so each delayed step resolves the same recipient +
   * merge vars as the entry send (the customer is on the triggering event).
   */
  entryEvent: unknown;
};

/**
 * Idempotent parked run id for a drip step. Every step of one enrolment (same
 * dripToken) at a given stepIndex maps to exactly one WorkflowRun — so a re-park is a
 * P2002 no-op, never a duplicate send.
 */
export function messagingDripRunId(input: { moduleId: string; dripToken: string; stepIndex: number }): string {
  return `msgdrip_${sanitize(input.moduleId)}_${sanitize(input.dripToken)}_${input.stepIndex}`;
}

/**
 * Compile the "deliver the next drip step" into a canonical Workflow: a durable
 * `wait` head that parks immediately (inlineThresholdMs 0), chained to one
 * `messaging.sendDripStep` action node, then `end`. `resumeAt` is authoritative.
 */
export function parkMessagingDripStepWorkflow(input: {
  shopId: string;
  moduleId: string;
  campaignName: string;
  stepIndex: number;
  dripToken: string;
  trigger: MessagingTrigger;
  entryEvent: unknown;
  resumeAt: Date;
  version?: number;
}): Workflow {
  const { shopId, moduleId, campaignName, stepIndex, dripToken, trigger, entryEvent, resumeAt, version } = input;

  const dripInputs: MessagingDripInputs = { moduleId, stepIndex, dripToken, trigger, entryEvent };

  const waitNode: WorkflowNode = {
    id: 'wait',
    type: 'wait',
    name: 'DRIP_WAIT',
    // inlineThresholdMs 0 ⇒ the engine always parks on startRun; resumeAt is the
    // authoritative instant. A short resumeAt means the next cron tick delivers it.
    wait: { mode: 'until', until: resumeAt.toISOString(), inlineThresholdMs: 0 },
  };

  const sendNode: WorkflowNode = {
    id: 'send_step',
    type: 'action',
    name: 'SEND_DRIP_STEP',
    action: {
      provider: 'messaging',
      operation: 'sendDripStep',
      timeoutMs: 60_000,
      inputs: {
        moduleId: { $ref: '$.trigger.payload.moduleId' },
        stepIndex: { $ref: '$.trigger.payload.stepIndex' },
        dripToken: { $ref: '$.trigger.payload.dripToken' },
        trigger: { $ref: '$.trigger.payload.trigger' },
        entryEvent: { $ref: '$.trigger.payload.entryEvent' },
      },
    },
    // A step failure must not fail the run — a wedged step should not black-hole the
    // WAITING queue, and the idempotent runId makes a retry safe.
    onError: { mode: 'continue', captureErrorAs: 'lastError' },
  };

  const endNode: WorkflowNode = { id: 'end', type: 'end', name: 'Done' };

  const nodes: WorkflowNode[] = [waitNode, sendNode, endNode];
  const edges: WorkflowEdge[] = [
    { from: 'wait', to: 'send_step', label: 'next' },
    { from: 'send_step', to: 'end', label: 'next' },
  ];

  return {
    id: padId(`msgdrip_${moduleId}`),
    version: version ?? 1,
    name: `${campaignName} (drip step ${stepIndex})`.slice(0, 120),
    status: 'active',
    tenantId: shopId,
    trigger: { type: 'schedule', provider: 'superapp', event: 'messaging.drip' },
    variables: { __drip: dripInputs as unknown as Record<string, unknown> },
    nodes,
    edges,
    settings: { timezone: 'UTC', maxRunSeconds: 900, errorPolicy: 'continue_on_error' },
  };
}

/** Workflow ids must be 8..64 of [A-Za-z0-9_-]; pad/normalize an arbitrary id. */
function padId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return safe.length >= 8 ? safe : `msgdrip_${safe}`.padEnd(8, '0');
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').slice(0, 48) || 'x';
}
