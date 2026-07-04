import type { Workflow, WorkflowNode, WorkflowEdge } from '@superapp/core';
import type { MessagingTrigger } from './messaging-runner.service';

/**
 * Cross-run PAGING park helper (R3.4 paging on the R3.5 durable scheduler).
 *
 * When a messaging campaign's audience exceeds one bounded batch, the runner PARKS
 * the REMAINDER as a minimal canonical Workflow and hands it to
 * `WorkflowEngineService.startRun`, which persists it as `WorkflowRun.status='WAITING'`
 * with `resumeAt`. The existing cron sweep (`resumeDueWorkflowRuns`) picks it up and
 * fires the single post-wait `action` node — a `provider:'messaging'`,
 * `operation:'sendPage'` action carrying the campaign ref + the next cursor offset +
 * the stable per-fan-out run token. `MessagingConnector.invoke` re-enters the runner
 * for that page, which parks the one after if the list is still not exhausted.
 *
 * This reuses the R3.5 scheduler VERBATIM (no new queue, no new sweep, no new table):
 *   - `startRun` parks; `resumeDueWorkflowRuns` resumes; the CAS claim inside the
 *     sweep is the double-resume guard.
 *   - the parked `runId` (msgpage_<module>_<token>_<offset>) is idempotent, so a
 *     webhook redelivery / duplicate schedule that re-parks the same page collides
 *     on the WorkflowRun unique id (P2002, swallowed) — mirroring the R3.5 DELAY
 *     park and the loyalty/subscription engines.
 *
 * Pure + deterministic (unit-tested). No DB, no Shopify calls.
 */

/** Inputs the resumed `messaging.sendPage` action carries (resolved from `variables`). */
export type MessagingPageInputs = {
  moduleId: string;
  /** DataStore offset the next page starts at (the durable cursor). */
  offset: number;
  /** Stable id shared by every page of one fan-out — the sent-marker dedupe key. */
  runToken: string;
  /** The trigger that started the fan-out (broadcast pages re-fire as this). */
  trigger: MessagingTrigger;
};

/**
 * Build the idempotent parked run id for a page. Every page of one fan-out (same
 * runToken) at a given offset maps to exactly one WorkflowRun — so a re-park of the
 * same page is a P2002 no-op, never a duplicate send.
 */
export function messagingPageRunId(input: { moduleId: string; runToken: string; offset: number }): string {
  return `msgpage_${sanitize(input.moduleId)}_${sanitize(input.runToken)}_${input.offset}`;
}

/**
 * Compile the "send the next page" remainder into a canonical Workflow: a durable
 * `wait` head that parks immediately (inlineThresholdMs 0), chained to one
 * `messaging.sendPage` action node, then `end`. `resumeAt` is authoritative.
 *
 * The action's inputs are `$.trigger.payload.*` refs so the engine resolves them
 * from the trigger payload at resume time (identical to how flow-park threads the
 * event through), and the payload is ALSO snapshotted into `variables.__page`.
 */
export function parkMessagingPageWorkflow(input: {
  shopId: string;
  moduleId: string;
  campaignName: string;
  /** The offset the NEXT page should read from. */
  offset: number;
  runToken: string;
  trigger: MessagingTrigger;
  resumeAt: Date;
  version?: number;
}): Workflow {
  const { shopId, moduleId, campaignName, offset, runToken, trigger, resumeAt, version } = input;

  const pageInputs: MessagingPageInputs = { moduleId, offset, runToken, trigger };

  const waitNode: WorkflowNode = {
    id: 'wait',
    type: 'wait',
    name: 'PAGE_WAIT',
    // inlineThresholdMs 0 ⇒ the engine always parks on startRun; resumeAt is the
    // authoritative instant. A short resumeAt means the next cron tick sends it.
    wait: { mode: 'until', until: resumeAt.toISOString(), inlineThresholdMs: 0 },
  };

  const sendNode: WorkflowNode = {
    id: 'send_page',
    type: 'action',
    name: 'SEND_MESSAGING_PAGE',
    action: {
      provider: 'messaging',
      operation: 'sendPage',
      timeoutMs: 60_000,
      inputs: {
        moduleId: { $ref: '$.trigger.payload.moduleId' },
        offset: { $ref: '$.trigger.payload.offset' },
        runToken: { $ref: '$.trigger.payload.runToken' },
        trigger: { $ref: '$.trigger.payload.trigger' },
      },
    },
    // Page failures must not fail the run — the sent-marker + cursor make a retry
    // safe, and a wedged page should not black-hole the WAITING queue.
    onError: { mode: 'continue', captureErrorAs: 'lastError' },
  };

  const endNode: WorkflowNode = { id: 'end', type: 'end', name: 'Done' };

  const nodes: WorkflowNode[] = [waitNode, sendNode, endNode];
  const edges: WorkflowEdge[] = [
    { from: 'wait', to: 'send_page', label: 'next' },
    { from: 'send_page', to: 'end', label: 'next' },
  ];

  return {
    id: padId(`msg_${moduleId}`),
    version: version ?? 1,
    name: `${campaignName} (page @${offset})`.slice(0, 120),
    status: 'active',
    tenantId: shopId,
    trigger: { type: 'schedule', provider: 'superapp', event: 'messaging.page' },
    variables: { __page: pageInputs as unknown as Record<string, unknown> },
    nodes,
    edges,
    settings: { timezone: 'UTC', maxRunSeconds: 900, errorPolicy: 'continue_on_error' },
  };
}

/** Workflow ids must be 8..64 of [A-Za-z0-9_-]; pad/normalize an arbitrary id. */
function padId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return safe.length >= 8 ? safe : `msg_${safe}`.padEnd(8, '0');
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').slice(0, 48) || 'x';
}
