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
import type { RecipeSpec, MessagingPack, MessagingChannel } from '@superapp/core';
import { MESSAGING_CHANNELS_SHIPPED, evaluateRuleEngine } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { JobService } from '~/services/jobs/job.service';
import { DataStoreService } from '~/services/data/data-store.service';
import { getConnector } from '~/services/workflows/connectors/index';

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
   * True when `total > batchSize` — the run sent one bounded page and the rest need
   * cross-run paging (R3.5). Surfaced so "did not send to the whole list" is visible.
   */
  paged: boolean;
};

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
      results.push(await this.runCampaign(shopDomain, admin, mod.id, spec, event, trigger));
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

    return this.runCampaign(shopDomain, admin, mod.id, runSpec, event, opts.trigger ?? 'MANUAL');
  }

  private async runCampaign(
    shopDomain: string,
    admin: AdminApiContext['admin'],
    moduleId: string,
    spec: Extract<RecipeSpec, { type: 'messaging.campaign' }>,
    event: unknown,
    trigger: MessagingTrigger,
  ): Promise<CampaignRunResult> {
    const cfg = spec.config;

    // Channel gate — refuse loudly, never fake. sms/push have no shipped connector.
    if (!(MESSAGING_CHANNELS_SHIPPED as readonly string[]).includes(cfg.channel)) {
      throw new Error(
        `Messaging channel '${cfg.channel}' has no shipped runtime — no connector to send through (email/slack only until sms/push connectors ship).`,
      );
    }

    const shopRow = await this.prisma.shop.findUnique({ where: { shopDomain } });
    const { recipients, total } = await this.resolveAudience(shopRow?.id, cfg, event);
    const page = recipients.slice(0, cfg.batchSize);

    const job = await this.jobs.create({
      shopId: shopRow?.id,
      type: 'MESSAGING_RUN',
      payload: { moduleId, trigger, channel: cfg.channel, total, batch: page.length },
    });
    await this.jobs.start(job.id);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (const r of page) {
        // Consent gate (belt & suspenders — also applied server-side by respectConsent).
        if (cfg.respectConsent && cfg.audience.consentField && !truthy(r[cfg.audience.consentField])) {
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
        } catch (err) {
          failed++;
          await this.writeLog(job.id, shopRow?.id, cfg.channel, r, 'FAILED', err);
        }
      }

      const result: CampaignRunResult = {
        moduleId,
        resolved: page.length,
        total,
        sent,
        failed,
        skipped,
        paged: total > cfg.batchSize,
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

  /** Resolve the recipient set + the total available (for the paging-gap signal). */
  private async resolveAudience(
    shopId: string | undefined,
    cfg: MessagingPack,
    event: unknown,
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

    // source: 'data_store' — the capture→persist→fan-out spine.
    if (!shopId || !aud.storeKey) return { recipients: [], total: 0 };
    const listing = await this.dataStore.listRecords(shopId, aud.storeKey, {
      limit: cfg.batchSize,
      offset: 0,
    });
    if (!listing) return { recipients: [], total: 0 };
    // Each record's payload holds the addressField + consentField + merge vars.
    const recipients: Recipient[] = listing.records.map((rec) => ({
      ...(isRecord(rec.payload) ? (rec.payload as Recipient) : {}),
      // Expose the record wrapper too so templates can address {{record.*}} and {{title}}.
      title: rec.title,
      __recordId: rec.id,
    }));
    return { recipients, total: listing.total };
  }

  /**
   * The ONLY delivery path — the same connector call the live SEND_EMAIL_NOTIFICATION /
   * SEND_SLACK_MESSAGE steps make. sms/push are unreachable (the channel gate threw).
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

    // Unreachable: the channel gate in runCampaign already threw for sms/push.
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
  return false;
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
  return 'phone'; // sms/push (never reached at send time; used only for resolution shape)
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
