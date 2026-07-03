import type { Workflow, WorkflowNode, WorkflowEdge } from '@superapp/core';
import { remainingStepsToNodes } from './flow-compile';

/**
 * R3.5 durable scheduler — park helper (specs/031 durable-scheduler.md §2c/§6.2).
 *
 * When the linear FlowRunnerService reaches a DELAY step whose wait exceeds the
 * inline threshold, it compiles the REMAINING steps into a minimal canonical
 * Workflow with a durable `wait` head node and hands it to
 * WorkflowEngineService.startRun, which parks it as WorkflowRun.status='WAITING'
 * with resumeAt. A cron resume sweep (resumeDueWorkflowRuns) picks it up once due.
 *
 * The head wait uses `inlineThresholdMs: 0` so the engine ALWAYS parks on start
 * (it re-checks `remaining > threshold && depth === 0`). The `resumeAt` computed
 * here is the single source of truth; the engine re-parks against it.
 *
 * Pure + deterministic (unit-tested). No DB, no Shopify calls.
 */

/** A flow.automation step as the runner sees it (superset; only DELAY fields matter here). */
export type ParkStep = {
  kind: string;
  mode?: string;
  durationMs?: number;
  until?: string;
  [key: string]: unknown;
};

/**
 * Resolve the absolute instant a DELAY step should resume at.
 *  - duration mode: now + durationMs.
 *  - until mode: a literal ISO-8601 instant, or a `{{dot.path}}` ref resolved
 *    from the trigger event. Throws when the ref/literal is not a valid date.
 * All instants are UTC (the resume sweep compares against a UTC `resumeAt`).
 */
export function computeResumeAt(step: ParkStep, event: unknown, now: Date = new Date()): Date {
  const mode = step.mode ?? 'duration';

  if (mode === 'duration') {
    if (typeof step.durationMs !== 'number' || !Number.isFinite(step.durationMs) || step.durationMs < 0) {
      throw new Error('DELAY duration mode requires a non-negative durationMs');
    }
    return new Date(now.getTime() + step.durationMs);
  }

  // until mode
  const raw = step.until;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('DELAY until mode requires an `until` value');
  }
  // Resolve a single {{dot.path}} ref out of the trigger event; otherwise treat
  // as a literal ISO string.
  const refMatch = raw.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  const resolved = refMatch ? readPath(event, refMatch[1]!) : raw;
  const ms = new Date(String(resolved)).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`DELAY until "${raw}" did not resolve to a valid date`);
  }
  return new Date(ms);
}

/**
 * Compile the remaining steps (everything after the DELAY) into a canonical
 * Workflow whose head is a durable wait that parks immediately, chained to the
 * mapped remainder and an `end` node. The trigger event is snapshotted into
 * `variables.__event` for reference and is ALSO passed to startRun as the
 * trigger payload (so `$.trigger.payload.*` refs in the remainder's action
 * nodes — order/customer GIDs — resolve identically to an inline run).
 */
export function parkRemainderAsWorkflow(input: {
  shopId: string;
  flowId: string;
  flowName: string;
  remainderSteps: ParkStep[];
  event: unknown;
  resumeAt: Date;
  version?: number;
}): Workflow {
  const { shopId, flowId, flowName, remainderSteps, event, resumeAt, version } = input;

  const body = remainingStepsToNodes(remainderSteps, 'body_');

  const waitNode: WorkflowNode = {
    id: 'wait',
    type: 'wait',
    name: 'DELAY',
    // inlineThresholdMs 0 ⇒ the engine always parks on startRun; resumeAt is
    // the authoritative instant we computed in the runner.
    wait: { mode: 'until', until: resumeAt.toISOString(), inlineThresholdMs: 0 },
  };

  const endNode: WorkflowNode = { id: 'end', type: 'end', name: 'Done' };

  const nodes: WorkflowNode[] = [waitNode, ...body.nodes, endNode];
  const edges: WorkflowEdge[] = [...body.edges];

  // wait → first body node (or straight to end if the remainder mapped to nothing).
  edges.unshift({ from: 'wait', to: body.firstId ?? 'end', label: 'next' });
  if (body.lastId) {
    edges.push({ from: body.lastId, to: 'end', label: 'next' });
  }

  return {
    id: padId(flowId),
    version: version ?? 1,
    name: `${flowName} (delayed)`.slice(0, 120),
    status: 'active',
    tenantId: shopId,
    trigger: { type: 'schedule', provider: 'superapp', event: 'delay.resume' },
    variables: { __event: event as Record<string, unknown> },
    nodes,
    edges,
    settings: { timezone: 'UTC', maxRunSeconds: 900, errorPolicy: 'continue_on_error' },
  };
}

/** Workflow ids must be 8..64 of [A-Za-z0-9_-]; pad/normalize an arbitrary id. */
function padId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return safe.length >= 8 ? safe : `flow_${safe}`.padEnd(8, '0');
}

/** Read a dot-path (e.g. "order.fulfillment.eta") out of the trigger event. */
function readPath(root: unknown, dotted: string): unknown {
  const parts = dotted.split('.');
  let val: unknown = root;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}
