import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { ConnectorService } from '~/services/connectors/connector.service';
import { JobService } from '~/services/jobs/job.service';

type Trigger = 'MANUAL' | 'SHOPIFY_WEBHOOK_ORDER_CREATED' | 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED';

const MAX_STEP_RETRIES = 2;
const STEP_BACKOFF_BASE_MS = 500;

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
        payload: { flowId: flow.id, trigger, eventKind: (event as any)?.kind ?? 'webhook' },
      });
      await jobs.start(job.id);

      try {
        await this.executeFlow(shopDomain, admin, job.id, spec, event, shopRow?.id);
        await jobs.succeed(job.id, { trigger, steps: (spec.config.steps as any[]).length });
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
    spec: any,
    event: unknown,
    shopId?: string
  ) {
    const prisma = getPrisma();

    for (let stepIdx = 0; stepIdx < spec.config.steps.length; stepIdx++) {
      const step = spec.config.steps[stepIdx];
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
    step: any,
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

  private async executeStep(shopDomain: string, admin: AdminApiContext['admin'], step: any, event: unknown): Promise<unknown> {
    if (step.kind === 'HTTP_REQUEST') {
      const connectors = new ConnectorService();
      const result = await connectors.test(shopDomain, {
        connectorId: step.connectorId,
        path: step.path,
        method: step.method,
        body: { event, mapping: step.bodyMapping },
      });
      return result;
    }

    if (step.kind === 'TAG_CUSTOMER') {
      const customerGid = (event as any)?.customer?.admin_graphql_api_id;
      if (customerGid) await tagCustomer(admin, customerGid, step.tag);
      return { tagged: Boolean(customerGid) };
    }

    if (step.kind === 'ADD_ORDER_NOTE') {
      const orderGid = (event as any)?.admin_graphql_api_id;
      if (orderGid) await addOrderNote(admin, orderGid, step.note);
      return { noted: Boolean(orderGid) };
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
  await prisma.flowStepLog.create({
    data: {
      jobId,
      shopId: shopId ?? null,
      step,
      kind,
      status,
      durationMs,
      output: output ? JSON.stringify(output).slice(0, 10_000) : null,
      error: error?.slice(0, 2000) ?? null,
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
