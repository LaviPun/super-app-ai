import type { AdminApiContext } from '~/types/shopify';
import type { RecipeSpec } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { ConnectorService } from '~/services/connectors/connector.service';
import { JobService } from '~/services/jobs/job.service';
import { DataStoreService } from '~/services/data/data-store.service';
import { getRequestContext } from '~/services/observability/correlation.server';
import { assertSafeTargetUrl } from '~/services/security/ssrf.server';
import { getConnector } from '~/services/workflows/connectors/index';
import { emitFlowTriggerSafe, FLOW_TRIGGER_TOPICS } from '~/services/workflows/shopify-flow-bridge';

type Trigger =
  | 'MANUAL'
  | 'SHOPIFY_WEBHOOK_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED'
  | 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED'
  | 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED'
  | 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_COLLECTION_CREATED'
  | 'SCHEDULED'
  | 'SUPERAPP_MODULE_PUBLISHED'
  | 'SUPERAPP_CONNECTOR_SYNCED'
  | 'SUPERAPP_DATA_RECORD_CREATED'
  | 'SUPERAPP_WORKFLOW_COMPLETED'
  | 'SUPERAPP_WORKFLOW_FAILED';

const MAX_STEP_RETRIES = 2;
const STEP_BACKOFF_BASE_MS = 500;

type FlowEvent = {
  kind?: string;
  admin_graphql_api_id?: string;
  customer?: {
    admin_graphql_api_id?: string;
  };
  [key: string]: unknown;
};

type FlowStep = {
  kind: string;
  connectorId?: string;
  path?: string;
  method?: string;
  bodyMapping?: Record<string, unknown>;
  tags?: string;
  to?: string;
  subject?: string;
  channel?: string;
  tag?: string;
  note?: string;
  text?: string;
  storeKey?: string;
  titleExpr?: string;
  payloadMapping?: Record<string, unknown>;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  authType?: 'basic' | 'bearer' | 'custom_header';
  authConfig?: {
    username?: string;
    password?: string;
    token?: string;
    headerName?: string;
    headerValue?: string;
  };
  // CONDITION step
  field?: string;
  operator?: string;
  value?: string;
  thenSteps?: FlowStep[];
  elseSteps?: FlowStep[];
};

/** Max nesting depth for CONDITION branches (guards handcrafted specs). */
const MAX_CONDITION_DEPTH = 3;

type FlowAutomationSpec = RecipeSpec & {
  type: 'flow.automation';
  config: {
    trigger: Trigger;
    steps: FlowStep[];
  };
};

export class FlowRunnerService {
  async runForTrigger(shopDomain: string, admin: AdminApiContext['admin'], trigger: Trigger, event: unknown) {
    const prisma = getPrisma();
    const flows = await prisma.module.findMany({
      where: { shop: { shopDomain }, type: 'flow.automation', status: 'PUBLISHED', activeVersionId: { not: null } },
      include: { activeVersion: true },
    });

    const recipe = new RecipeService();
    for (const flow of flows) {
      if (!flow.activeVersion) continue;
      const spec = recipe.parse(flow.activeVersion.specJson);
      if (spec.type !== 'flow.automation') continue;
      if (spec.config.trigger !== trigger) continue;

      const jobs = new JobService();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain } });
      const job = await jobs.create({
        shopId: shopRow?.id,
        type: 'FLOW_RUN',
        payload: { flowId: flow.id, trigger, eventKind: (event as FlowEvent)?.kind ?? 'webhook' },
      });
      await jobs.start(job.id);

      try {
        await this.executeFlow(shopDomain, admin, job.id, spec as FlowAutomationSpec, event, shopRow?.id);
        await jobs.succeed(job.id, { trigger, steps: spec.config.steps.length });
        // Best-effort: notify Shopify Flow that a SuperApp workflow completed.
        void emitFlowTriggerSafe(shopDomain, shopRow?.accessToken, FLOW_TRIGGER_TOPICS.WORKFLOW_COMPLETED, {
          'Workflow ID': flow.id,
          'Workflow Name': flow.name,
          'Run ID': job.id,
          'Shop Domain': shopDomain,
        });
      } catch (err) {
        await jobs.fail(job.id, err);
        // Best-effort: notify Shopify Flow that a SuperApp workflow failed.
        void emitFlowTriggerSafe(shopDomain, shopRow?.accessToken, FLOW_TRIGGER_TOPICS.WORKFLOW_FAILED, {
          'Workflow ID': flow.id,
          'Workflow Name': flow.name,
          'Run ID': job.id,
          'Error Message': err instanceof Error ? err.message : String(err),
          'Shop Domain': shopDomain,
        });
        // DLQ: mark the job so it can be replayed; no automatic re-schedule here.
        // A separate cron or admin UI can pick up FAILED FLOW_RUN jobs for replay.
      }
    }
  }

  /**
   * Run a single flow.automation module by id (admin "Run now", targeted replay).
   * Unlike `runForTrigger` — which fans out to every matching flow — this targets
   * exactly one flow and requires it to have a published (active) version.
   * Returns the FLOW_RUN job id and the number of executed steps; throws (after
   * marking the job FAILED) when the flow is missing, unpublished, or a step fails.
   */
  async runFlowById(shopDomain: string, admin: AdminApiContext['admin'], flowId: string, event: unknown) {
    const prisma = getPrisma();
    const flow = await prisma.module.findFirst({
      where: { id: flowId, shop: { shopDomain }, type: 'flow.automation' },
      include: { activeVersion: true },
    });
    if (!flow) throw new Error(`Flow ${flowId} not found for ${shopDomain}`);
    if (!flow.activeVersion) throw new Error(`${flow.name} has no published version to run`);

    const spec = new RecipeService().parse(flow.activeVersion.specJson);
    if (spec.type !== 'flow.automation') throw new Error(`${flow.name} is not a flow.automation module`);
    const flowSpec = spec as FlowAutomationSpec;

    const jobs = new JobService();
    const shopRow = await prisma.shop.findUnique({ where: { shopDomain } });
    const job = await jobs.create({
      shopId: shopRow?.id,
      type: 'FLOW_RUN',
      payload: { flowId: flow.id, trigger: 'MANUAL', eventKind: (event as FlowEvent)?.kind ?? 'manual' },
    });
    await jobs.start(job.id);

    try {
      await this.executeFlow(shopDomain, admin, job.id, flowSpec, event, shopRow?.id);
      const result = { jobId: job.id, steps: flowSpec.config.steps.length };
      await jobs.succeed(job.id, { trigger: 'MANUAL', steps: result.steps });
      // Best-effort: notify Shopify Flow that a SuperApp workflow completed.
      void emitFlowTriggerSafe(shopDomain, shopRow?.accessToken, FLOW_TRIGGER_TOPICS.WORKFLOW_COMPLETED, {
        'Workflow ID': flow.id,
        'Workflow Name': flow.name,
        'Run ID': job.id,
        'Shop Domain': shopDomain,
      });
      return result;
    } catch (err) {
      await jobs.fail(job.id, err);
      // Best-effort: notify Shopify Flow that a SuperApp workflow failed.
      void emitFlowTriggerSafe(shopDomain, shopRow?.accessToken, FLOW_TRIGGER_TOPICS.WORKFLOW_FAILED, {
        'Workflow ID': flow.id,
        'Workflow Name': flow.name,
        'Run ID': job.id,
        'Error Message': err instanceof Error ? err.message : String(err),
        'Shop Domain': shopDomain,
      });
      throw err;
    }
  }

  private async executeFlow(
    shopDomain: string,
    admin: AdminApiContext['admin'],
    jobId: string,
    spec: FlowAutomationSpec,
    event: unknown,
    shopId?: string
  ) {
    const prisma = getPrisma();

    for (let stepIdx = 0; stepIdx < spec.config.steps.length; stepIdx++) {
      const step = spec.config.steps[stepIdx];
      if (!step) continue;
      const start = Date.now();
      let output: unknown;
      let stepError: string | undefined;

      try {
        output = await this.executeStepWithRetry(shopDomain, admin, step, event);
      } catch (err) {
        stepError = String(err);
        await writeStepLog(prisma, jobId, shopId, stepIdx, step.kind, 'FAILED', Date.now() - start, undefined, stepError);
        throw err;
      }

      await writeStepLog(prisma, jobId, shopId, stepIdx, step.kind, 'SUCCESS', Date.now() - start, output);
    }
  }

  private async executeStepWithRetry(
    shopDomain: string,
    admin: AdminApiContext['admin'],
    step: FlowStep,
    event: unknown,
    depth = 0
  ): Promise<unknown> {
    // CONDITION runs once, without outer retries: its nested steps already
    // retry individually, and retrying the whole branch would re-run side
    // effects of nested steps that had already succeeded.
    if (step.kind === 'CONDITION') {
      return this.executeStep(shopDomain, admin, step, event, depth);
    }

    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_STEP_RETRIES; attempt++) {
      try {
        return await this.executeStep(shopDomain, admin, step, event, depth);
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_STEP_RETRIES) {
          await sleep(STEP_BACKOFF_BASE_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastErr;
  }

  private async executeStep(shopDomain: string, admin: AdminApiContext['admin'], step: FlowStep, event: unknown, depth = 0): Promise<unknown> {
    const flowEvent = (event ?? {}) as FlowEvent;

    if (step.kind === 'CONDITION') {
      if (depth >= MAX_CONDITION_DEPTH) {
        throw new Error(`CONDITION nesting exceeds max depth of ${MAX_CONDITION_DEPTH}`);
      }
      const matched = evaluateCondition(event, step.field, step.operator, step.value);
      const branch = (matched ? step.thenSteps : step.elseSteps) ?? [];
      const outputs: unknown[] = [];
      for (const sub of branch) {
        outputs.push(await this.executeStepWithRetry(shopDomain, admin, sub, event, depth + 1));
      }
      return { condition: matched, branch: matched ? 'then' : 'else', executed: branch.length, outputs };
    }
    if (step.kind === 'HTTP_REQUEST') {
      if (!step.connectorId || !step.path) {
        return { skipped: true, reason: 'missing connectorId or path' };
      }
      const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
      const method = (validMethods as readonly string[]).includes(String(step.method).toUpperCase())
        ? (String(step.method).toUpperCase() as (typeof validMethods)[number])
        : 'GET';
      const connectors = new ConnectorService();
      const result = await connectors.test(shopDomain, {
        connectorId: step.connectorId,
        path: step.path,
        method,
        body: { event, mapping: step.bodyMapping },
      });
      return result;
    }

    if (step.kind === 'SEND_HTTP_REQUEST') {
      return await executeSendHttpRequest(step);
    }

    if (step.kind === 'TAG_ORDER') {
      const orderGid = flowEvent.admin_graphql_api_id;
      if (orderGid) {
        const tags = typeof step.tags === 'string' ? step.tags.split(',').map((t: string) => t.trim()) : [];
        await tagOrder(admin, orderGid, tags);
      }
      return { tagged: Boolean(orderGid) };
    }

    if (step.kind === 'SEND_EMAIL_NOTIFICATION') {
      // Real send via the EmailConnector (same wiring as shopify-flow-bridge).
      // Fails loudly when EMAIL_API_KEY isn't configured — never fake success.
      const connector = getConnector('email');
      if (!connector) throw new Error('Email connector not registered');
      const result = await connector.invoke(
        { type: 'api_key', apiKey: process.env.EMAIL_API_KEY ?? '' },
        {
          runId: `flow-step-${Date.now()}`,
          stepId: 'SEND_EMAIL_NOTIFICATION',
          tenantId: shopDomain,
          operation: 'send',
          inputs: { to: step.to, subject: step.subject, body: step.body ?? step.note ?? '' },
          timeoutMs: 10000,
        },
      );
      if (!result.ok) throw new Error(`Email send failed: ${result.message}`);
      return { sent: true, to: step.to, subject: step.subject, output: result.output };
    }

    if (step.kind === 'SEND_SLACK_MESSAGE') {
      // Real send via the SlackConnector incoming webhook. The webhook URL comes
      // from the step or SLACK_WEBHOOK_URL; without one this step must fail, not
      // pretend it posted.
      const webhookUrl = step.url || process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('Slack step has no webhook URL (set the step URL or SLACK_WEBHOOK_URL)');
      }
      const connector = getConnector('slack');
      if (!connector) throw new Error('Slack connector not registered');
      const result = await connector.invoke(
        { type: 'none' },
        {
          runId: `flow-step-${Date.now()}`,
          stepId: 'SEND_SLACK_MESSAGE',
          tenantId: shopDomain,
          operation: 'webhook.send',
          // The builder stores the authored message in `text`; older specs used `body`/`note`.
          inputs: { webhookUrl, text: step.text ?? step.body ?? step.note ?? `Flow event from ${shopDomain}` },
          timeoutMs: 10000,
        },
      );
      if (!result.ok) throw new Error(`Slack send failed: ${result.message}`);
      return { sent: true, channel: step.channel ?? 'webhook', output: result.output };
    }

    if (step.kind === 'TAG_CUSTOMER') {
      const customerGid = flowEvent.customer?.admin_graphql_api_id;
      if (customerGid && step.tag) await tagCustomer(admin, customerGid, step.tag);
      return { tagged: Boolean(customerGid && step.tag) };
    }

    if (step.kind === 'ADD_ORDER_NOTE') {
      const orderGid = flowEvent.admin_graphql_api_id;
      if (orderGid && step.note) await addOrderNote(admin, orderGid, step.note);
      return { noted: Boolean(orderGid && step.note) };
    }

    if (step.kind === 'WRITE_TO_STORE') {
      if (!step.storeKey) return { written: false, reason: 'missing storeKey' };
      const storeKey = step.storeKey;
      const prisma = getPrisma();
      const shopRow = await prisma.shop.findFirst({ where: { shopDomain } });
      if (!shopRow) return { written: false, reason: 'shop not found' };

      const dss = new DataStoreService();
      let store = await dss.getStoreByKey(shopRow.id, storeKey);
      if (!store) {
        await dss.enableStore(shopRow.id, storeKey);
        store = await dss.getStoreByKey(shopRow.id, storeKey);
      }
      if (!store) return { written: false, reason: 'store not found' };

      const title = step.titleExpr
        ? String(step.titleExpr).replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
            const val = readPath(event, path);
            return val != null ? String(val) : '';
          })
        : undefined;

      const mapping = step.payloadMapping ?? {};
      const payload = Object.keys(mapping).length > 0
        ? Object.fromEntries(
            Object.entries(mapping).map(([k, expr]) => [k, readPath(event, String(expr))]),
          )
        : event;

      const record = await dss.createRecord(store.id, { title, payload });
      return { written: true, recordId: record.id };
    }

    return { skipped: true, kind: step.kind };
  }
}

async function writeStepLog(
  prisma: ReturnType<typeof getPrisma>,
  jobId: string,
  shopId: string | undefined,
  step: number,
  kind: string,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  durationMs: number,
  output?: unknown,
  error?: string
) {
  if (process.env.NODE_ENV === 'test') return;
  const ctx = getRequestContext();
  await prisma.flowStepLog.create({
    data: {
      jobId,
      shop: shopId ? { connect: { id: shopId } } : undefined,
      step,
      kind,
      status,
      durationMs,
      output: output ? JSON.stringify(output).slice(0, 10_000) : null,
      error: error?.slice(0, 2000) ?? null,
      correlationId: ctx?.correlationId ?? ctx?.requestId ?? null,
    },
  });
}

async function tagCustomer(admin: AdminApiContext['admin'], customerId: string, tag: string) {
  const mutation = `#graphql
    mutation AddCustomerTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }
  `;
  const res = await admin.graphql(mutation, { variables: { id: customerId, tags: [tag] } });
  const json = await res.json();
  const errs = json?.data?.tagsAdd?.userErrors ?? [];
  if (errs.length) throw new Error(errs[0].message);
}

async function addOrderNote(admin: AdminApiContext['admin'], orderId: string, note: string) {
  const mutation = `#graphql
    mutation UpdateOrderNote($input: OrderInput!) {
      orderUpdate(input: $input) {
        userErrors { field message }
      }
    }
  `;
  const res = await admin.graphql(mutation, { variables: { input: { id: orderId, note } } });
  const json = await res.json();
  const errs = json?.data?.orderUpdate?.userErrors ?? [];
  if (errs.length) throw new Error(errs[0].message);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Read a dot-path (e.g. "customer.orders_count") out of the trigger event. */
function readPath(root: unknown, dotted: string): unknown {
  const parts = dotted.split('.');
  let val: unknown = root;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}

/**
 * Evaluate a CONDITION step against the trigger event. Numeric comparison is
 * used when both sides parse as numbers; otherwise string comparison.
 */
function evaluateCondition(event: unknown, field?: string, operator?: string, value?: string): boolean {
  const raw = field ? readPath(event, field) : undefined;

  if (operator === 'is_set') return raw !== undefined && raw !== null && raw !== '';
  if (operator === 'is_not_set') return raw === undefined || raw === null || raw === '';

  const expected = value ?? '';
  const actualStr = raw == null ? '' : String(raw);
  const actualNum = typeof raw === 'number' ? raw : Number(actualStr);
  const expectedNum = Number(expected);
  const bothNumeric =
    actualStr.trim() !== '' && !Number.isNaN(actualNum) &&
    expected.trim() !== '' && !Number.isNaN(expectedNum);

  switch (operator) {
    case 'equal_to': return bothNumeric ? actualNum === expectedNum : actualStr === expected;
    case 'not_equal_to': return bothNumeric ? actualNum !== expectedNum : actualStr !== expected;
    case 'greater_than': return bothNumeric && actualNum > expectedNum;
    case 'less_than': return bothNumeric && actualNum < expectedNum;
    case 'greater_than_or_equal': return bothNumeric && actualNum >= expectedNum;
    case 'less_than_or_equal': return bothNumeric && actualNum <= expectedNum;
    case 'contains': return actualStr.includes(expected);
    case 'not_contains': return !actualStr.includes(expected);
    case 'starts_with': return actualStr.startsWith(expected);
    case 'ends_with': return actualStr.endsWith(expected);
    default: throw new Error(`Unknown condition operator: ${String(operator)}`);
  }
}

async function executeSendHttpRequest(step: FlowStep): Promise<unknown> {
  const { url, method, headers: customHeaders, body, authType, authConfig } = step;
  if (!url) throw new Error('SEND_HTTP_REQUEST step missing url');

  const parsed = await assertSafeTargetUrl(url, { context: 'Flow HTTP step URL' });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders && typeof customHeaders === 'object' ? customHeaders : {}),
  };

  if (authType === 'basic' && authConfig?.username) {
    headers['Authorization'] = `Basic ${btoa(`${authConfig.username}:${authConfig.password ?? ''}`)}`;
  } else if (authType === 'bearer' && authConfig?.token) {
    headers['Authorization'] = `Bearer ${authConfig.token}`;
  } else if (authType === 'custom_header' && authConfig?.headerName) {
    headers[authConfig.headerName] = authConfig.headerValue ?? '';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(parsed.toString(), {
      method: String(method ?? 'POST'),
      headers,
      body: body && body.length > 0 ? body : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsedBody: unknown;
    try { parsedBody = JSON.parse(text); } catch { parsedBody = text.slice(0, 50_000); }
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: parsedBody };
  } finally {
    clearTimeout(timer);
  }
}

async function tagOrder(admin: AdminApiContext['admin'], orderId: string, tags: string[]) {
  const mutation = `#graphql
    mutation AddOrderTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }
  `;
  const res = await admin.graphql(mutation, { variables: { id: orderId, tags } });
  const json = await res.json();
  const errs = json?.data?.tagsAdd?.userErrors ?? [];
  if (errs.length) throw new Error(errs[0].message);
}
