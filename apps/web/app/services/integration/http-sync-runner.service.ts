import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { ConnectorService } from '~/services/connectors/connector.service';
import { JobService } from '~/services/jobs/job.service';
import { DeadLetterService } from '~/services/flows/dead-letter.service';
import { RateLimitService } from '~/services/shopify/rate-limit.service';
import { buildHttpSyncSignatureHeaders } from './http-sync-signature.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

/**
 * HttpSyncRunnerService (build #7a) — the "store → connected service" outbound leg of
 * integration.httpSync. It mirrors FlowRunnerService.runForTrigger: on a subscribed
 * Shopify webhook (or MANUAL / SCHEDULED), it loads every PUBLISHED integration.httpSync
 * module whose `trigger` matches, maps the declared fields out of the event, and POSTs
 * the mapped payload to the merchant's connected service (a Connector row carrying the
 * destination baseUrl + the auth the merchant supplied), signed so the receiver can
 * verify the message came from us.
 *
 * Reliability (the DLQ + rate-limit records that had no callers now get real ones):
 *   - a proactive rate-limit-aware backoff before dispatch (RateLimitService.backoffMs)
 *     keeps a burst of webhooks from hammering both Shopify and the connected service;
 *   - a bounded in-run retry with exponential backoff for transient failures;
 *   - on exhaustion the run is dead-lettered (DeadLetterService.record) for the cron
 *     replay sweep, instead of being silently dropped.
 */

// Trigger enums the runner recognizes. This is a back-compat *guard* (a stored spec may
// carry any of these), NOT a promise of delivery. Whether a Shopify-webhook trigger
// actually fires depends on the topic being subscribed in shopify.app.toml, which in turn
// depends on the scope being granted (see GRANTED_WEBHOOK_SCOPES in @superapp/core). Two
// entries here are recognized but NOT deliverable with the current scopes:
//   SHOPIFY_WEBHOOK_FULFILLMENT_CREATED  (needs read_fulfillments — not granted)
//   SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED  (needs read_draft_orders — not granted)
// The webhooks.tsx TOPIC_TO_TRIGGER map keeps them wired so that IF the scope+subscription
// are added later, delivery works end-to-end without touching this runner — but until then
// Shopify never delivers those topics, so these branches are inert (not "working").
const HTTP_SYNC_TRIGGERS = new Set([
  'MANUAL',
  'SHOPIFY_WEBHOOK_ORDER_CREATED',
  'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
  'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
  'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED', // inert until read_fulfillments granted + subscribed
  'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED', // inert until read_draft_orders granted + subscribed
  'SHOPIFY_WEBHOOK_COLLECTION_CREATED',
  'SCHEDULED',
]);

export type HttpSyncTrigger =
  | 'MANUAL'
  | 'SHOPIFY_WEBHOOK_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED'
  | 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED'
  | 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED'
  | 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_COLLECTION_CREATED'
  | 'SCHEDULED';

const MAX_DISPATCH_RETRIES = 2;
const DISPATCH_BACKOFF_BASE_MS = 500;

type HttpSyncConfig = {
  connectorId: string;
  endpointPath: string;
  trigger: string;
  payloadMapping: Record<string, string>;
};

export type HttpSyncRunResult = {
  moduleId: string;
  dispatched: boolean;
  status: number;
  deadLettered: boolean;
};

export interface HttpSyncRunnerDeps {
  connectors?: ConnectorService;
  jobs?: JobService;
  deadLetter?: DeadLetterService;
  rateLimit?: RateLimitService;
  /** Clock/backoff seam for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export class HttpSyncRunnerService {
  private readonly connectors: ConnectorService;
  private readonly jobs: JobService;
  private readonly deadLetter: DeadLetterService;
  private readonly rateLimit: RateLimitService;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: HttpSyncRunnerDeps = {}) {
    this.connectors = deps.connectors ?? new ConnectorService();
    this.jobs = deps.jobs ?? new JobService();
    this.deadLetter = deps.deadLetter ?? new DeadLetterService();
    this.rateLimit = deps.rateLimit ?? new RateLimitService();
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Fan out to every PUBLISHED integration.httpSync module reacting to `trigger`.
   * Best-effort per module: one module's failure (dead-lettered) never blocks the
   * others, and never throws into the webhook handler.
   */
  async runForTrigger(
    shopDomain: string,
    _admin: AdminApiContext['admin'] | null,
    trigger: HttpSyncTrigger,
    event: unknown,
  ): Promise<HttpSyncRunResult[]> {
    if (!HTTP_SYNC_TRIGGERS.has(trigger)) return [];
    const prisma = getPrisma();

    const modules = await prisma.module.findMany({
      where: {
        shop: { shopDomain },
        type: 'integration.httpSync',
        status: 'PUBLISHED',
        activeVersionId: { not: null },
      },
      include: { activeVersion: true },
    });
    if (modules.length === 0) return [];

    const shopRow = await prisma.shop.findUnique({ where: { shopDomain }, select: { id: true } });
    const recipe = new RecipeService();
    const results: HttpSyncRunResult[] = [];

    for (const mod of modules) {
      if (!mod.activeVersion) continue;
      let config: HttpSyncConfig;
      try {
        const spec = recipe.parse(mod.activeVersion.specJson);
        if (spec.type !== 'integration.httpSync') continue;
        if (spec.config.trigger !== trigger) continue;
        config = spec.config as HttpSyncConfig;
      } catch {
        continue; // malformed spec — skip, never crash the fan-out
      }

      results.push(await this.runOne(shopDomain, shopRow?.id, mod.id, config, trigger, event));
    }
    return results;
  }

  /** Run a single httpSync module: map → sign → dispatch (with retry) → DLQ on failure. */
  private async runOne(
    shopDomain: string,
    shopId: string | undefined,
    moduleId: string,
    config: HttpSyncConfig,
    trigger: HttpSyncTrigger,
    event: unknown,
  ): Promise<HttpSyncRunResult> {
    const job = await this.jobs.create({
      shopId,
      type: 'HTTP_SYNC_RUN',
      payload: { moduleId, trigger },
    });
    await this.jobs.start(job.id);

    const payload = mapPayload(config.payloadMapping, event);
    const body = JSON.stringify({
      trigger,
      shopDomain,
      moduleId,
      data: payload,
    });

    try {
      // Proactive rate-limit-aware backoff (gives RateLimitService.backoffMs a real
      // caller): if the shop's Shopify API bucket is near-empty a burst of webhooks is
      // in flight — pause briefly before adding outbound load. Best-effort telemetry;
      // a missing snapshot just returns 0.
      await this.applyProactiveBackoff(shopDomain);

      const result = await this.dispatchWithRetry(shopDomain, config, body);
      if (!result.ok) {
        throw new HttpSyncDispatchError(result.error ?? `dispatch failed (status ${result.status})`, result.status);
      }

      await this.jobs.succeed(job.id, { moduleId, status: result.status, durationMs: result.durationMs });
      return { moduleId, dispatched: true, status: result.status, deadLettered: false };
    } catch (err) {
      await this.jobs.fail(job.id, err);
      const status = err instanceof HttpSyncDispatchError ? err.status : 0;

      // DLQ (gives DeadLetterService.record a real caller): a failed sync is recorded
      // for the cron replay sweep with bounded backoff, instead of being dropped.
      let deadLettered = false;
      if (shopId) {
        const dl = await this.deadLetter.record({
          shopId,
          flowId: moduleId,
          trigger: `HTTP_SYNC:${trigger}`,
          event,
          error: err instanceof Error ? err.message : String(err),
        });
        deadLettered = Boolean(dl);
      }
      logger.warn('[httpSync] dispatch failed — dead-lettered for replay', {
        shopDomain,
        moduleId,
        deadLettered,
        ...safeErrorMeta(err),
      });
      return { moduleId, dispatched: false, status, deadLettered };
    }
  }

  /** Bounded exponential-backoff retry around a single connector dispatch. */
  private async dispatchWithRetry(shopDomain: string, config: HttpSyncConfig, body: string) {
    let last: Awaited<ReturnType<ConnectorService['dispatch']>> | undefined;
    for (let attempt = 0; attempt <= MAX_DISPATCH_RETRIES; attempt++) {
      const headers = {
        'Content-Type': 'application/json',
        ...buildHttpSyncSignatureHeaders(shopDomain, body),
      };
      last = await this.connectors.dispatch(shopDomain, {
        connectorId: config.connectorId,
        path: config.endpointPath,
        method: 'POST',
        headers,
        body,
      });
      if (last.ok || !last.retryable || attempt === MAX_DISPATCH_RETRIES) return last;
      const wait = last.retryAfterMs ?? DISPATCH_BACKOFF_BASE_MS * Math.pow(2, attempt);
      await this.sleep(wait);
    }
    // Unreachable (loop always returns), but satisfies the type checker.
    return last!;
  }

  /**
   * Replay dead-lettered httpSync runs whose retry is due (build #7a). Gives
   * DeadLetterService.claimDue / recordFailure / markResolved real callers: the cron
   * sweep claims due HTTP_SYNC:* entries, re-dispatches, and either resolves them or
   * reschedules with bounded backoff (DISCARDED after maxAttempts). Best-effort per
   * entry — one bad entry never aborts the sweep.
   */
  async replayDueDeadLetters(limit = 20): Promise<Array<{ id: string; moduleId: string; ok: boolean }>> {
    const prisma = getPrisma();
    const due = await this.deadLetter.claimDue(limit);
    const httpSyncDue = due.filter((d) => d.trigger.startsWith('HTTP_SYNC:'));
    const out: Array<{ id: string; moduleId: string; ok: boolean }> = [];

    for (const entry of httpSyncDue) {
      const moduleId = entry.flowId ?? '';
      try {
        const mod = moduleId
          ? await prisma.module.findFirst({
              where: { id: moduleId, type: 'integration.httpSync', status: 'PUBLISHED' },
              include: { activeVersion: true, shop: { select: { shopDomain: true } } },
            })
          : null;
        if (!mod || !mod.activeVersion || !mod.shop) {
          // The module is gone/unpublished — nothing to replay; resolve so it stops.
          await this.deadLetter.markResolved(entry.id);
          out.push({ id: entry.id, moduleId, ok: false });
          continue;
        }

        const spec = new RecipeService().parse(mod.activeVersion.specJson);
        if (spec.type !== 'integration.httpSync') {
          await this.deadLetter.markResolved(entry.id);
          out.push({ id: entry.id, moduleId, ok: false });
          continue;
        }

        const event = safeParse(entry.eventJson);
        const config = spec.config as HttpSyncConfig;
        const payload = mapPayload(config.payloadMapping, event);
        const body = JSON.stringify({ trigger: config.trigger, shopDomain: mod.shop.shopDomain, moduleId, data: payload });

        const result = await this.dispatchWithRetry(mod.shop.shopDomain, config, body);
        if (result.ok) {
          await this.deadLetter.markResolved(entry.id);
          out.push({ id: entry.id, moduleId, ok: true });
        } else {
          await this.deadLetter.recordFailure(
            entry.id,
            entry.attempts,
            entry.maxAttempts,
            result.error ?? `dispatch failed (status ${result.status})`,
          );
          out.push({ id: entry.id, moduleId, ok: false });
        }
      } catch (err) {
        await this.deadLetter.recordFailure(
          entry.id,
          entry.attempts,
          entry.maxAttempts,
          err instanceof Error ? err.message : String(err),
        );
        out.push({ id: entry.id, moduleId, ok: false });
      }
    }
    return out;
  }

  private async applyProactiveBackoff(shopDomain: string): Promise<void> {
    try {
      const snap = await this.rateLimit.getByDomain(shopDomain);
      if (!snap) return;
      const wait = RateLimitService.backoffMs(snap);
      if (wait > 0) await this.sleep(wait);
    } catch {
      /* telemetry-only; never block a sync on a rate-limit read */
    }
  }
}

class HttpSyncDispatchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpSyncDispatchError';
  }
}

/** Parse a stored eventJson back to an object (empty object on malformed). */
function safeParse(jsonString: string): unknown {
  try {
    return JSON.parse(jsonString);
  } catch {
    return {};
  }
}

/** Read a dot-path (e.g. "customer.email") out of the trigger event. */
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
 * Apply the module's `{ targetKey: "{{dot.path}}" | "literal" }` field mapping to the
 * event. A value wrapped in `{{ }}` is resolved as a dot-path against the event; any
 * other value passes through as a literal. An empty mapping sends the whole event.
 */
export function mapPayload(mapping: Record<string, string>, event: unknown): Record<string, unknown> | unknown {
  const keys = Object.keys(mapping ?? {});
  if (keys.length === 0) return event;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const expr = mapping[key] ?? '';
    const m = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(expr);
    out[key] = m ? readPath(event, m[1]!) : expr;
  }
  return out;
}
