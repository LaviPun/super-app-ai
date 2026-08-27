import { ConnectorService } from '~/services/connectors/connector.service';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { MessagingRunnerService } from '~/services/messaging/messaging-runner.service';
import { HttpSyncRunnerService } from '~/services/integration/http-sync-runner.service';
import { RestockWatcherService } from '~/services/messaging/restock-watcher.server';
import { accrueForOrder } from '~/services/composites/loyalty-accrual.server';
import { unauthenticated } from '~/shopify.server';
import { getPrisma } from '~/db.server';

/**
 * WS-G Task 14 (Decision G8) + Task 20. The set of JobType values this app's
 * own worker (scripts/worker.ts, via ops-queue.server.ts) can actually
 * execute. Deliberately EXCLUDES AI_GENERATE/AI_HYDRATE/AI_MODIFY/PUBLISH —
 * those are owned by WS-C's `createWebWorkerRuntime` +
 * `@superapp/platform-contracts` PlatformJobType registry (a locked
 * cross-service contract shared with the Cloudflare side, see
 * worker-runtime.server.ts) and this registry must never overlap it.
 */
export type OwnedJobType =
  | 'CONNECTOR_TEST'
  | 'FLOW_RUN'
  | 'MESSAGING_RUN'
  | 'HTTP_SYNC_RUN'
  | 'RESTOCK_WATCH_RUN'
  | 'LOYALTY_ACCRUAL_RUN';

const OWNED = new Set<string>([
  'CONNECTOR_TEST',
  'FLOW_RUN',
  'MESSAGING_RUN',
  'HTTP_SYNC_RUN',
  'RESTOCK_WATCH_RUN',
  'LOYALTY_ACCRUAL_RUN',
]);

export function isOwnedJobType(type: string): type is OwnedJobType {
  return OWNED.has(type);
}

async function resolveShopDomain(shopId: string): Promise<string> {
  const shop = await getPrisma().shop.findUnique({ where: { id: shopId }, select: { shopDomain: true } });
  if (!shop) throw new Error(`Shop ${shopId} not found — cannot replay/enqueue against it`);
  return shop.shopDomain;
}

/**
 * JobType → real executor taking the STORED Job.payload (parsed) and
 * returning a result to persist on success. Each executor wraps the SAME
 * service call the original inline call site used, so replaying/enqueueing a
 * job produces identical behavior to the original synchronous path.
 */
export const JOB_EXECUTORS: Record<OwnedJobType, (payload: unknown, ctx: { shopId?: string }) => Promise<unknown>> = {
  CONNECTOR_TEST: async (payload) => {
    const p = payload as { shopDomain: string; connectorId: string; path: string; method: string };
    return new ConnectorService().test(p.shopDomain, {
      connectorId: p.connectorId,
      path: p.path,
      method: p.method as never,
    });
  },
  FLOW_RUN: async (payload, ctx) => {
    const p = payload as { moduleId: string; event?: unknown };
    if (!ctx.shopId) throw new Error('FLOW_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    const { admin } = await unauthenticated.admin(shopDomain);
    return new FlowRunnerService().runFlowById(
      shopDomain,
      admin,
      p.moduleId,
      (p.event as { kind: string }) ?? { kind: 'manual', source: 'worker-replay' },
    );
  },
  MESSAGING_RUN: async (payload, ctx) => {
    const p = payload as { trigger: string; event: unknown };
    if (!ctx.shopId) throw new Error('MESSAGING_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    const { admin } = await unauthenticated.admin(shopDomain);
    return new MessagingRunnerService().runForTrigger(shopDomain, admin, p.trigger as never, p.event);
  },
  HTTP_SYNC_RUN: async (payload, ctx) => {
    const p = payload as { trigger: string; event: unknown };
    if (!ctx.shopId) throw new Error('HTTP_SYNC_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    const { admin } = await unauthenticated.admin(shopDomain);
    return new HttpSyncRunnerService().runForTrigger(shopDomain, admin, p.trigger as never, p.event);
  },
  RESTOCK_WATCH_RUN: async (payload, ctx) => {
    const p = payload as { event: unknown };
    if (!ctx.shopId) throw new Error('RESTOCK_WATCH_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    return new RestockWatcherService().runForProductUpdate(shopDomain, undefined, p.event);
  },
  LOYALTY_ACCRUAL_RUN: async (payload, ctx) => {
    if (!ctx.shopId) throw new Error('LOYALTY_ACCRUAL_RUN requires shopId');
    return accrueForOrder(ctx.shopId, payload as never);
  },
};
