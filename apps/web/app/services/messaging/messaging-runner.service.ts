/**
 * MessagingRunnerService (R3.4) — the first-class messaging runtime.
 *
 * Mirrors FlowRunnerService's structure (job row, per-item logging) but adds the
 * ONE new idea R3.4 introduces: BOUNDED FAN-OUT over a resolved audience. It reuses
 * every real part —
 *   - the shipped EmailConnector / SlackConnector (the same `.invoke` the live
 *     SEND_EMAIL_NOTIFICATION / SEND_SLACK_MESSAGE steps make),
 *   - the shipped DataStore (the capture→persist→fan-out spine WRITE_TO_STORE fills),
 *   - the same three live trigger sites (webhook, cron, admin "Send now").
 *
 * Honesty gates:
 *   - Channel gate: sms/push have NO shipped runtime → the runner THROWS loudly
 *     (MESSAGING_CHANNELS_SHIPPED), never fakes a send.
 *   - Bounded per run: fan-out is capped at `batchSize` (≤500). A large list needs
 *     cross-run paging, which depends on the R3.5 durable scheduler — the run records
 *     `total` so the shortfall is VISIBLE, not truncated-as-success.
 *   - PII: logs counts + masked addresses, never raw recipient addresses/bodies.
 */
import type { AdminApiContext } from '~/types/shopify';
import type { RecipeSpec, MessagingPack, MessagingChannel, AuthContext } from '@superapp/core';
import { MESSAGING_CHANNELS_SHIPPED, MESSAGING_DRIP_PRESET_ENTRY, messagingChannelSendability, evaluateRuleEngine } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { JobService } from '~/services/jobs/job.service';
import { DataStoreService } from '~/services/data/data-store.service';
import { getConnector } from '~/services/workflows/connectors/index';
import { WorkflowEngineService } from '~/services/workflows/workflow-engine.service';
import { buildShopAuthResolver } from '~/services/flows/auth-resolver.server';
import { parkMessagingPageWorkflow, messagingPageRunId } from './messaging-page-park';
import { parkMessagingDripStepWorkflow, messagingDripRunId } from './messaging-drip-park';
import { resolveConsent, type AdminGraphqlFn } from './consent-resolver.server';
import { PushSubscriptionStore } from './push-subscription-store.server';
import shopify from '~/shopify.server';

/** Trigger vocabulary shared with FlowRunnerService (the three live sites fire these). */
export type MessagingTrigger =
  | 'MANUAL'
  | 'SCHEDULED'
  | 'SHOPIFY_WEBHOOK_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED'
  | 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED'
  | 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED'
  | 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_COLLECTION_CREATED'
  | 'SUPERAPP_MODULE_PUBLISHED'
  | 'SUPERAPP_CONNECTOR_SYNCED'
  | 'SUPERAPP_DATA_RECORD_CREATED'
  | 'SUPERAPP_WORKFLOW_COMPLETED'
  | 'SUPERAPP_WORKFLOW_FAILED';

type Recipient = Record<string, unknown>;

export type CampaignRunResult = {
  moduleId: string;
  /** Recipients actually resolved for this run (post source resolution). */
  resolved: number;
  /** Total available in the source (may exceed `resolved` when batchSize caps the run). */
  total: number;
  sent: number;
  failed: number;
  /** Recipients skipped by consent or the rule-engine filter. */
  skipped: number;
  /**
   * True when `total > (offset + batchSize)` — the run sent one bounded page and
   * more of the audience remains. When true the runner PARKS the next page on the
   * durable scheduler (R3.5) so the list is fully delivered over time; `paged` stays
   * the honest "this single run did not cover the whole list" signal.
   */
  paged: boolean;
  /** DataStore offset this page started at (the durable cursor). 0 for the first run. */
  offset: number;
  /**
   * When `paged`, the offset the next parked page will read from
   * (`offset + batchSize`). Absent when nothing was parked (fits one batch, a
   * non-pageable source, or a "Send test").
   */
  parkedNextOffset?: number;
  /** The stable per-fan-out id shared by every page (the sent-marker dedupe key). */
  runToken: string;
};

/** Options for a single campaign run — carries the paging cursor + dedupe token. */
export type RunCampaignOptions = {
  /** DataStore cursor offset this run's page starts at (default 0). */
  offset?: number;
  /**
   * Stable id shared by every page of one fan-out. Derived deterministically from
   * the module + trigger when absent, so all pages of a broadcast dedupe together.
   */
  runToken?: string;
  /** The trigger that started the fan-out (parked pages re-fire under it). */
  trigger?: MessagingTrigger;
  /** True to PARK the next page when the audience is not exhausted (default true). */
  parkRemainder?: boolean;
};

/** Result of one paged send (used by the resume seam + the cursored runner). */
export type CampaignPageResult = CampaignRunResult;

/** Dependency seams (overridable in tests). */
export type MessagingRunnerDeps = {
  prisma?: ReturnType<typeof getPrisma>;
  dataStore?: DataStoreService;
  jobs?: JobService;
  /** Resolve a connector by channel; defaults to the live connector registry. */
  getConnector?: typeof getConnector;
  /** Injectable email API key (defaults to process.env.EMAIL_API_KEY). */
  emailApiKey?: string;
  /** Injectable slack webhook fallback (defaults to process.env.SLACK_WEBHOOK_URL). */
  slackWebhookUrl?: string;
  /** Durable scheduler used to park the next page (defaults to a live engine). */
  engine?: WorkflowEngineService;
  /** Per-tenant auth resolver builder for parked pages (defaults to the shop resolver). */
  authResolverFor?: (shopId: string) => (provider: string) => Promise<AuthContext>;
  /**
   * Delay before a parked next page becomes due. Small so the next cron tick sends
   * it; kept injectable for deterministic tests. Default 1000ms.
   */
  pageDelayMs?: number;
  /** Clock seam (parked resumeAt). Default () => new Date(). */
  now?: () => Date;
  /**
   * Env seam for the per-channel CREDENTIALS gate (sms/push provider config). Default
   * process.env. Injectable so a test can prove the honest "unconfigured ⇒ refuse,
   * never fake" behaviour without setting real provider creds.
   */
  env?: Record<string, string | undefined>;
  /**
   * Build an Admin GraphQL client for a shop, used to resolve a recipient's
   * marketing-consent state from Shopify (the source of truth for sms/email consent).
   * Defaults to the offline `shopify.unauthenticated.admin` client. Returns undefined
   * when no offline session exists (the runner then falls back to the record's consent
   * field and never sends without an opt-in signal).
   */
  adminGraphqlFor?: (shopDomain: string) => Promise<AdminGraphqlFn | undefined>;
};

export class MessagingRunnerService {
  private readonly prisma: ReturnType<typeof getPrisma>;
  private readonly dataStore: DataStoreService;
  private readonly jobs: JobService;
  private readonly connectorFor: typeof getConnector;
  private readonly deps: MessagingRunnerDeps;

  constructor(deps: MessagingRunnerDeps = {}) {
    this.prisma = deps.prisma ?? getPrisma();
    this.dataStore = deps.dataStore ?? new DataStoreService();
    this.jobs = deps.jobs ?? new JobService();
    this.connectorFor = deps.getConnector ?? getConnector;
    this.deps = deps;
  }

  private get engine(): WorkflowEngineService {
    return this.deps.engine ?? new WorkflowEngineService();
  }

  private authResolverFor(shopId: string): (provider: string) => Promise<AuthContext> {
    return (this.deps.authResolverFor ?? buildShopAuthResolver)(shopId);
  }

  private nowDate(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private get env(): Record<string, string | undefined> {
    return this.deps.env ?? process.env;
  }

  /** Per-run cache of the resolved Admin GraphQL client (one lookup per shop). */
  private adminGraphqlCache = new Map<string, AdminGraphqlFn | undefined>();

  private async adminGraphqlFor(shopDomain: string): Promise<AdminGraphqlFn | undefined> {
    if (this.adminGraphqlCache.has(shopDomain)) return this.adminGraphqlCache.get(shopDomain);
    const builder =
      this.deps.adminGraphqlFor ??
      (async (shop: string): Promise<AdminGraphqlFn | undefined> => {
        try {
          const ctx = await shopify.unauthenticated.admin(shop);
          return ctx.admin.graphql as unknown as AdminGraphqlFn;
        } catch {
          return undefined;
        }
      });
    const gql = await builder(shopDomain);
    this.adminGraphqlCache.set(shopDomain, gql);
    return gql;
  }

  /**
   * Fan out every PUBLISHED messaging.campaign whose trigger matches. Called as a
   * SIBLING right after FlowRunnerService at each live trigger site.
   */
  async runForTrigger(
    shopDomain: string,
    admin: AdminApiContext['admin'],
    trigger: MessagingTrigger,
    event: unknown,
  ): Promise<CampaignRunResult[]> {
    const campaigns = await this.prisma.module.findMany({
      where: {
        shop: { shopDomain },
        type: 'messaging.campaign',
        status: 'PUBLISHED',
        activeVersionId: { not: null },
      },
      include: { activeVersion: true },
    });

    const recipe = new RecipeService();
    const results: CampaignRunResult[] = [];
    for (const mod of campaigns) {
      if (!mod.activeVersion) continue;
      const spec = recipe.parse(mod.activeVersion.specJson);
      if (spec.type !== 'messaging.campaign') continue;
      const cfg = spec.config;
      if (!triggerMatches(cfg, trigger, event)) continue;
      results.push(
        await this.runCampaign(shopDomain, admin, mod.id, spec, event, trigger, {
          offset: 0,
          runToken: deriveRunToken(mod.id, trigger, event),
          trigger,
          parkRemainder: true,
        }),
      );
    }
    return results;
  }

  /**
   * Run exactly one campaign by module id (admin "Send now" / "Send test").
   * PUBLISHED-guarded like FlowRunnerService.runFlowById.
   */
  async runCampaignById(
    shopDomain: string,
    admin: AdminApiContext['admin'],
    moduleId: string,
    event: unknown,
    opts: { trigger?: MessagingTrigger; testRecipient?: string } = {},
  ): Promise<CampaignRunResult> {
    const mod = await this.prisma.module.findFirst({
      where: { id: moduleId, shop: { shopDomain }, type: 'messaging.campaign' },
      include: { activeVersion: true },
    });
    if (!mod) throw new Error(`Messaging campaign ${moduleId} not found for ${shopDomain}`);
    if (mod.status !== 'PUBLISHED') throw new Error(`${mod.name} is not published — publish it before sending`);
    if (!mod.activeVersion) throw new Error(`${mod.name} has no published version to send`);

    const spec = new RecipeService().parse(mod.activeVersion.specJson);
    if (spec.type !== 'messaging.campaign') throw new Error(`${mod.name} is not a messaging.campaign module`);

    let runSpec = spec;
    if (opts.testRecipient) {
      // "Send test" forces a single literal recipient (the caller's address), so a
      // test never blasts the real list.
      runSpec = {
        ...spec,
        config: {
          ...spec.config,
          audience: { ...spec.config.audience, source: 'literal', recipients: [opts.testRecipient] },
          batchSize: 1,
          respectConsent: false,
        },
      };
    }

    const trigger = opts.trigger ?? 'MANUAL';
    return this.runCampaign(shopDomain, admin, mod.id, runSpec, event, trigger, {
      offset: 0,
      runToken: deriveRunToken(mod.id, trigger, event),
      trigger,
      // A "Send test" is a single literal recipient — never page/park it.
      parkRemainder: !opts.testRecipient,
    });
  }

  /**
   * Send exactly ONE page of a campaign, starting at `opts.offset`, and park the
   * page after it when the audience is still not exhausted. This is the resume seam
   * the durable scheduler fires (MessagingConnector.sendPage) — the cursor + the
   * per-run sent-marker make a double-resume a no-op (never a double-send).
   *
   * PUBLISHED-guarded like `runCampaignById`; a campaign unpublished mid-paging
   * stops delivering (honest — the merchant paused it).
   */
  async runCampaignPage(
    shopDomain: string,
    moduleId: string,
    opts: { offset: number; runToken: string; trigger: MessagingTrigger; event?: unknown },
  ): Promise<CampaignPageResult> {
    const mod = await this.prisma.module.findFirst({
      where: { id: moduleId, shop: { shopDomain }, type: 'messaging.campaign' },
      include: { activeVersion: true },
    });
    if (!mod) throw new Error(`Messaging campaign ${moduleId} not found for ${shopDomain}`);
    if (mod.status !== 'PUBLISHED') throw new Error(`${mod.name} is not published — paging stopped`);
    if (!mod.activeVersion) throw new Error(`${mod.name} has no published version — paging stopped`);

    const spec = new RecipeService().parse(mod.activeVersion.specJson);
    if (spec.type !== 'messaging.campaign') throw new Error(`${mod.name} is not a messaging.campaign module`);

    return this.runCampaign(
      shopDomain,
      null as unknown as AdminApiContext['admin'],
      mod.id,
      spec,
      opts.event ?? {},
      opts.trigger,
      { offset: opts.offset, runToken: opts.runToken, trigger: opts.trigger, parkRemainder: true },
    );
  }

  private async runCampaign(
    shopDomain: string,
    admin: AdminApiContext['admin'],
    moduleId: string,
    spec: Extract<RecipeSpec, { type: 'messaging.campaign' }>,
    event: unknown,
    trigger: MessagingTrigger,
    opts: RunCampaignOptions = {},
  ): Promise<CampaignRunResult> {
    const cfg = spec.config;
    const offset = Math.max(0, opts.offset ?? 0);
    const runToken = opts.runToken ?? deriveRunToken(moduleId, trigger, event);
    const parkRemainder = opts.parkRemainder ?? true;

    // Channel gate — refuse loudly, never fake.
    //  - not in the shipped set          → no connector at all.
    //  - shipped but missing credentials → connector exists, but sending needs the
    //    merchant's provider config (sms SID/token/from; VAPID keys). We refuse rather
    //    than fake a send; publish preflight already blocks this state (needs_runtime).
    if (!(MESSAGING_CHANNELS_SHIPPED as readonly string[]).includes(cfg.channel)) {
      throw new Error(
        `Messaging channel '${cfg.channel}' has no shipped runtime — no connector to send through.`,
      );
    }
    const sendability = messagingChannelSendability(cfg.channel, this.env);
    if (sendability.status !== 'ready') {
      throw new Error(
        `Messaging channel '${cfg.channel}' is not configured — missing ${sendability.missing.join(', ')}. ` +
          `The connector ships but a send requires the provider credentials; refusing rather than faking a send.`,
      );
    }

    const shopRow = await this.prisma.shop.findUnique({ where: { shopDomain } });
    const { recipients, total } = await this.resolveAudience(shopRow?.id, cfg, event, offset);
    const page = recipients.slice(0, cfg.batchSize);

    const job = await this.jobs.create({
      shopId: shopRow?.id,
      type: 'MESSAGING_RUN',
      payload: { moduleId, trigger, channel: cfg.channel, total, offset, batch: page.length, runToken },
    });
    await this.jobs.start(job.id);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (const r of page) {
        // Idempotency layer 2 (the sent-marker): a data_store recipient already sent
        // in THIS fan-out (runToken present in its __sentRuns) is skipped, so a
        // double-resume or a cursor that overlaps a shifted window never double-sends.
        if (recipientAlreadySent(r, runToken)) {
          skipped++;
          continue;
        }
        // Consent gate. For sms/email this is the AUTHORITATIVE marketing-consent
        // check against Shopify (defaultPhoneNumber/defaultEmailAddress.marketingState
        // === 'SUBSCRIBED') when the recipient carries a customer GID, falling back to
        // the record's consent field. slack has no per-person marketing consent; push
        // is gated by the subscription itself in sendOne. A recipient who isn't
        // verifiably opted in is skipped — never sent.
        if (cfg.respectConsent && (await this.isConsentBlocked(shopDomain, cfg, r, event))) {
          skipped++;
          continue;
        }
        // Fine per-recipient filter via the shared rule-engine evaluator.
        if (cfg.audience.ruleEngine && !recordMatchesRuleEngine(cfg.audience.ruleEngine, r)) {
          skipped++;
          continue;
        }
        try {
          await this.sendOne(shopDomain, cfg, r, event);
          sent++;
          // Persist the sent-marker BEFORE counting done so a crash mid-page leaves a
          // durable record that this recipient was already delivered (idempotent).
          await this.markRecipientSent(shopRow?.id, cfg, r, runToken);
        } catch (err) {
          failed++;
          await this.writeLog(job.id, shopRow?.id, cfg.channel, r, 'FAILED', err);
        }
      }

      // Cross-run paging: when this page did not exhaust the audience, PARK the next
      // page on the durable scheduler (R3.5). The parked runId is idempotent so a
      // re-park (redelivery / double-resume) is a P2002 no-op — never a duplicate.
      const remaining = total > offset + cfg.batchSize;
      let parkedNextOffset: number | undefined;
      if (parkRemainder && remaining && isPageableSource(cfg)) {
        parkedNextOffset = await this.parkNextPage(shopRow?.id, {
          moduleId,
          campaignName: spec.name,
          nextOffset: offset + cfg.batchSize,
          runToken,
          trigger,
        });
      }

      // Drip entry: after delivering step 0 (this run), park step 1 on the durable
      // scheduler so it lands after step 1's delay. Later steps chain from the resume
      // (runDripStep). Only when the entry actually reached ≥1 recipient (sent>0), so a
      // no-recipient entry doesn't schedule a phantom sequence. parkRemainder gates it
      // off for a "Send test".
      if (parkRemainder && cfg.trigger.kind === 'drip' && sent > 0 && offset === 0) {
        await this.parkNextDripStep(shopRow?.id, {
          moduleId,
          campaignName: spec.name,
          nextStepIndex: 1,
          dripToken: runToken,
          trigger,
          entryEvent: event,
          steps: cfg.trigger.steps,
        });
      }

      const result: CampaignRunResult = {
        moduleId,
        resolved: page.length,
        total,
        sent,
        failed,
        skipped,
        paged: remaining,
        offset,
        parkedNextOffset,
        runToken,
      };
      await this.jobs.succeed(job.id, result);
      return result;
    } catch (err) {
      // Only a resolution/setup failure reaches here (per-recipient failures are
      // caught above); mark the job failed and rethrow so callers surface it.
      await this.jobs.fail(job.id, err);
      throw err;
    }
  }

  /**
   * Park the next page as a WAITING WorkflowRun on the durable scheduler. Reuses
   * `WorkflowEngineService.startRun` + `buildShopAuthResolver` VERBATIM (no new
   * queue). The parked runId is idempotent (module + runToken + offset) so a
   * redelivery / double-resume that re-parks the same page collides on the
   * WorkflowRun unique id (P2002, swallowed). Returns the next offset, or undefined
   * when there is no tenant to park under (parking needs a shopId to auth resumes).
   */
  private async parkNextPage(
    shopId: string | undefined,
    input: { moduleId: string; campaignName: string; nextOffset: number; runToken: string; trigger: MessagingTrigger },
  ): Promise<number | undefined> {
    if (!shopId) return undefined;
    const resumeAt = new Date(this.nowDate().getTime() + (this.deps.pageDelayMs ?? 1000));
    const workflow = parkMessagingPageWorkflow({
      shopId,
      moduleId: input.moduleId,
      campaignName: input.campaignName,
      offset: input.nextOffset,
      runToken: input.runToken,
      trigger: input.trigger,
      resumeAt,
    });
    const runId = messagingPageRunId({ moduleId: input.moduleId, runToken: input.runToken, offset: input.nextOffset });
    const payload = { moduleId: input.moduleId, offset: input.nextOffset, runToken: input.runToken, trigger: input.trigger };
    try {
      await this.engine.startRun(workflow, payload as Record<string, unknown>, {
        tenantId: shopId,
        runId,
        authResolver: this.authResolverFor(shopId),
      });
    } catch (err) {
      // Already parked by a prior delivery — idempotent, treat as scheduled.
      if (!isUniqueViolation(err)) throw err;
    }
    return input.nextOffset;
  }

  /**
   * Park the next DRIP step as a WAITING WorkflowRun on the durable scheduler. Reuses
   * the same park→resume spine as paging. `resumeAt = now + steps[stepIndex].delayMs`.
   * No-op when there is no such step (sequence complete) or no tenant. The parked runId
   * is idempotent (module + dripToken + stepIndex) so a re-park is a P2002 no-op.
   */
  private async parkNextDripStep(
    shopId: string | undefined,
    input: {
      moduleId: string;
      campaignName: string;
      nextStepIndex: number;
      dripToken: string;
      trigger: MessagingTrigger;
      entryEvent: unknown;
      steps?: MessagingPack['trigger']['steps'];
    },
  ): Promise<number | undefined> {
    if (!shopId) return undefined;
    const steps = input.steps ?? [];
    const step = steps[input.nextStepIndex];
    if (!step) return undefined; // sequence complete — nothing left to park.

    // The step's own delay drives resumeAt. In tests pageDelayMs can force it small.
    const delayMs = this.deps.pageDelayMs ?? step.delayMs;
    const resumeAt = new Date(this.nowDate().getTime() + delayMs);
    const workflow = parkMessagingDripStepWorkflow({
      shopId,
      moduleId: input.moduleId,
      campaignName: input.campaignName,
      stepIndex: input.nextStepIndex,
      dripToken: input.dripToken,
      trigger: input.trigger,
      entryEvent: input.entryEvent,
      resumeAt,
    });
    const runId = messagingDripRunId({ moduleId: input.moduleId, dripToken: input.dripToken, stepIndex: input.nextStepIndex });
    const payload = {
      moduleId: input.moduleId,
      stepIndex: input.nextStepIndex,
      dripToken: input.dripToken,
      trigger: input.trigger,
      entryEvent: input.entryEvent,
    };
    try {
      await this.engine.startRun(workflow, payload as Record<string, unknown>, {
        tenantId: shopId,
        runId,
        authResolver: this.authResolverFor(shopId),
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return input.nextStepIndex;
  }

  /**
   * Deliver ONE drip step (the resume seam the durable scheduler fires via
   * `MessagingConnector.sendDripStep`). Sends step `stepIndex` to the recipient on the
   * entry event, then parks step `stepIndex + 1` if the sequence continues. Consent is
   * re-checked on every step (a customer who unsubscribed between steps is skipped).
   */
  async runDripStep(
    shopDomain: string,
    moduleId: string,
    opts: { stepIndex: number; dripToken: string; trigger: MessagingTrigger; entryEvent: unknown },
  ): Promise<{ sent: number; skipped: number; failed: number; parkedNextStep?: number }> {
    const mod = await this.prisma.module.findFirst({
      where: { id: moduleId, shop: { shopDomain }, type: 'messaging.campaign' },
      include: { activeVersion: true },
    });
    if (!mod) throw new Error(`Messaging campaign ${moduleId} not found for ${shopDomain}`);
    if (mod.status !== 'PUBLISHED') throw new Error(`${mod.name} is not published — drip stopped`);
    if (!mod.activeVersion) throw new Error(`${mod.name} has no published version — drip stopped`);

    const spec = new RecipeService().parse(mod.activeVersion.specJson);
    if (spec.type !== 'messaging.campaign') throw new Error(`${mod.name} is not a messaging.campaign module`);
    const cfg = spec.config;
    if (cfg.trigger.kind !== 'drip' || !cfg.trigger.steps) {
      throw new Error(`${mod.name} is not a drip campaign — no step to deliver`);
    }
    const step = cfg.trigger.steps[opts.stepIndex];
    if (!step) return { sent: 0, skipped: 0, failed: 0 }; // out of range — nothing to do.

    // A step may override the channel (e.g. email entry → SMS reminder). Build an
    // effective config for this step: the step's channel + its matching template.
    const stepChannel = (step.channel ?? cfg.channel) as MessagingChannel;
    const stepCfg: MessagingPack = { ...cfg, channel: stepChannel };

    // Refuse loudly if this step's channel is unconfigured — never fake a send.
    const sendability = messagingChannelSendability(stepChannel, this.env);
    if (sendability.status !== 'ready') {
      throw new Error(
        `Drip step ${opts.stepIndex} channel '${stepChannel}' is not configured — missing ${sendability.missing.join(', ')}.`,
      );
    }

    const shopRow = await this.prisma.shop.findUnique({ where: { shopDomain } });
    // The recipient is the person on the entry event (event_recipient semantics).
    const { recipients } = await this.resolveAudience(shopRow?.id, { ...stepCfg, audience: { ...stepCfg.audience, source: 'event_recipient' } }, opts.entryEvent, 0);

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const r of recipients) {
      if (stepCfg.respectConsent && (await this.isConsentBlocked(shopDomain, stepCfg, r, opts.entryEvent))) {
        skipped++;
        continue;
      }
      try {
        await this.sendOne(shopDomain, stepCfg, r, opts.entryEvent);
        sent++;
      } catch {
        failed++;
      }
    }

    // Park the next step if the sequence continues.
    let parkedNextStep: number | undefined;
    if (cfg.trigger.steps[opts.stepIndex + 1]) {
      parkedNextStep = await this.parkNextDripStep(shopRow?.id, {
        moduleId,
        campaignName: spec.name,
        nextStepIndex: opts.stepIndex + 1,
        dripToken: opts.dripToken,
        trigger: opts.trigger,
        entryEvent: opts.entryEvent,
        steps: cfg.trigger.steps,
      });
    }

    return { sent, skipped, failed, parkedNextStep };
  }

  /**
   * Write the per-run sent-marker onto a data_store recipient record so a resume /
   * redelivery never re-sends it. Mirrors the loyalty ledger's per-GID lots: the
   * marker is a set of runTokens on the record payload (`__sentRuns`). No-op for
   * non-data_store sources (literal/event_recipient are single-shot, not paged).
   */
  private async markRecipientSent(
    shopId: string | undefined,
    cfg: MessagingPack,
    r: Recipient,
    runToken: string,
  ): Promise<void> {
    if (cfg.audience.source !== 'data_store' || !shopId || !cfg.audience.storeKey) return;
    const recordId = typeof r.__recordId === 'string' ? r.__recordId : undefined;
    if (!recordId) return;
    try {
      const store = await this.dataStore.getStoreByKey(shopId, cfg.audience.storeKey);
      if (!store) return;
      const prior = Array.isArray(r.__sentRuns) ? (r.__sentRuns as string[]) : [];
      if (prior.includes(runToken)) return;
      // Strip the runner-injected wrapper keys before persisting the payload back.
      const { __recordId, title, __sentRuns, ...payloadFields } = r;
      void __recordId;
      void title;
      void __sentRuns;
      await this.dataStore.updateRecord(recordId, store.id, {
        payload: { ...payloadFields, __sentRuns: [...prior, runToken] },
      });
    } catch {
      // The sent-marker is a best-effort dedupe aid; the durable cursor is the
      // primary paging guarantee. Never let a marker write break the send loop.
    }
  }

  /**
   * Resolve the recipient set + the total available (for the paging-gap signal),
   * starting at the durable cursor `offset`. Only `data_store` is deterministically
   * cursor-pageable (stable `orderBy: createdAt desc` + offset/total); `literal`
   * and `event_recipient` are single-shot sets and ignore the offset.
   */
  private async resolveAudience(
    shopId: string | undefined,
    cfg: MessagingPack,
    event: unknown,
    offset = 0,
  ): Promise<{ recipients: Recipient[]; total: number }> {
    const aud = cfg.audience;
    const addressField = aud.addressField ?? defaultAddressField(cfg.channel);

    if (aud.source === 'literal') {
      const recipients = aud.recipients.map((addr) => ({ [addressField]: addr }));
      return { recipients, total: recipients.length };
    }

    if (aud.source === 'event_recipient') {
      const addr =
        readPath(event, 'customer.email') ??
        readPath(event, 'email') ??
        readPath(event, `customer.${addressField}`) ??
        readPath(event, addressField);
      if (addr == null) return { recipients: [], total: 0 };
      const rec: Recipient = { ...(isRecord(event) ? event : {}), [addressField]: addr };
      return { recipients: [rec], total: 1 };
    }

    // source: 'data_store' — the capture→persist→fan-out spine. Paged by offset.
    if (!shopId || !aud.storeKey) return { recipients: [], total: 0 };
    const listing = await this.dataStore.listRecords(shopId, aud.storeKey, {
      limit: cfg.batchSize,
      offset,
    });
    if (!listing) return { recipients: [], total: 0 };
    // Each record's payload holds the addressField + consentField + merge vars.
    const recipients: Recipient[] = listing.records.map((rec) => ({
      ...(isRecord(rec.payload) ? (rec.payload as Recipient) : {}),
      // Expose the record wrapper too so templates can address {{record.*}} and {{title}}.
      title: rec.title,
      __recordId: rec.id,
      // Carry the prior sent-marker so the dedupe check + marker merge see it.
      __sentRuns: isRecord(rec.payload) && Array.isArray((rec.payload as Record<string, unknown>).__sentRuns)
        ? ((rec.payload as Record<string, unknown>).__sentRuns as string[])
        : [],
    }));
    return { recipients, total: listing.total };
  }

  /**
   * True when a recipient must be SKIPPED for consent reasons.
   *
   *  - sms / email → resolve the customer's marketing-consent state from Shopify
   *    (the source of truth) via `resolveConsent`; opted in iff `SUBSCRIBED`. Falls
   *    back to the record's consent field when there's no customer GID.
   *  - slack        → no per-person marketing consent; honour the record consent
   *    field if the merchant set one, else allow (ops/webhook channel).
   *  - push         → subscription IS the opt-in; the connector refuses a send with no
   *    subscription, so we don't block here (but still honour a record consent field).
   */
  private async isConsentBlocked(
    shopDomain: string,
    cfg: MessagingPack,
    r: Recipient,
    event: unknown,
  ): Promise<boolean> {
    const channel = cfg.channel as MessagingChannel;
    const consentField = cfg.audience.consentField;

    if (channel === 'sms' || channel === 'email') {
      const graphql = await this.adminGraphqlFor(shopDomain);
      const verdict = await resolveConsent({ channel, record: r, event, consentField, graphql });
      if (verdict.source === 'none') {
        // No opt-in SIGNAL to check (no customer GID, no consent field).
        //  - sms  → STRICT: never send to a phone with no verifiable opt-in.
        //  - email → preserve the prior posture: the merchant owns their email list;
        //    without a consent field configured, an email broadcast is allowed. (A
        //    configured-but-falsy field is already `record_field` → ok:false → blocked.)
        return channel === 'sms';
      }
      return !verdict.ok;
    }

    // slack / push: only the record consent field applies (when present).
    if (consentField) return !truthy(r[consentField]);
    return false;
  }

  /**
   * The ONLY delivery path — the same connector call the live SEND_EMAIL_NOTIFICATION /
   * SEND_SLACK_MESSAGE steps make, extended to sms (SmsConnector) and push
   * (WebPushConnector). Consent is already enforced upstream (isConsentBlocked); the
   * connectors additionally refuse to send without provider credentials / a
   * subscription — never a fake send.
   */
  private async sendOne(
    shopDomain: string,
    cfg: MessagingPack,
    r: Recipient,
    event: unknown,
  ): Promise<void> {
    const channel = cfg.channel as MessagingChannel;
    const tmpl = cfg.templates.find((t) => t.channel === channel);
    if (!tmpl) throw new Error(`No template for channel '${channel}'`);
    const ctx = { record: r, event };
    const body = renderMergeVars(tmpl.body, ctx);

    if (channel === 'email') {
      const connector = this.connectorFor('email');
      if (!connector) throw new Error('Email connector not registered');
      const addressField = cfg.audience.addressField ?? 'email';
      const to = r[addressField];
      if (typeof to !== 'string' || !to.includes('@')) {
        throw new Error(`Recipient has no valid email in field '${addressField}'`);
      }
      const result = await connector.invoke(
        { type: 'api_key', apiKey: this.deps.emailApiKey ?? process.env.EMAIL_API_KEY ?? '' },
        {
          runId: `messaging-${Date.now()}`,
          stepId: 'MESSAGING_SEND_EMAIL',
          tenantId: shopDomain,
          operation: 'send',
          inputs: { to, subject: renderMergeVars(tmpl.subject ?? '', ctx), body },
          timeoutMs: 10000,
        },
      );
      if (!result.ok) throw new Error(`Email send failed: ${result.message}`);
      return;
    }

    if (channel === 'slack') {
      const connector = this.connectorFor('slack');
      if (!connector) throw new Error('Slack connector not registered');
      // Slack webhook: literal recipients carry the webhook URL; else fall back to env.
      const addressField = cfg.audience.addressField ?? 'webhookUrl';
      const webhookUrl =
        (typeof r[addressField] === 'string' ? (r[addressField] as string) : undefined) ??
        this.deps.slackWebhookUrl ??
        process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) throw new Error('Slack channel has no webhook URL (recipient field or SLACK_WEBHOOK_URL)');
      const result = await connector.invoke(
        { type: 'none' },
        {
          runId: `messaging-${Date.now()}`,
          stepId: 'MESSAGING_SEND_SLACK',
          tenantId: shopDomain,
          operation: 'webhook.send',
          inputs: { webhookUrl, text: body },
          timeoutMs: 10000,
        },
      );
      if (!result.ok) throw new Error(`Slack send failed: ${result.message}`);
      return;
    }

    if (channel === 'sms') {
      const connector = this.connectorFor('sms');
      if (!connector) throw new Error('SMS connector not registered');
      const addressField = cfg.audience.addressField ?? 'phone';
      const to = r[addressField];
      if (typeof to !== 'string' || !to.trim()) {
        throw new Error(`Recipient has no phone number in field '${addressField}'`);
      }
      const result = await connector.invoke(
        // The auth token comes from the provider env; api_key carries the token when set.
        { type: 'api_key', apiKey: this.env.SMS_PROVIDER_AUTH_TOKEN ?? '' },
        {
          runId: `messaging-${Date.now()}`,
          stepId: 'MESSAGING_SEND_SMS',
          tenantId: shopDomain,
          operation: 'send',
          // consentVerified:true — consent was already enforced by isConsentBlocked
          // upstream; the connector re-asserts it as a firewall, never fakes a send.
          inputs: { to: to.trim(), body, consentVerified: true },
          timeoutMs: 15000,
        },
      );
      if (!result.ok) throw new Error(`SMS send failed: ${result.message}`);
      return;
    }

    if (channel === 'push') {
      const connector = this.connectorFor('webpush');
      if (!connector) throw new Error('Web-push connector not registered');
      // The push subscription is the opt-in; it lives on the recipient record. Accept a
      // few common field shapes so a captured PushSubscription drops straight in.
      const subField = cfg.audience.addressField ?? 'subscription';
      const subscription =
        (isRecord(r[subField]) ? r[subField] : undefined) ??
        (isRecord(r.subscription) ? r.subscription : undefined) ??
        (isRecord(r.pushSubscription) ? r.pushSubscription : undefined);
      if (!isRecord(subscription)) {
        throw new Error('Recipient has no push subscription (the subscription is the opt-in)');
      }
      const payload: Record<string, unknown> = {
        title: renderMergeVars(tmpl.title ?? cfg.templates.find((t) => t.channel === 'push')?.title ?? '', ctx) || 'Notification',
        body,
      };
      if (tmpl.url) payload.url = renderMergeVars(tmpl.url, ctx);
      const result = await connector.invoke(
        { type: 'none' },
        {
          runId: `messaging-${Date.now()}`,
          stepId: 'MESSAGING_SEND_PUSH',
          tenantId: shopDomain,
          operation: 'send',
          inputs: { subscription, payload },
          timeoutMs: 15000,
        },
      );
      if (!result.ok) {
        // Stale subscription (410/404 from the push service): REALLY prune it so the
        // audience stops targeting a gone endpoint. Best-effort — never masks the error.
        const gone =
          isRecord(result.details) && result.details.subscriptionGone === true;
        const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint : '';
        if (gone && endpoint) {
          try {
            const shopRow = await this.prisma.shop.findUnique({
              where: { shopDomain },
              select: { id: true },
            });
            if (shopRow) await new PushSubscriptionStore(this.dataStore).prune(shopRow.id, endpoint);
          } catch {
            /* prune is best-effort; the send failure below is still reported */
          }
        }
        throw new Error(`Push send failed: ${result.message}`);
      }
      return;
    }

    // Unreachable: the channel gate in runCampaign covers every modeled channel.
    throw new Error(`Messaging channel '${channel}' has no shipped runtime`);
  }

  /** Log a per-recipient failure. Masks the address (PII) and caps output size. */
  private async writeLog(
    jobId: string,
    shopId: string | undefined,
    channel: string,
    r: Recipient,
    status: 'FAILED',
    error: unknown,
  ): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.prisma.flowStepLog.create({
        data: {
          jobId,
          shop: shopId ? { connect: { id: shopId } } : undefined,
          step: 0,
          kind: `MESSAGING_SEND_${channel.toUpperCase()}`,
          status,
          durationMs: 0,
          output: JSON.stringify({ recipient: maskRecipient(r) }).slice(0, 2000),
          error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        },
      });
    } catch {
      // Logging must never break the run.
    }
  }
}

// ─── Cross-run paging helpers ──────────────────────────────────────────────────

/**
 * Derive the stable per-fan-out run token — shared by every page of one broadcast /
 * event so the sent-marker dedupes across all its pages, yet distinct across
 * separate fan-outs so a later run of the same campaign starts a fresh delivery.
 *
 * The token keys on the module + trigger + a coarse identity of the triggering
 * event (the product/order/customer GID when present, else a per-hour bucket so a
 * scheduled/manual broadcast that re-fires within the hour dedupes, while the next
 * scheduled window is a new fan-out). Deterministic — the head run and the parked
 * pages compute the same value.
 */
export function deriveRunToken(moduleId: string, trigger: MessagingTrigger, event: unknown): string {
  const gid =
    (readPath(event, 'admin_graphql_api_id') as string | undefined) ??
    (readPath(event, 'id') as string | number | undefined);
  const key = gid != null ? String(gid) : `bucket:${Math.floor(Date.now() / 3_600_000)}`;
  return `${moduleId}:${trigger}:${key}`.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 96);
}

/** True when a data_store recipient already carries this run's sent-marker. */
export function recipientAlreadySent(r: Recipient, runToken: string): boolean {
  const marks = r.__sentRuns;
  return Array.isArray(marks) && marks.includes(runToken);
}

/**
 * Only `data_store` is deterministically cursor-pageable (stable order + offset +
 * total). `literal`/`event_recipient` are single-shot sets — there is nothing to
 * page, so the runner never parks for them (honest: we page what is deterministic).
 */
export function isPageableSource(cfg: MessagingPack): boolean {
  return cfg.audience.source === 'data_store';
}

/** True for a Prisma unique-constraint violation (P2002) — a re-parked page. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** Whether a campaign's trigger matches the fired trigger + event. */
export function triggerMatches(cfg: MessagingPack, trigger: MessagingTrigger, event: unknown): boolean {
  const t = cfg.trigger;
  if (t.kind === 'broadcast') {
    // A blast fires on an explicit send (MANUAL) or a scheduled sweep (SCHEDULED).
    return trigger === 'MANUAL' || trigger === 'SCHEDULED';
  }
  if (t.kind === 'event') {
    return t.event === trigger;
  }
  if (t.kind === 'back_in_stock') {
    // Preset: product/update webhook, guarded by an inventory-cross into positive.
    if (trigger !== 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED') return false;
    return inventoryCrossedIntoStock(event);
  }
  if (t.kind === 'drip') {
    // A drip campaign's ENTRY step fires when its preset's entry trigger fires. The
    // later steps are delivered by the durable scheduler (parked between steps), NOT
    // by re-matching the trigger — so triggerMatches only gates the entry send.
    return dripEntryMatches(t.dripPreset, trigger, event);
  }
  return false;
}

/**
 * Whether a drip preset's ENTRY trigger fired. Each preset maps to a real live
 * trigger (mirrors back_in_stock), with a preset-specific guard where one applies:
 *  - back_in_stock  → product/update + inventory cross into positive.
 *  - price_drop     → product/update (a price-fall guard would need the prior price;
 *                     the per-recipient waitlist filter scopes the send, so fail-open).
 *  - replenishment / win_back / post_purchase → order/create (timing is the point;
 *                     the delay to the first step differentiates them).
 *  - browse_abandon → a captured browse record (SUPERAPP_DATA_RECORD_CREATED).
 */
export function dripEntryMatches(
  preset: MessagingPack['trigger']['dripPreset'],
  trigger: MessagingTrigger,
  event: unknown,
): boolean {
  const entry = preset ? MESSAGING_DRIP_PRESET_ENTRY[preset] : undefined;
  if (!entry || entry !== trigger) return false;
  if (preset === 'back_in_stock') return inventoryCrossedIntoStock(event);
  return true;
}

/**
 * back_in_stock guard — a product/update where available inventory is now positive.
 * Best-effort over the webhook payload (variants[].inventory_quantity). Absent
 * inventory data → treat as a restock candidate (fail-open on the guard, since the
 * per-recipient product filter still scopes the send).
 */
function inventoryCrossedIntoStock(event: unknown): boolean {
  if (!isRecord(event)) return true;
  const variants = event.variants;
  if (!Array.isArray(variants)) return true;
  return variants.some((v) => {
    const qty = isRecord(v) ? Number(v.inventory_quantity) : NaN;
    return Number.isFinite(qty) && qty > 0;
  });
}

/** Default address field per channel. */
function defaultAddressField(channel: string): string {
  if (channel === 'email') return 'email';
  if (channel === 'slack') return 'webhookUrl';
  if (channel === 'push') return 'subscription';
  return 'phone'; // sms
}

/**
 * Apply the rule-engine filter to a single record. Maps the record's fields into the
 * shared evaluator's `${object}.${attribute}` value context, then reuses the closed
 * evaluator (no parallel operator vocabulary). A record matches when the pack's
 * verdict is `show` (matchAction respected inside the evaluator).
 */
export function recordMatchesRuleEngine(
  ruleEngine: NonNullable<MessagingPack['audience']['ruleEngine']>,
  record: Recipient,
): boolean {
  if (!ruleEngine.enabled || !ruleEngine.groups || ruleEngine.groups.length === 0) return true;
  const values: Record<string, string | number | boolean | string[] | undefined> = {};
  for (const group of ruleEngine.groups) {
    for (const cond of group.conditions) {
      const key = `${cond.object}.${cond.attribute}`;
      // Map both the qualified key and the bare attribute onto the record field.
      const raw = record[cond.attribute];
      values[key] = normalizeValue(raw);
    }
  }
  const { verdict } = evaluateRuleEngine(ruleEngine, { values });
  return verdict === 'show';
}

function normalizeValue(v: unknown): string | number | boolean | string[] | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(String);
  return String(v);
}

/** Substitute `{{dot.path}}` merge vars against the recipient record + event. */
export function renderMergeVars(template: string, ctx: { record: Recipient; event: unknown }): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const val = readPath(ctx, path);
    return val != null ? String(val) : '';
  });
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s !== '' && s !== 'false' && s !== '0' && s !== 'no';
  }
  return true;
}

/** Read a dot-path out of a nested object (same helper the flow runner uses). */
function readPath(root: unknown, dotted: string): unknown {
  const parts = dotted.split('.');
  let val: unknown = root;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Mask an address for logs — keep only enough to debug, never the full PII. */
function maskRecipient(r: Recipient): string {
  for (const field of ['email', 'phone', 'webhookUrl']) {
    const v = r[field];
    if (typeof v === 'string' && v.length > 0) return maskAddress(v);
  }
  return '[recipient]';
}

function maskAddress(addr: string): string {
  if (addr.includes('@')) {
    const [local, domain] = addr.split('@');
    const head = (local ?? '').slice(0, 2);
    return `${head}***@${domain ?? ''}`;
  }
  return `${addr.slice(0, 3)}***`;
}
