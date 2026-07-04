import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * flow.automation — persists the flow definition as a real shop metafield so the
 * type is DEPLOYABLE, not false-published (the R0.1 "deployable ⇒ compiler emits a
 * non-AUDIT op" invariant, machine-checked by module-deployability-audit.test.ts).
 *
 * Why this is now deployable (it was AUDIT-only / needs_runtime before): the flow
 * runtime is fully shipped and MORE complete than integration.httpSync / messaging
 * were when THEY flipped deployable —
 *   - FlowRunnerService (linear runner) fires on the live Shopify webhooks
 *     (webhooks.tsx), on MANUAL "run now" (api.flow.run.tsx / internal.ops.tsx),
 *     on the agent API (api.agent.flows.tsx), and on SCHEDULED cron ticks
 *     (api.cron.tsx). It reads the module's active-version `specJson` to execute.
 *   - DELAY/wait steps are wired to the durable scheduler: a long wait parks the
 *     remainder as a WorkflowRun (status WAITING + resumeAt) via
 *     WorkflowEngineService.startRun, and the cron resume sweep
 *     (resumeDueWorkflowRuns) continues it once due — idempotent (P2002-guarded
 *     runId), inline-vs-park thresholded, unit-tested (flow-runner-delay,
 *     flow-park, workflow-engine).
 *   - Shopify Flow trigger/action CLI extensions ship (extensions/superapp-flow-*).
 *
 * Runtime note: like FlowRunnerService / MessagingRunnerService / HttpSyncRunnerService,
 * the runner reads the active-version `specJson` to run, so it does NOT strictly need
 * this metafield to execute. We still emit a real op because publishing a deployable
 * type must WRITE something — and the metafield is a genuine, inspectable deploy
 * artifact (the flow definition a merchant/ops can read back), never a fake.
 *
 * Namespace `superapp.flow` satisfies the non-destructive guard's `superapp.` prefix
 * invariant (services/recipes/compiler/non-destructive.ts rule 4).
 */
const FLOW_METAFIELD_NAMESPACE = 'superapp.flow';

/** kebab-ify a module name for the per-flow metafield key. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'flow'
  );
}

export function compileFlowAutomation(
  spec: Extract<RecipeSpec, { type: 'flow.automation' }>,
): CompileResult {
  const key = `flow_${slug(spec.name)}`.slice(0, 64);
  const value = JSON.stringify({ name: spec.name, config: spec.config });

  // Surface whether the flow uses a durable DELAY (a wait > the inline threshold
  // parks a remainder) so the audit trail records the durable-wait shape.
  const hasDelay = spec.config.steps.some((s) => s.kind === 'DELAY');

  return {
    ops: [
      {
        kind: 'SHOP_METAFIELD_SET',
        namespace: FLOW_METAFIELD_NAMESPACE,
        key,
        type: 'json',
        value,
      },
      {
        kind: 'AUDIT',
        action: 'compile.flow.automation',
        details: JSON.stringify({
          trigger: spec.config.trigger,
          steps: spec.config.steps.length,
          durableDelay: hasDelay,
        }),
      },
    ],
    compiledJson: value,
  };
}
