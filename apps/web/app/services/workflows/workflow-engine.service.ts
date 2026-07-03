import type {
  Workflow,
  WorkflowNode,
  RunContext,
  RunStatus,
  StepStatus,
  StepState,
  RetryPolicy,
  WaitSpec,
} from '@superapp/core';
import type { Connector, AuthContext, InvokeResult } from '@superapp/core';
import { validateWorkflow } from '@superapp/core';
import { evalExpression, resolveValue } from './expression-evaluator';
import { getPrisma } from '~/db.server';
import { getConnectorRegistry } from './connectors/index';

const TERMINAL_RUN_STATUSES: RunStatus[] = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
const TERMINAL_STEP_STATUSES: StepStatus[] = ['SUCCESS', 'FAILED', 'SKIPPED'];

// ─── Safety caps (docs/flow-automation.md §9c) ───────────────────────
/** Hard cap on node executions per run — stops a runaway/pathological loop. */
export const MAX_NODE_EXECUTIONS = 10_000;
/** Bounds nested loop/parallel sub-graph recursion. */
export const MAX_RECURSION_DEPTH = 64;
/** Durable-wait re-park guard: a run may resume at most this many times. */
export const MAX_RESUMES = 100;
/** Waits longer than this park the run (durable) unless the node overrides it. */
const DEFAULT_INLINE_THRESHOLD_MS = 60_000;

/**
 * Control-flow signal (not an error): a top-level `wait`/`delay` longer than its
 * inline threshold throws this to park the run. `finalizeRun` persists
 * status=WAITING + resumeAt + resumeNodeId + the compiled graph (workflowJson)
 * so the cron resume path is self-contained.
 */
export class WaitParkSignal extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly resumeAt: Date,
  ) {
    super(`WAIT_PARKED: node "${nodeId}" resumes at ${resumeAt.toISOString()}`);
    this.name = 'WaitParkSignal';
  }
}

/** Per-run execution environment shared across recursive sub-graph frames. */
interface ExecEnv {
  workflow: Workflow;
  opts: {
    tenantId: string;
    runId: string;
    authResolver: (provider: string) => Promise<AuthContext>;
  };
  prisma: ReturnType<typeof getPrisma>;
  registry: ReturnType<typeof getConnectorRegistry>;
  deadline: number;
  executed: { count: number };
}

// ─── Public API ───────────────────────────────────────────────────────

export class WorkflowEngineService {
  /**
   * Start a new workflow run. Creates the run record and begins execution.
   * For Shopify-delegated flows, this triggers the Shopify Flow trigger instead.
   */
  async startRun(
    workflow: Workflow,
    triggerPayload: Record<string, unknown>,
    opts: {
      tenantId: string;
      runId: string;
      authResolver: (provider: string) => Promise<AuthContext>;
      executionMode?: 'local' | 'shopify_flow';
    },
  ): Promise<WorkflowRunResult> {
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      return { status: 'FAILED', error: `Workflow validation failed: ${validation.issues.map(i => i.message).join('; ')}` };
    }

    if (opts.executionMode === 'shopify_flow') {
      return this.delegateToShopifyFlow(workflow, triggerPayload, opts);
    }

    const ctx: RunContext = {
      trigger: {
        provider: workflow.trigger.provider,
        event: workflow.trigger.event,
        payload: triggerPayload,
      },
      workflow: { id: workflow.id, version: workflow.version },
      run: { id: opts.runId, startedAt: new Date().toISOString() },
      vars: { ...(workflow.variables ?? {}) },
      steps: {},
      lastError: null,
    };

    const prisma = getPrisma();
    await prisma.workflowRun.create({
      data: {
        id: opts.runId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        tenantId: opts.tenantId,
        status: 'QUEUED',
        triggerRef: JSON.stringify({ provider: workflow.trigger.provider, event: workflow.trigger.event }),
        contextJson: JSON.stringify(ctx),
      },
    });

    try {
      await this.executeRun(workflow, ctx, opts);
      await this.finalizeRun(workflow, ctx, opts.runId, { status: 'SUCCEEDED' });
      return { status: 'SUCCEEDED', context: ctx };
    } catch (err) {
      if (err instanceof WaitParkSignal) {
        await this.finalizeRun(workflow, ctx, opts.runId, {
          status: 'WAITING',
          resumeAt: err.resumeAt,
          resumeNodeId: err.nodeId,
        });
        return { status: 'WAITING', resumeAt: err.resumeAt, context: ctx };
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.lastError = errMsg;
      await this.finalizeRun(workflow, ctx, opts.runId, { status: 'FAILED', error: errMsg });
      return { status: 'FAILED', error: errMsg, context: ctx };
    }
  }

  /**
   * Resume a parked (WAITING) run: rebuilds the workflow + context from the
   * persisted snapshot, settles the wait node, and continues from its `next`
   * edge. Non-parked runs are reported and NOT re-executed.
   */
  async resumeRun(
    runId: string,
    authResolver: (provider: string) => Promise<AuthContext>,
  ): Promise<WorkflowRunResult> {
    const prisma = getPrisma();
    const row = await prisma.workflowRun.findUnique({ where: { id: runId } });
    if (!row) {
      return { status: 'FAILED', error: `Run "${runId}" not found` };
    }
    if (row.status !== 'WAITING') {
      return { status: row.status as RunStatus, error: 'run is not parked' };
    }
    if (typeof row.workflowJson !== 'string' || typeof row.resumeNodeId !== 'string' || typeof row.contextJson !== 'string') {
      const error = 'parked run is missing its workflow/context snapshot';
      await prisma.workflowRun.update({ where: { id: runId }, data: { status: 'FAILED', endedAt: new Date(), error } });
      return { status: 'FAILED', error };
    }

    const resumeCount = (row.resumeCount ?? 0) + 1;
    if (resumeCount > MAX_RESUMES) {
      const error = `SAFETY_LIMIT: run exceeded MAX_RESUMES (${MAX_RESUMES})`;
      await prisma.workflowRun.update({ where: { id: runId }, data: { status: 'FAILED', endedAt: new Date(), error } });
      return { status: 'FAILED', error };
    }

    let workflow: Workflow;
    let ctx: RunContext;
    try {
      workflow = JSON.parse(row.workflowJson) as Workflow;
      ctx = JSON.parse(row.contextJson) as RunContext;
    } catch (err) {
      const error = `parked run snapshot is corrupt: ${err instanceof Error ? err.message : String(err)}`;
      await prisma.workflowRun.update({ where: { id: runId }, data: { status: 'FAILED', endedAt: new Date(), error } });
      return { status: 'FAILED', error };
    }

    // Settle the parked wait node, then continue from its `next` edge.
    const waitNodeId = row.resumeNodeId;
    const waitStep: StepState = ctx.steps[waitNodeId] ?? { nodeId: waitNodeId, status: 'PENDING', attempt: 0 };
    waitStep.status = 'SUCCESS';
    waitStep.endedAt = new Date().toISOString();
    ctx.steps[waitNodeId] = waitStep;

    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', resumeCount, resumeAt: null, resumeNodeId: null },
    });

    const opts = { tenantId: row.tenantId ?? workflow.tenantId, runId, authResolver };
    const env: ExecEnv = {
      workflow,
      opts,
      prisma,
      registry: getConnectorRegistry(),
      deadline: Date.now() + (workflow.settings?.maxRunSeconds ?? 900) * 1000,
      executed: { count: 0 },
    };

    try {
      const nextId = this.edgeTo(workflow, waitNodeId, 'next');
      if (nextId) {
        await this.executeFrom(env, ctx, nextId, null, 0);
      }
      await this.finalizeRun(workflow, ctx, runId, { status: 'SUCCEEDED' });
      return { status: 'SUCCEEDED', context: ctx };
    } catch (err) {
      if (err instanceof WaitParkSignal) {
        // A further long top-level wait re-parks the run for the next cron pass.
        await this.finalizeRun(workflow, ctx, runId, {
          status: 'WAITING',
          resumeAt: err.resumeAt,
          resumeNodeId: err.nodeId,
        });
        return { status: 'WAITING', resumeAt: err.resumeAt, context: ctx };
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.lastError = errMsg;
      await this.finalizeRun(workflow, ctx, runId, { status: 'FAILED', error: errMsg });
      return { status: 'FAILED', error: errMsg, context: ctx };
    }
  }

  // ─── Core Execution (recursive sub-graph walker) ──────────────────

  private async executeRun(
    workflow: Workflow,
    ctx: RunContext,
    opts: { tenantId: string; runId: string; authResolver: (provider: string) => Promise<AuthContext> },
  ): Promise<void> {
    const prisma = getPrisma();
    const maxRunMs = (workflow.settings?.maxRunSeconds ?? 900) * 1000;

    await prisma.workflowRun.update({
      where: { id: opts.runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const env: ExecEnv = {
      workflow,
      opts,
      prisma,
      registry: getConnectorRegistry(),
      deadline: Date.now() + maxRunMs,
      executed: { count: 0 },
    };

    await this.executeFrom(env, ctx, this.findStartNode(workflow), null, 0);
  }

  /**
   * Walk the graph from `startNodeId` until the branch terminates (an `end`
   * node, or no matching out-edge) or leaves the owned node set (`boundary`).
   * Loop/parallel bodies recurse with their owned sub-graph as the boundary:
   * owned = reachable(body edge) \ reachable(next edge) — the continuation is
   * never executed by a body frame, so the DAG needs no back-edges.
   */
  private async executeFrom(
    env: ExecEnv,
    ctx: RunContext,
    startNodeId: string,
    boundary: Set<string> | null,
    depth: number,
  ): Promise<void> {
    const { workflow, opts, prisma, registry } = env;
    let currentNodeId: string | null = startNodeId;

    while (currentNodeId !== null) {
      if (boundary && !boundary.has(currentNodeId)) {
        return; // left the owned sub-graph — the parent frame continues from here
      }
      if (Date.now() > env.deadline) {
        throw new Error('TIMED_OUT: workflow exceeded maxRunSeconds');
      }
      env.executed.count += 1;
      if (env.executed.count > MAX_NODE_EXECUTIONS) {
        throw new Error(`SAFETY_LIMIT: run exceeded MAX_NODE_EXECUTIONS (${MAX_NODE_EXECUTIONS})`);
      }

      const node = workflow.nodes.find(n => n.id === currentNodeId);
      if (!node) throw new Error(`Node "${currentNodeId}" not found in workflow`);

      const stepState = this.getOrInitStep(ctx, node.id);
      if (TERMINAL_STEP_STATUSES.includes(stepState.status)) {
        currentNodeId = this.resolveNextNode(workflow, node, stepState);
        continue;
      }

      stepState.status = 'RUNNING';
      stepState.startedAt = new Date().toISOString();

      try {
        switch (node.type) {
          case 'condition': {
            const result = evalExpression(node.condition!, ctx);
            stepState.result = { value: result };
            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId = this.edgeTo(workflow, node.id, result ? 'true' : 'false');
            continue;
          }

          case 'transform': {
            const assignments: Record<string, unknown> = {};
            for (const [key, expr] of Object.entries(node.transform!.assign)) {
              assignments[key] = resolveValue(expr, ctx);
            }
            Object.assign(ctx.vars, assignments);
            stepState.result = { assigned: Object.keys(assignments) };
            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId = this.edgeTo(workflow, node.id, 'next');
            continue;
          }

          case 'switch': {
            const value = resolveValue(node.switchOn!.on, ctx);
            stepState.result = { value };
            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId =
              this.edgeTo(workflow, node.id, `case:${String(value)}`) ??
              this.edgeTo(workflow, node.id, 'default');
            continue;
          }

          case 'loop': {
            const spec = node.loop!;
            const resolvedItems = resolveValue(spec.items, ctx);
            if (!Array.isArray(resolvedItems)) {
              throw new Error(`Loop node "${node.id}": "items" did not resolve to an array`);
            }
            const bodyStart = this.edgeTo(workflow, node.id, 'loop');
            const nextId = this.edgeTo(workflow, node.id, 'next');
            const items = resolvedItems.slice(0, spec.maxIterations ?? 1000);
            const itemVar = spec.itemVar ?? 'item';
            const indexVar = spec.indexVar ?? 'index';

            if (bodyStart && items.length > 0) {
              this.assertDepth(depth + 1);
              const body = this.ownedSubgraph(workflow, bodyStart, nextId);

              if ((spec.mode ?? 'serial') === 'parallel') {
                const concurrency = Math.max(1, spec.concurrency ?? 1);
                await runPool(items.map((item, i) => async () => {
                  // Bounded-parallel: each iteration binds itemVar/indexVar in
                  // its own vars/steps so iterations don't race each other.
                  const iterCtx: RunContext = {
                    ...ctx,
                    vars: { ...ctx.vars, [itemVar]: item, [indexVar]: i },
                    steps: { ...ctx.steps },
                  };
                  for (const id of body) delete iterCtx.steps[id];
                  await this.executeFrom(env, iterCtx, bodyStart, body, depth + 1);
                }), concurrency);
              } else {
                for (let i = 0; i < items.length; i++) {
                  ctx.vars[itemVar] = items[i];
                  ctx.vars[indexVar] = i;
                  // Fresh step states per iteration so body nodes re-execute.
                  for (const id of body) delete ctx.steps[id];
                  await this.executeFrom(env, ctx, bodyStart, body, depth + 1);
                }
              }
            }

            stepState.result = { iterations: items.length };
            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId = nextId;
            continue;
          }

          case 'parallel': {
            const spec = node.parallel!;
            const nextId = this.edgeTo(workflow, node.id, 'next');
            const branchEdges = workflow.edges.filter(e => e.from === node.id && e.label === 'branch');

            if (branchEdges.length > 0) {
              this.assertDepth(depth + 1);
              const tasks = branchEdges.map(edge => async () => {
                const owned = this.ownedSubgraph(workflow, edge.to, nextId);
                await this.executeFrom(env, ctx, edge.to, owned, depth + 1);
              });

              if ((spec.join ?? 'all') === 'race') {
                const promises = tasks.map(t => t());
                // First branch to settle wins; observe the losers so a late
                // rejection never surfaces as an unhandled rejection.
                for (const p of promises) p.catch(() => undefined);
                await Promise.race(promises);
              } else {
                await runPool(tasks, Math.max(1, spec.maxConcurrency ?? branchEdges.length));
              }
            }

            stepState.result = { branches: branchEdges.length };
            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId = nextId;
            continue;
          }

          case 'wait':
          case 'delay': {
            // `delay` is the legacy alias of `wait` — same durable semantics.
            const spec = (node.type === 'wait' ? node.wait : node.delay)!;
            let waitUntilMs: number;
            if (spec.mode === 'duration' && spec.durationMs) {
              waitUntilMs = Date.now() + spec.durationMs;
            } else if (spec.mode === 'until' && spec.until) {
              const resolved = resolveValue(spec.until, ctx);
              waitUntilMs = new Date(String(resolved)).getTime();
              if (Number.isNaN(waitUntilMs)) {
                throw new Error(`Wait node "${node.id}": "until" did not resolve to a valid date`);
              }
            } else {
              waitUntilMs = Date.now();
            }

            const inlineThresholdMs = (spec as Partial<WaitSpec>).inlineThresholdMs ?? DEFAULT_INLINE_THRESHOLD_MS;
            const remaining = waitUntilMs - Date.now();

            if (remaining > inlineThresholdMs && depth === 0) {
              // Durable park: only a top-level wait parks; the run is resumed
              // by cron (resumeDueWorkflowRuns) once resumeAt is due.
              stepState.status = 'WAITING';
              await this.persistStepLog(prisma, opts.runId, stepState, node);
              throw new WaitParkSignal(node.id, new Date(waitUntilMs));
            }

            if (remaining > 0) {
              // Nested waits (inside a loop/parallel body) sleep inline,
              // bounded by the inline threshold and the run deadline.
              await sleep(Math.min(remaining, inlineThresholdMs, Math.max(0, env.deadline - Date.now())));
            }

            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId = this.edgeTo(workflow, node.id, 'next');
            continue;
          }

          case 'action': {
            const actionSpec = node.action!;
            const connector = registry.get(actionSpec.provider);
            if (!connector) throw new Error(`Connector provider "${actionSpec.provider}" not registered`);

            const resolvedInputs: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(actionSpec.inputs)) {
              resolvedInputs[k] = resolveValue(v, ctx);
            }

            const auth = await opts.authResolver(actionSpec.provider);
            const idempotencyKey = actionSpec.idempotencyKey
              ? String(resolveValue(actionSpec.idempotencyKey, ctx))
              : computeIdempotencyKey(opts.tenantId, workflow.id, workflow.version, opts.runId, node.id);

            const result = await this.executeActionWithRetry(
              connector,
              auth,
              {
                runId: opts.runId,
                stepId: node.id,
                tenantId: opts.tenantId,
                operation: actionSpec.operation,
                inputs: resolvedInputs,
                timeoutMs: actionSpec.timeoutMs ?? 30000,
                idempotencyKey,
                correlationId: opts.runId,
              },
              actionSpec.retry,
            );

            if (result.ok) {
              if (actionSpec.outputs) {
                for (const [ctxPath, outputField] of Object.entries(actionSpec.outputs)) {
                  setContextValue(ctx, ctxPath, (result.output as Record<string, unknown>)[outputField]);
                }
              }
              ctx.steps[node.id] = { ...stepState, result: result.output, status: 'SUCCESS', endedAt: new Date().toISOString() };
              stepState.result = result.output;
              stepState.status = 'SUCCESS';
            } else {
              throw new Error(`Action failed: [${result.code}] ${result.message}`);
            }

            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            currentNodeId = this.edgeTo(workflow, node.id, 'next');
            continue;
          }

          case 'end': {
            stepState.status = 'SUCCESS';
            stepState.endedAt = new Date().toISOString();
            await this.persistStepLog(prisma, opts.runId, stepState, node);
            return;
          }

          default:
            // An unhandled node type must FAIL the run immediately. Without this,
            // the loop spins on the same node until maxRunSeconds (900s default).
            throw new Error(`Unsupported node type "${node.type}" (node "${node.id}")`);
        }
      } catch (err) {
        // Park is control flow, never routed through onError handlers.
        if (err instanceof WaitParkSignal) throw err;

        const errMsg = err instanceof Error ? err.message : String(err);
        stepState.error = errMsg;
        ctx.lastError = errMsg;

        // Guardrails (safety caps / run timeout) always fail the run — a node's
        // onError policy must not swallow them.
        const isGuardrail = errMsg.startsWith('SAFETY_LIMIT') || errMsg.startsWith('TIMED_OUT');

        const handler = node.onError ?? { mode: workflow.settings?.errorPolicy ?? 'fail_run', captureErrorAs: 'lastError' };

        if (handler.captureErrorAs) {
          ctx.vars[handler.captureErrorAs] = errMsg;
        }

        if (!isGuardrail && handler.mode === 'continue') {
          stepState.status = 'FAILED';
          stepState.endedAt = new Date().toISOString();
          await this.persistStepLog(prisma, opts.runId, stepState, node);
          currentNodeId = this.edgeTo(workflow, node.id, 'next');
          continue;
        }

        if (!isGuardrail && handler.mode === 'route_to_error_edge') {
          stepState.status = 'FAILED';
          stepState.endedAt = new Date().toISOString();
          await this.persistStepLog(prisma, opts.runId, stepState, node);
          const errorTarget = this.edgeTo(workflow, node.id, 'error');
          if (errorTarget) {
            currentNodeId = errorTarget;
            continue;
          }
        }

        stepState.status = 'FAILED';
        stepState.endedAt = new Date().toISOString();
        await this.persistStepLog(prisma, opts.runId, stepState, node);
        throw err;
      }
    }
  }

  // ─── Action Execution with Retry ──────────────────────────────────

  private async executeActionWithRetry(
    connector: Connector,
    auth: AuthContext,
    req: Parameters<Connector['invoke']>[1],
    retryPolicy?: RetryPolicy,
  ): Promise<InvokeResult> {
    const maxAttempts = retryPolicy?.maxAttempts ?? 3;
    const backoff = retryPolicy?.backoff ?? 'exponential';
    const baseDelay = retryPolicy?.baseDelayMs ?? 500;
    const maxDelay = retryPolicy?.maxDelayMs ?? 30000;
    const jitter = retryPolicy?.jitter ?? true;

    let lastResult: InvokeResult | null = null;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);

      try {
        lastResult = await connector.invoke(auth, req);
      } catch (err) {
        lastResult = {
          ok: false,
          code: 'NETWORK',
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
      }

      if (lastResult.ok) return lastResult;
      if (!lastResult.retryable) return lastResult;
      if (attempt >= maxAttempts) return lastResult;

      let delay: number;
      if (lastResult.retryAfterMs) {
        delay = lastResult.retryAfterMs;
      } else if (backoff === 'exponential') {
        delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      } else {
        delay = baseDelay;
      }

      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      await sleep(delay);
    }

    return lastResult!;
  }

  // ─── Shopify Flow Delegation ──────────────────────────────────────

  private async delegateToShopifyFlow(
    workflow: Workflow,
    triggerPayload: Record<string, unknown>,
    opts: { tenantId: string; runId: string },
  ): Promise<WorkflowRunResult> {
    /**
     * When executionMode is 'shopify_flow', the app emits a trigger event
     * to Shopify Flow rather than running the workflow locally.
     *
     * The workflow definition was previously installed into Shopify Flow
     * via the Flow extension APIs (triggers + actions).
     *
     * Runtime: Shopify handles execution; our app provides action endpoints
     * that Flow calls back into (via action webhooks).
     */
    const prisma = getPrisma();
    await prisma.workflowRun.create({
      data: {
        id: opts.runId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        tenantId: opts.tenantId,
        status: 'RUNNING',
        triggerRef: JSON.stringify({ provider: 'shopify_flow', event: workflow.trigger.event }),
        startedAt: new Date(),
        contextJson: JSON.stringify({ delegated: true, triggerPayload }),
      },
    });

    return {
      status: 'RUNNING',
      delegatedTo: 'shopify_flow',
      context: undefined,
    };
  }

  // ─── Run Finalization (terminal + parked persistence) ─────────────

  private async finalizeRun(
    workflow: Workflow,
    ctx: RunContext,
    runId: string,
    outcome:
      | { status: 'SUCCEEDED' }
      | { status: 'FAILED'; error: string }
      | { status: 'WAITING'; resumeAt: Date; resumeNodeId: string },
  ): Promise<void> {
    const prisma = getPrisma();

    if (outcome.status === 'WAITING') {
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'WAITING',
          resumeAt: outcome.resumeAt,
          resumeNodeId: outcome.resumeNodeId,
          // Snapshot the compiled graph so resume is self-contained even if
          // the source module/flow changes while the run is parked.
          workflowJson: JSON.stringify(workflow),
          contextJson: JSON.stringify(ctx),
        },
      });
      return;
    }

    await prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: outcome.status,
        endedAt: new Date(),
        error: outcome.status === 'FAILED' ? outcome.error : null,
        contextJson: JSON.stringify(ctx),
      },
    });
  }

  // ─── Graph Navigation ─────────────────────────────────────────────

  private findStartNode(workflow: Workflow): string {
    const targetIds = new Set(workflow.edges.map(e => e.to));
    const starts = workflow.nodes.filter(n => !targetIds.has(n.id));
    return starts[0]?.id ?? workflow.nodes[0]!.id;
  }

  private edgeTo(workflow: Workflow, fromId: string, label: string): string | null {
    const edge = workflow.edges.find(e => e.from === fromId && e.label === label);
    return edge?.to ?? null;
  }

  private resolveNextNode(workflow: Workflow, node: WorkflowNode, stepState: StepState): string | null {
    if (node.type === 'condition') {
      const val = stepState.result?.value;
      return this.edgeTo(workflow, node.id, val ? 'true' : 'false');
    }
    if (node.type === 'switch') {
      const val = stepState.result?.value;
      return (
        this.edgeTo(workflow, node.id, `case:${String(val)}`) ??
        this.edgeTo(workflow, node.id, 'default')
      );
    }
    return this.edgeTo(workflow, node.id, 'next');
  }

  /** All nodes reachable from `startId` following any out-edge. */
  private reachableFrom(workflow: Workflow, startId: string): Set<string> {
    const adj = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge.to);
    }
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of adj.get(current) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
    return visited;
  }

  /**
   * The owned sub-graph of a loop/parallel body:
   * reachable(body edge) \ reachable(next edge). Partitions the body from the
   * post-loop continuation without back-edges, keeping the DAG acyclic.
   */
  private ownedSubgraph(workflow: Workflow, bodyStartId: string, continuationId: string | null): Set<string> {
    const owned = this.reachableFrom(workflow, bodyStartId);
    if (continuationId) {
      for (const id of this.reachableFrom(workflow, continuationId)) {
        owned.delete(id);
      }
    }
    return owned;
  }

  private assertDepth(depth: number): void {
    if (depth > MAX_RECURSION_DEPTH) {
      throw new Error(`SAFETY_LIMIT: run exceeded MAX_RECURSION_DEPTH (${MAX_RECURSION_DEPTH})`);
    }
  }

  private getOrInitStep(ctx: RunContext, nodeId: string): StepState {
    if (!ctx.steps[nodeId]) {
      ctx.steps[nodeId] = { nodeId, status: 'PENDING', attempt: 0 };
    }
    return ctx.steps[nodeId]!;
  }

  // ─── Persistence ──────────────────────────────────────────────────

  private async persistStepLog(
    prisma: ReturnType<typeof getPrisma>,
    runId: string,
    step: StepState,
    node: WorkflowNode,
  ): Promise<void> {
    const startMs = step.startedAt ? new Date(step.startedAt).getTime() : Date.now();
    const endMs = step.endedAt ? new Date(step.endedAt).getTime() : Date.now();

    await prisma.workflowRunStep.create({
      data: {
        runId,
        stepId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: step.status,
        attempt: step.attempt,
        startedAt: step.startedAt ? new Date(step.startedAt) : new Date(),
        endedAt: step.endedAt ? new Date(step.endedAt) : null,
        durationMs: endMs - startMs,
        inputsJson: step.inputs ? JSON.stringify(step.inputs) : null,
        resultJson: step.result ? JSON.stringify(step.result) : null,
        error: step.error ?? null,
      },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function computeIdempotencyKey(
  tenantId: string,
  workflowId: string,
  workflowVersion: number,
  runId: string,
  stepId: string,
): string {
  return `${tenantId}::${workflowId}::${workflowVersion}::${runId}::${stepId}`;
}

function setContextValue(ctx: RunContext, path: string, value: unknown): void {
  const segments = path.split('.');
  let obj: Record<string, unknown> = ctx as unknown as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (!(seg in obj) || typeof obj[seg] !== 'object') {
      obj[seg] = {};
    }
    obj = obj[seg] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1]!;
  obj[last] = value;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Run async tasks with bounded concurrency; rejects on the first failure. */
async function runPool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]!();
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Result Type ──────────────────────────────────────────────────────

export interface WorkflowRunResult {
  status: RunStatus | 'RUNNING';
  error?: string;
  context?: RunContext;
  delegatedTo?: string;
  /** Set when the run parked on a durable wait (status WAITING). */
  resumeAt?: Date;
}
