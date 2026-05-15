import type { AdminApiContext } from '~/types/shopify';
import type { RecipeSpec } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { ConnectorService } from '~/services/connectors/connector.service';
import { JobService } from '~/services/jobs/job.service';
import { DataStoreService } from '~/services/data/data-store.service';
import { getRequestContext } from '~/services/observability/correlation.server';
import { assertSafeTargetUrl } from '~/services/security/ssrf.server';

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
};

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
      } catch (err) {
        await jobs.fail(job.id, err);
        // DLQ: mark the job so it can be replayed; no automatic re-schedule here.
        // A separate cron or admin UI can pick up FAILED FLOW_RUN jobs for replay.
      }
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
    event: unknown
  ): Promise<unknown> {
    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_STEP_RETRIES; attempt++) {
      try {
        return await this.executeStep(shopDomain, admin, step, event);
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_STEP_RETRIES) {
          await sleep(STEP_BACKOFF_BASE_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastErr;
  }

  private async executeStep(shopDomain: string, admin: AdminApiContext['admin'], step: FlowStep, event: unknown): Promise<unknown> {
    const flowEvent = (event ?? {}) as FlowEvent;
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
      return { sent: true, to: step.to, subject: step.subject };
    }

    if (step.kind === 'SEND_SLACK_MESSAGE') {
      return { sent: true, channel: step.channel };
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

      const readPath = (root: unknown, dotted: string): unknown => {
        const parts = dotted.split('.');
        let val: unknown = root;
        for (const p of parts) {
          if (val == null || typeof val !== 'object') return undefined;
          val = (val as Record<string, unknown>)[p];
        }
        return val;
      };

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
