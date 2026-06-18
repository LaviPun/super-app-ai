import type { Workflow, WorkflowNode, WorkflowEdge } from '@superapp/core';

/**
 * Unify the live flow path onto the canonical engine.
 *
 * Legacy `flow.automation` modules carry a simple `{ trigger, steps[] }` config
 * run by FlowRunnerService (linear, no branching). `flowAutomationToWorkflow`
 * compiles that shape into a canonical `Workflow` (`workflow.ts`) so it can run on
 * the industry-grade `WorkflowEngineService` — gaining retry/idempotency, durable
 * waits, and (once authored as such) loops/switch/parallel. Each legacy step maps
 * to a connector action; the trigger maps to a typed event/schedule trigger.
 *
 * Pure + deterministic (unit-tested). New flows can be authored directly as a
 * canonical Workflow; this bridges the existing ones with zero data migration.
 */

type LegacyStep = {
  kind: string;
  // common fields across step kinds (all optional; mapped per-kind)
  connectorId?: string; path?: string; method?: string; bodyMapping?: Record<string, unknown>;
  url?: string; body?: string; headers?: Record<string, string>;
  tags?: string; tag?: string; note?: string; to?: string; subject?: string; channel?: string;
  storeKey?: string; titleExpr?: string; payloadMapping?: Record<string, unknown>;
  newLocationId?: string;
};

type LegacyConfig = { trigger: string; steps: LegacyStep[] };

const TRIGGER_MAP: Record<string, { type: 'event' | 'schedule' | 'manual'; provider: string; event: string }> = {
  MANUAL: { type: 'manual', provider: 'superapp', event: 'manual' },
  SCHEDULED: { type: 'schedule', provider: 'superapp', event: 'scheduled.time' },
  SHOPIFY_WEBHOOK_ORDER_CREATED: { type: 'event', provider: 'shopify', event: 'order.created' },
  SHOPIFY_WEBHOOK_PRODUCT_UPDATED: { type: 'event', provider: 'shopify', event: 'product.updated' },
  SHOPIFY_WEBHOOK_CUSTOMER_CREATED: { type: 'event', provider: 'shopify', event: 'customer.created' },
  SHOPIFY_WEBHOOK_FULFILLMENT_CREATED: { type: 'event', provider: 'shopify', event: 'fulfillment.created' },
  SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED: { type: 'event', provider: 'shopify', event: 'draft_order.created' },
  SHOPIFY_WEBHOOK_COLLECTION_CREATED: { type: 'event', provider: 'shopify', event: 'collection.created' },
  SUPERAPP_MODULE_PUBLISHED: { type: 'event', provider: 'superapp', event: 'module.published' },
  SUPERAPP_CONNECTOR_SYNCED: { type: 'event', provider: 'superapp', event: 'connector.synced' },
  SUPERAPP_DATA_RECORD_CREATED: { type: 'event', provider: 'superapp', event: 'data.record_created' },
  SUPERAPP_WORKFLOW_COMPLETED: { type: 'event', provider: 'superapp', event: 'workflow.completed' },
  SUPERAPP_WORKFLOW_FAILED: { type: 'event', provider: 'superapp', event: 'workflow.failed' },
};

const ORDER_GID = { $ref: '$.trigger.payload.admin_graphql_api_id' };
const CUSTOMER_GID = { $ref: '$.trigger.payload.customer.admin_graphql_api_id' };

/** Map one legacy step to a canonical action node's `action` spec, or null to skip. */
function stepToAction(step: LegacyStep): WorkflowNode['action'] | null {
  switch (step.kind) {
    case 'TAG_ORDER':
      return { provider: 'shopify', operation: 'order.addTags', timeoutMs: 30000,
        inputs: { orderId: ORDER_GID, tags: splitTags(step.tags) } };
    case 'TAG_CUSTOMER':
      return { provider: 'shopify', operation: 'customer.addTags', timeoutMs: 30000,
        inputs: { customerId: CUSTOMER_GID, tags: step.tag ? [step.tag] : [] } };
    case 'ADD_ORDER_NOTE':
      return { provider: 'shopify', operation: 'order.addNote', timeoutMs: 30000,
        inputs: { orderId: ORDER_GID, note: step.note ?? '' } };
    case 'ROUTE_ORDER':
      return { provider: 'shopify', operation: 'order.routeToLocation', timeoutMs: 30000,
        inputs: { orderId: ORDER_GID, newLocationId: step.newLocationId ?? '' } };
    case 'SEND_HTTP_REQUEST':
    case 'HTTP_REQUEST':
      return { provider: 'http', operation: 'request', timeoutMs: 30000,
        inputs: { url: step.url ?? step.path ?? '', method: (step.method ?? 'POST'), headers: step.headers ?? {}, body: step.body ?? '' } };
    case 'SEND_EMAIL_NOTIFICATION':
      return { provider: 'email', operation: 'send', timeoutMs: 30000,
        inputs: { to: step.to ?? '', subject: step.subject ?? '', body: step.body ?? '' } };
    case 'SEND_SLACK_MESSAGE':
      return { provider: 'slack', operation: 'send', timeoutMs: 30000,
        inputs: { channel: step.channel ?? '', text: step.body ?? '' } };
    case 'WRITE_TO_STORE':
      return { provider: 'superapp', operation: 'datastore.createRecord', timeoutMs: 30000,
        inputs: { storeKey: step.storeKey ?? '', title: step.titleExpr ?? '', payload: step.payloadMapping ?? {} } };
    default:
      return null;
  }
}

function splitTags(tags?: string): string[] {
  return typeof tags === 'string' ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
}

/** Compile a legacy flow.automation config into a canonical, runnable Workflow. */
export function flowAutomationToWorkflow(
  config: LegacyConfig,
  meta: { id: string; name: string; tenantId: string; version?: number },
): Workflow {
  const trigger = TRIGGER_MAP[config.trigger] ?? { type: 'manual' as const, provider: 'superapp', event: 'manual' };

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  let prevId: string | null = null;

  config.steps.forEach((step, i) => {
    const action = stepToAction(step);
    if (!action) return;
    const id = `step_${i}`;
    nodes.push({ id, type: 'action', name: step.kind, action, onError: { mode: 'continue', captureErrorAs: 'lastError' } });
    if (prevId) edges.push({ from: prevId, to: id, label: 'next' });
    prevId = id;
  });

  const endId = 'end';
  nodes.push({ id: endId, type: 'end', name: 'Done' });
  if (prevId) edges.push({ from: prevId, to: endId, label: 'next' });

  return {
    id: padId(meta.id),
    version: meta.version ?? 1,
    name: meta.name.slice(0, 120) || 'Flow',
    status: 'active',
    tenantId: meta.tenantId,
    trigger: { type: trigger.type, provider: trigger.provider, event: trigger.event },
    nodes,
    edges,
    settings: { timezone: 'UTC', maxRunSeconds: 900, errorPolicy: 'continue_on_error' },
  };
}

/** Workflow ids must be 8..64 of [A-Za-z0-9_-]; pad/normalize a module id. */
function padId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return safe.length >= 8 ? safe : `flow_${safe}`.padEnd(8, '0');
}
