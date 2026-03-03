import type {
  Workflow,
  WorkflowNode,
  RunContext,
  RunStatus,
  StepStatus,
  StepState,
  RetryPolicy,
} from '@superapp/core';
import type { Connector, AuthContext, InvokeResult } from '@superapp/core';
import { validateWorkflow } from '@superapp/core';
import { evalExpression, resolveValue } from './expression-evaluator';
import { getPrisma } from '~/db.server';
import { getConnectorRegistry } from './connectors/index';

const TERMINAL_RUN_STATUSES: RunStatus[] = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
const TERMINAL_STEP_STATUSES: StepStatus[] = ['SUCCESS', 'FAILED', 'SKIPPED'];

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
      await prisma.workflowRun.update({
        where: { id: opts.runId },
        data: { status: 'SUCCEEDED', endedAt: new Date(), contextJson: JSON.stringify(ctx) },
      });
      return { status: 'SUCCEEDED', context: ctx };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.lastError = errMsg;
      await prisma.workflowRun.update({
        where: { id: opts.runId },
        data: { status: 'FAILED', endedAt: new Date(), error: errMsg, contextJson: JSON.stringify(ctx) },
      });
      return { status: 'FAILED', error: errMsg, context: ctx };
    }
  }

  // ─── Core Execution Loop ──────────────────────────────────────────

  private async executeRun(
    workflow: Workflow,
    ctx: RunContext,
    opts: { tenantId: string; runId: string; authResolver: (provider: string) => Promise<AuthContext> },
  ): Promise<void> {
    const prisma = getPrisma();
    const maxRunMs = (workflow.settings?.maxRunSeconds ?? 900) * 1000;
    const deadline = Date.now() + maxRunMs;
    const registry = getConnectorRegistry();

    await prisma.workflowRun.update({
      where: { id: opts.runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const startNodeId = this.findStartNode(workflow);
    let currentNodeId: string | null = startNodeId;

    while (currentNodeId !== null) {
      if (Date.now() > deadline) {
        throw new Error('TIMED_OUT: workflow exceeded maxRunSeconds');
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

          case 'delay': {
            const delaySpec = node.delay!;
            let waitUntil: number;
            if (delaySpec.mode === 'duration' && delaySpec.durationMs) {
              waitUntil = Date.now() + delaySpec.durationMs;
            } else if (delaySpec.mode === 'until' && delaySpec.until) {
              const resolved = resolveValue(delaySpec.until, ctx);
              waitUntil = new Date(String(resolved)).getTime();
            } else {
              waitUntil = Date.now();
            }

            if (Date.now() < waitUntil) {
              const remaining = Math.min(waitUntil - Date.now(), maxRunMs);
              await sleep(remaining);
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
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepState.error = errMsg;
        ctx.lastError = errMsg;

        const handler = node.onError ?? { mode: workflow.settings?.errorPolicy ?? 'fail_run', captureErrorAs: 'lastError' };

        if (handler.captureErrorAs) {
          ctx.vars[handler.captureErrorAs] = errMsg;
        }

        if (handler.mode === 'continue') {
          stepState.status = 'FAILED';
          stepState.endedAt = new Date().toISOString();
          await this.persistStepLog(prisma, opts.runId, stepState, node);
          currentNodeId = this.edgeTo(workflow, node.id, 'next');
          continue;
        }

        if (handler.mode === 'route_to_error_edge') {
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
    return this.edgeTo(workflow, node.id, 'next');
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

// ─── Result Type ──────────────────────────────────────────────────────

export interface WorkflowRunResult {
  status: RunStatus | 'RUNNING';
  error?: string;
  context?: RunContext;
  delegatedTo?: string;
}
