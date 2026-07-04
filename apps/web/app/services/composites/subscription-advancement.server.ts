/**
 * Subscription contract advancement engine (Phase #4 · R3.6 — makes the
 * subscription-contract composite REAL, not modeled).
 *
 * R3.1 shipped the subscription-contract composite as `deferred:true`: surfaces
 * bound to a contract id, but no state mirror and no advancement. This module
 * wires the two halves that DON'T require the gated Shopify billing API:
 *
 *  1. CONTRACT MIRROR (`mirrorContract`): write/refresh the subscriber's state
 *     into the composite's typed DATA_STORE (provisioned at publish by the
 *     resolver's SHOPIFY_CONTRACT branch). IDEMPOTENT by contract id (externalId).
 *
 *  2. SCHEDULED ADVANCEMENT (`scheduleAdvancement`): park dunning / renewal
 *     REMINDERS on the R3.5 durable scheduler — reusing `parkRemainderAsWorkflow`
 *     + `WorkflowEngineService.startRun` + `buildShopAuthResolver` VERBATIM, and
 *     the SAME `SEND_EMAIL_NOTIFICATION` step shape the flow runner + R3.4
 *     messaging use. The cron resume sweep (`resumeDueWorkflowRuns`) fires the
 *     reminder once due, sending through the live email connector. NO new
 *     scheduler, NO new messaging path.
 *
 * IDEMPOTENT scheduling: each reminder's parked `runId` is derived from the
 * contract id + stage, so re-mirroring the same contract (a webhook redelivery or
 * a re-sync) does not double-schedule — `startRun`'s create throws P2002 which we
 * swallow, exactly like the R3.5 DELAY park.
 *
 * HONESTY FENCE (§5d): the mirror + reminders are real. The actual Shopify
 * subscription BILLING CHARGE — creating/advancing a `SubscriptionContract` with a
 * selling plan under `write_own_subscription_contracts` — is a scoped follow-up.
 * `advanceBilling` records the intent and returns `needsShopifyApi:true`; it does
 * NOT fake a charge.
 */
import type { CompositeRecord, Workflow } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { WorkflowEngineService } from '~/services/workflows/workflow-engine.service';
import { parkRemainderAsWorkflow, computeResumeAt, type ParkStep } from '~/services/flows/flow-park';
import { buildShopAuthResolver } from '~/services/flows/auth-resolver.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { compositeStoreKey } from './resolve-record.server';
import { findShopCompositeRecords, type ShopCompositeRecord } from './composite-registry.server';

// ─── Contract-mirror payload (stored in DataStoreRecord.payload as JSON) ───────

export type ContractStatus = 'active' | 'past_due' | 'cancelled' | 'paused';

/** The subscriber/contract state mirrored into the typed store. */
export type ContractMirror = {
  contractId: string;
  customerId: string;
  /** Recipient for scheduled reminders (email channel is the shipped path). */
  email?: string;
  status: ContractStatus;
  /** ISO-8601 instant of the next scheduled billing/renewal. */
  nextBillingAt?: string | null;
  /** Reminder stages already scheduled (idempotency + observability). */
  scheduledStages?: string[];
  updatedAt: string;
};

/** One reminder stage: an offset before/after nextBillingAt + a message. */
export type ReminderStage = {
  /** Stable stage id (e.g. 'renewal-3d', 'dunning-3d') — part of the parked runId. */
  id: string;
  /** Milliseconds relative to nextBillingAt; negative = before, positive = after. */
  offsetMs: number;
  subject: string;
  body: string;
};

// ─── Contract mirror (DB-backed, idempotent) ──────────────────────────────────

export type MirrorOutcome = {
  ref: string;
  storeKey: string;
  mirrored: boolean;
  created: boolean;
  reason?: string;
};

/**
 * Mirror a contract's state into every subscription-contract composite the shop
 * published. Find-or-create the row keyed by contract id (idempotent). Best-effort
 * per composite. Returns one outcome per composite.
 */
export async function mirrorContract(
  shopId: string,
  contract: ContractMirror,
  deps: { service?: DataStoreService; now?: Date } = {},
): Promise<MirrorOutcome[]> {
  const now = deps.now ?? new Date();
  const service = deps.service ?? new DataStoreService();
  const composites = await findShopCompositeRecords(shopId, 'subscription-contract');
  const outcomes: MirrorOutcome[] = [];

  for (const composite of composites) {
    try {
      outcomes.push(await mirrorInto(service, shopId, composite, contract, now));
    } catch (err) {
      logger.error('[subscription] contract mirror failed', {
        shopId,
        ref: composite.record.ref,
        ...safeErrorMeta(err),
      });
      outcomes.push({
        ref: composite.record.ref,
        storeKey: compositeStoreKey(composite.record.ref),
        mirrored: false,
        created: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

async function mirrorInto(
  service: DataStoreService,
  shopId: string,
  composite: ShopCompositeRecord,
  contract: ContractMirror,
  now: Date,
): Promise<MirrorOutcome> {
  const storeKey = compositeStoreKey(composite.record.ref);
  const store = await service.getStoreByKey(shopId, storeKey);
  if (!store) {
    return { ref: composite.record.ref, storeKey, mirrored: false, created: false, reason: 'contract-mirror store not provisioned' };
  }

  const prisma = getPrisma();
  const existing = await prisma.dataStoreRecord.findFirst({
    where: { dataStoreId: store.id, externalId: contract.contractId },
  });

  const prior = existing ? safeParseMirror(existing.payload) : null;
  const payload: ContractMirror = {
    ...contract,
    // Preserve stages already scheduled so re-mirror does not lose idempotency state.
    scheduledStages: mergeStages(prior?.scheduledStages, contract.scheduledStages),
    updatedAt: now.toISOString(),
  };

  if (existing) {
    await service.updateRecord(existing.id, store.id, {
      title: `Subscription · ${contract.customerId}`,
      payload,
    });
    return { ref: composite.record.ref, storeKey, mirrored: true, created: false };
  }

  await service.createRecord(store.id, {
    externalId: contract.contractId,
    customerId: contract.customerId,
    title: `Subscription · ${contract.customerId}`,
    payload,
  });
  return { ref: composite.record.ref, storeKey, mirrored: true, created: true };
}

// ─── Scheduled advancement (durable scheduler reuse) ───────────────────────────

export type ScheduledReminder = {
  stageId: string;
  runId: string;
  resumeAt: string;
  status: string;
  scheduled: boolean;
  reason?: string;
};

/**
 * Schedule the reminder stages for a contract on the durable scheduler. For each
 * stage whose resume instant is in the future, park a minimal workflow
 * `[DELAY → SEND_EMAIL_NOTIFICATION]` via the SAME park helper the flow runner
 * uses; the cron resume sweep fires it. IDEMPOTENT: the parked runId is derived
 * from contract + stage so a repeat call does not double-schedule (P2002 swallowed).
 *
 * Requires an email on the contract (the shipped reminder channel). A stage in the
 * past is skipped (nothing to schedule). Returns one entry per stage.
 */
export async function scheduleAdvancement(
  shopId: string,
  contract: ContractMirror,
  stages: ReminderStage[],
  deps: { engine?: WorkflowEngineService; now?: Date } = {},
): Promise<ScheduledReminder[]> {
  const now = deps.now ?? new Date();
  const engine = deps.engine ?? new WorkflowEngineService();
  const out: ScheduledReminder[] = [];

  if (!contract.nextBillingAt) {
    return stages.map((s) => ({ stageId: s.id, runId: '', resumeAt: '', status: 'SKIPPED', scheduled: false, reason: 'no nextBillingAt' }));
  }
  const anchor = new Date(contract.nextBillingAt).getTime();
  if (Number.isNaN(anchor)) {
    return stages.map((s) => ({ stageId: s.id, runId: '', resumeAt: '', status: 'SKIPPED', scheduled: false, reason: 'invalid nextBillingAt' }));
  }

  for (const stage of stages) {
    const resumeAt = new Date(anchor + stage.offsetMs);
    if (resumeAt.getTime() <= now.getTime()) {
      out.push({ stageId: stage.id, runId: '', resumeAt: resumeAt.toISOString(), status: 'SKIPPED', scheduled: false, reason: 'stage in the past' });
      continue;
    }
    if (!contract.email) {
      out.push({ stageId: stage.id, runId: '', resumeAt: resumeAt.toISOString(), status: 'SKIPPED', scheduled: false, reason: 'no email on contract (only email channel is shipped)' });
      continue;
    }

    // The reminder is a one-step remainder: send the email at resume time. We reuse
    // the flow runner's SEND_EMAIL_NOTIFICATION step shape so the parked workflow
    // is byte-identical to a flow-authored delay → email (one mapping, no drift).
    const remainderSteps: ParkStep[] = [
      {
        kind: 'SEND_EMAIL_NOTIFICATION',
        to: contract.email,
        subject: stage.subject,
        body: stage.body,
      },
    ];

    const workflow: Workflow = parkRemainderAsWorkflow({
      shopId,
      flowId: `subrem_${sanitize(contract.contractId)}`,
      flowName: `Subscription reminder · ${stage.id}`,
      remainderSteps,
      event: { contract, stage: stage.id },
      resumeAt,
    });

    // Idempotent runId: contract + stage. A repeat schedule for the same contract
    // stage collides on the WorkflowRun unique id → P2002, swallowed as "already
    // scheduled" (mirrors the R3.5 DELAY park's redelivery guard).
    const runId = `subrem_${sanitize(contract.contractId)}_${sanitize(stage.id)}`;
    try {
      const res = await engine.startRun(workflow, { contract, stage: stage.id } as Record<string, unknown>, {
        tenantId: shopId,
        runId,
        authResolver: buildShopAuthResolver(shopId),
      });
      out.push({ stageId: stage.id, runId, resumeAt: resumeAt.toISOString(), status: res.status, scheduled: true });
    } catch (err) {
      if (isUniqueViolation(err)) {
        out.push({ stageId: stage.id, runId, resumeAt: resumeAt.toISOString(), status: 'WAITING', scheduled: false, reason: 'already scheduled (idempotent)' });
      } else {
        logger.error('[subscription] failed to schedule reminder', { shopId, contractId: contract.contractId, stage: stage.id, ...safeErrorMeta(err) });
        out.push({ stageId: stage.id, runId, resumeAt: resumeAt.toISOString(), status: 'FAILED', scheduled: false, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return out;
}

/**
 * Mirror the contract AND schedule its reminder stages in one call — the shape a
 * subscription webhook/sync would invoke. Records the scheduled stage ids back
 * onto the mirror so a re-sync is idempotent end-to-end.
 */
export async function advanceContract(
  shopId: string,
  contract: ContractMirror,
  stages: ReminderStage[],
  deps: { service?: DataStoreService; engine?: WorkflowEngineService; now?: Date } = {},
): Promise<{ mirror: MirrorOutcome[]; reminders: ScheduledReminder[] }> {
  const reminders = await scheduleAdvancement(shopId, contract, stages, deps);
  const scheduledStages = reminders.filter((r) => r.scheduled || r.reason === 'already scheduled (idempotent)').map((r) => r.stageId);
  const mirror = await mirrorContract(shopId, { ...contract, scheduledStages }, deps);
  return { mirror, reminders };
}

// ─── Shopify billing charge — the honest scoped follow-up ─────────────────────

export type BillingResult = {
  contractId: string;
  ok: boolean;
  /** Always true here: the real charge needs the Shopify SubscriptionContract API
   *  + selling plans + `write_own_subscription_contracts`, which is not wired. */
  needsShopifyApi: boolean;
  reason: string;
};

/**
 * Advance the ACTUAL Shopify billing for a contract. HONESTY FENCE (§5d): this is
 * a scoped follow-up — it needs `SubscriptionBillingAttempt`/`SubscriptionContract`
 * mutations + selling-plan groups + the `write_own_subscription_contracts` scope,
 * none of which the workflow connector exposes today. It records NO charge and
 * fakes nothing; it returns `needsShopifyApi:true` so a caller cannot mistake it
 * for a completed charge.
 */
export function advanceBilling(contractId: string): BillingResult {
  return {
    contractId,
    ok: false,
    needsShopifyApi: true,
    reason:
      'Shopify subscription billing (SubscriptionContract API + selling plans + write_own_subscription_contracts scope) is a scoped follow-up — no charge is written.',
  };
}

/** Read the reminder-stage policy defaults declared on a composite record, if any. */
export function stagesFromRecord(_record: CompositeRecord): ReminderStage[] {
  // Records may declare stages later; for now callers pass explicit stages. This
  // hook keeps the record the single policy source when that lands (additive).
  return [];
}

export type CustomerSubscription = {
  /** True when a subscription-contract composite is provisioned for this shop. */
  configured: boolean;
  status: ContractStatus | null;
  /** ISO-8601 next billing/renewal instant, or null when unknown. */
  nextOrderDate: string | null;
  ref?: string;
};

/**
 * Read a customer's mirrored subscription state across the shop's published
 * subscription-contract composites. REAL read from the app-owned contract-mirror
 * DATA_STORE (the same store the advancement engine writes) — never a fabricated
 * status/date:
 *  - No composite provisioned → `{ configured:false, status:null, nextOrderDate:null }`.
 *  - Composite exists but no row for this customer → `{ configured:true, status:null }`.
 *  - A mirrored row → the row's real status + nextBillingAt (most-recently-updated wins).
 */
export async function readCustomerSubscription(
  shopId: string,
  customerId: string,
  deps: { service?: DataStoreService } = {},
): Promise<CustomerSubscription> {
  const service = deps.service ?? new DataStoreService();
  const composites = await findShopCompositeRecords(shopId, 'subscription-contract');
  if (composites.length === 0) {
    return { configured: false, status: null, nextOrderDate: null };
  }

  const prisma = getPrisma();
  const candidates = subscriptionCustomerCandidates(customerId);
  for (const composite of composites) {
    const storeKey = compositeStoreKey(composite.record.ref);
    const store = await service.getStoreByKey(shopId, storeKey);
    if (!store) continue;

    const row = await prisma.dataStoreRecord.findFirst({
      where: { dataStoreId: store.id, customerId: { in: candidates } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) continue;
    const mirror = safeParseMirror(row.payload);
    if (!mirror) continue;
    return {
      configured: true,
      status: mirror.status,
      nextOrderDate: mirror.nextBillingAt ?? null,
      ref: composite.record.ref,
    };
  }

  return { configured: true, status: null, nextOrderDate: null, ref: composites[0]?.record.ref };
}

/** The id forms a mirror row might key on: as-given, numeric tail, and GID. */
function subscriptionCustomerCandidates(customerId: string): string[] {
  const out = new Set<string>();
  const raw = customerId.trim();
  if (raw) out.add(raw);
  const numeric = raw.match(/\/(\d+)(?:[?#].*)?$/)?.[1] ?? (/^\d+$/.test(raw) ? raw : undefined);
  if (numeric) {
    out.add(numeric);
    out.add(`gid://shopify/Customer/${numeric}`);
  }
  return [...out];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mergeStages(a?: string[], b?: string[]): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}

function safeParseMirror(raw: string): ContractMirror | null {
  try {
    const obj = JSON.parse(raw) as Partial<ContractMirror>;
    if (typeof obj !== 'object' || obj === null) return null;
    return {
      contractId: String(obj.contractId ?? ''),
      customerId: String(obj.customerId ?? ''),
      email: typeof obj.email === 'string' ? obj.email : undefined,
      status: (obj.status as ContractStatus) ?? 'active',
      nextBillingAt: obj.nextBillingAt ?? null,
      scheduledStages: Array.isArray(obj.scheduledStages) ? obj.scheduledStages : [],
      updatedAt: String(obj.updatedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'x';
}

/** True for a Prisma unique-constraint violation (P2002) — used to swallow a
 *  duplicate parked reminder (same contract + stage) as "already scheduled". */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

// re-export so callers can build the reminder from computeResumeAt if they prefer
// an offset-from-now instead of offset-from-nextBillingAt (kept for parity with
// the flow-park primitives; not required by the paths above).
export { computeResumeAt };
