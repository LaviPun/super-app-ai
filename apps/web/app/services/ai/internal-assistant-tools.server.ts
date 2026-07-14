import { getPrisma } from '~/db.server';
import { getDocsIndex, resolveDocsDir, searchDocs } from '~/services/ai/app-docs-index.server';
import { redactString } from '~/services/observability/redact.server';

export type AssistantToolName =
  | 'getSystemHealth'
  | 'checkDBStatus'
  | 'getRecentErrors'
  | 'fetchLogs'
  | 'searchAppDocs'
  | 'getAppOverview'
  | 'investigateLogEntry'
  | 'getActivityEvents'
  | 'getWebhookStatus'
  | 'getJobStatus';

export type AssistantToolRunResult = {
  toolName: AssistantToolName;
  ok: boolean;
  data: Record<string, unknown>;
};

type AssistantToolRunOptions = {
  shopDomain?: string;
  /** The user prompt — required by searchAppDocs to rank documentation sections. */
  prompt?: string;
};

const TOOL_KEYWORDS: Array<{ tool: AssistantToolName; patterns: RegExp[] }> = [
  { tool: 'checkDBStatus', patterns: [/\bdb\b/i, /\bdatabase\b/i, /\bsqlite\b/i] },
  { tool: 'getRecentErrors', patterns: [/\berrors?\b/i, /\bfail(?:ed|ure)?\b/i, /\bexception\b/i] },
  { tool: 'fetchLogs', patterns: [/\blogs?\b/i, /\bapi\b/i, /\brequests?\b/i] },
  { tool: 'getSystemHealth', patterns: [/\bhealth\b/i, /\bstatus\b/i, /\bsystem\b/i, /\buptime\b/i] },
];

/**
 * Log-family coverage tools. Appended AFTER {@link TOOL_KEYWORDS} in selection so
 * a family match never evicts an existing ops tool from the max-3 window (the
 * crowded-prompt cap tests depend on getRecentErrors surviving).
 */
const FAMILY_TOOL_KEYWORDS: Array<{ tool: AssistantToolName; patterns: RegExp[] }> = [
  {
    tool: 'getActivityEvents',
    patterns: [/\bactivity\b/i, /\baudit\b/i, /\bwho (?:did|changed)\b/i, /\brecent (?:actions|events)\b/i],
  },
  { tool: 'getWebhookStatus', patterns: [/\bwebhooks?\b/i] },
  { tool: 'getJobStatus', patterns: [/\bjobs?\b/i, /\bdlq\b/i, /\bqueue\b/i, /\breplay\b/i] },
];

/** cuid-like entity id (Prisma @default(cuid())), e.g. cmrezggie001m11h4wulhkams. */
const CUID_RE = /\bc[a-z0-9]{20,30}\b/i;
/**
 * Correlation-token shapes: {@link generateCorrelationId} emits `corr_<hex>` /
 * `req_<hex>`, but real rows also carry UUID correlation ids propagated from the
 * `x-correlation-id` / `x-shopify-request-id` headers — match both.
 */
const CORRELATION_RE =
  /\b(?:(?:corr|req)_[0-9a-f]{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;
/** "last/latest/most recent + error/failure/failed job", or an investigation verb. */
const LATEST_INVESTIGATE_RE =
  /(?:\b(?:last|latest|most recent)\b[\s\S]{0,40}?\b(?:errors?|failures?|failed|jobs?)\b)|(?:\b(?:investigate|diagnose|root cause)\b)|(?:\bwhy did\b[\s\S]{0,80}?\bfail)|(?:\bwhat happened (?:to|with)\b)|(?:\bexplain (?:this|that) (?:error|failure|job)\b)/i;

export type InvestigationTarget =
  | { kind: 'id'; id: string }
  | { kind: 'correlation'; correlationId: string }
  | { kind: 'latest' };

/**
 * Pure extraction of an investigation target from the operator prompt. Precedence:
 * explicit entity id (cuid) → explicit correlation token → latest-error/investigate
 * phrasing → null. Exported for routing and unit tests.
 */
export function extractInvestigationTarget(prompt: string): InvestigationTarget | null {
  if (typeof prompt !== 'string' || !prompt.trim()) return null;
  const cuid = prompt.match(CUID_RE);
  if (cuid) return { kind: 'id', id: cuid[0] };
  const corr = prompt.match(CORRELATION_RE);
  if (corr) return { kind: 'correlation', correlationId: corr[0] };
  if (LATEST_INVESTIGATE_RE.test(prompt)) return { kind: 'latest' };
  return null;
}

/**
 * App/domain keywords that make a *question-shaped* prompt worth grounding in the
 * docs corpus. Gated by {@link looksLikeQuestion} so generative imperatives that
 * merely contain a domain word (e.g. "write a release note") never trigger a
 * documentation search.
 */
const APP_DOCS_PATTERN =
  /\b(how|why|what|explain|guide|docs?|works?|working|architecture|module|flow|connector|template|recipe|blueprint|publish(?:ing)?|billing|plan tiers?|webhooks?|providers?|runbook|release|quota|automation|storefront)\b/i;

/** Prompts that are asking *about the app itself* — worth a live inventory snapshot. */
const APP_OVERVIEW_PATTERN =
  /\b(this app|the app|the platform|platform|overview|what is superapp|about (?:the|this) app|app architecture|explain the app|how (?:this|the) app works)\b/i;

/** Does the prompt read as a question / help request (vs. a generative imperative)? */
function looksLikeQuestion(prompt: string): boolean {
  const p = prompt.trim();
  if (p.includes('?')) return true;
  return /^(who|what|when|where|why|which|whose|how|explain|tell|guide|describe|summar(?:ise|ize)|walk me|give me an? overview|show me how)\b/i.test(
    p,
  );
}

function summarizeStatusCodeDistribution(values: number[]) {
  const buckets = { s2xx: 0, s4xx: 0, s5xx: 0, other: 0 };
  for (const status of values) {
    if (status >= 200 && status < 300) buckets.s2xx += 1;
    else if (status >= 400 && status < 500) buckets.s4xx += 1;
    else if (status >= 500 && status < 600) buckets.s5xx += 1;
    else buckets.other += 1;
  }
  return buckets;
}

export function selectToolsForPrompt(prompt: string): AssistantToolName[] {
  const selected: AssistantToolName[] = [];
  // 0. Specific-entry investigation is the priority tool: whenever the prompt
  //    carries an investigation target it goes FIRST so the max-3 slice can never
  //    evict it (an explicit id/correlation is deliberate operator intent).
  if (extractInvestigationTarget(prompt)) selected.push('investigateLogEntry');
  // 1. Ops tools next (existing keyword rules) so a docs/overview match can never
  //    evict e.g. getRecentErrors on "why did the publish job fail?".
  for (const entry of TOOL_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(prompt))) selected.push(entry.tool);
  }
  // 1b. Log-family coverage tools, appended after the existing ops tools so they
  //     extend coverage without displacing them from the window.
  for (const entry of FAMILY_TOOL_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(prompt))) selected.push(entry.tool);
  }
  const questionish = looksLikeQuestion(prompt);
  // 2. Documentation search for app/domain questions. Also the default-grounding
  //    rule: any question that matched no other tool still gets the docs search.
  if (questionish && (APP_DOCS_PATTERN.test(prompt) || selected.length === 0)) {
    selected.push('searchAppDocs');
  }
  // 3. Live inventory when the prompt is about the app/platform itself.
  if (APP_OVERVIEW_PATTERN.test(prompt)) {
    selected.push('getAppOverview');
  }
  return Array.from(new Set(selected)).slice(0, 3);
}

function sanitizeMessage(text: string, maxLength = 180): string {
  return redactString(text).slice(0, maxLength);
}

function sanitizePath(path: string | null | undefined): string {
  const redacted = redactString(path ?? '');
  if (redacted.length <= 120) return redacted;
  return `${redacted.slice(0, 117)}...`;
}

async function resolveShopIdByDomain(shopDomain?: string): Promise<string | null> {
  const normalized = shopDomain?.trim().toLowerCase();
  if (!normalized) return null;
  const prisma = getPrisma();
  const shop = await prisma.shop.findFirst({
    where: { shopDomain: normalized },
    select: { id: true },
  });
  return shop?.id ?? null;
}

/** Per-excerpt cap for investigation strings (message/result/route excerpts). */
const INVESTIGATE_EXCERPT_CAP = 300;
/** Whole-payload cap for the investigation snapshot; trace items trim to fit. */
const INVESTIGATE_PAYLOAD_CAP = 3000;
/** Bounded take per table for the correlation trace join (mirrors trace page). */
const TRACE_TAKE_PER_TABLE = 8;
/** Recurrence lookback window. */
const RELATED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Redact + cap a single free-text excerpt. */
function investigateExcerpt(text: string | null | undefined): string {
  const redacted = redactString(text ?? '');
  return redacted.length <= INVESTIGATE_EXCERPT_CAP
    ? redacted
    : `${redacted.slice(0, INVESTIGATE_EXCERPT_CAP - 3)}...`;
}

/** Normalized resolved row shared by id/correlation/latest resolution paths. */
type EntryRow = {
  table: 'errorLog' | 'job' | 'apiLog' | 'activityLog';
  id: string;
  createdAt: Date;
  correlationId: string | null;
  requestId: string | null;
  shopDomain: string | null;
  level: string | null;
  status: string | null;
  message: string | null;
  route: string | null;
  jobType: string | null;
};

type ErrorLogRow = {
  id: string;
  level: string | null;
  message: string | null;
  route: string | null;
  source: string | null;
  correlationId: string | null;
  requestId: string | null;
  createdAt: Date;
  shop?: { shopDomain: string } | null;
};
type JobRow = {
  id: string;
  type: string | null;
  status: string | null;
  error: string | null;
  result: string | null;
  payload: string | null;
  correlationId: string | null;
  requestId: string | null;
  createdAt: Date;
  shop?: { shopDomain: string } | null;
};
type ApiLogRow = {
  id: string;
  actor: string;
  method: string;
  path: string;
  status: number;
  correlationId: string | null;
  requestId: string | null;
  meta: string | null;
  createdAt: Date;
  shop?: { shopDomain: string } | null;
};
type ActivityRow = {
  id: string;
  actor: string;
  action: string;
  resource: string | null;
  details: string | null;
  correlationId: string | null;
  requestId: string | null;
  createdAt: Date;
  shop?: { shopDomain: string } | null;
};

function mapErrorLog(row: ErrorLogRow): EntryRow {
  return {
    table: 'errorLog',
    id: row.id,
    createdAt: row.createdAt,
    correlationId: row.correlationId ?? null,
    requestId: row.requestId ?? null,
    shopDomain: row.shop?.shopDomain ?? null,
    level: row.level ?? null,
    status: null,
    message: row.message ?? null,
    route: row.route ?? row.source ?? null,
    jobType: null,
  };
}
function mapJob(row: JobRow): EntryRow {
  return {
    table: 'job',
    id: row.id,
    createdAt: row.createdAt,
    correlationId: row.correlationId ?? null,
    requestId: row.requestId ?? null,
    shopDomain: row.shop?.shopDomain ?? null,
    level: null,
    status: row.status ?? null,
    message: row.error ?? row.result ?? row.payload ?? null,
    route: row.type ?? null,
    jobType: row.type ?? null,
  };
}
function mapApiLog(row: ApiLogRow): EntryRow {
  return {
    table: 'apiLog',
    id: row.id,
    createdAt: row.createdAt,
    correlationId: row.correlationId ?? null,
    requestId: row.requestId ?? null,
    shopDomain: row.shop?.shopDomain ?? null,
    level: null,
    status: String(row.status),
    message: row.meta ?? null,
    route: `${row.method} ${row.path}`,
    jobType: null,
  };
}
function mapActivity(row: ActivityRow): EntryRow {
  return {
    table: 'activityLog',
    id: row.id,
    createdAt: row.createdAt,
    correlationId: row.correlationId ?? null,
    requestId: row.requestId ?? null,
    shopDomain: row.shop?.shopDomain ?? null,
    level: null,
    status: null,
    message: row.details ?? null,
    route: `${row.actor} ${row.action}`,
    jobType: null,
  };
}

type PrismaClient = ReturnType<typeof getPrisma>;

/** Resolve an explicit entity id across errorLog → job → apiLog → activityLog. */
async function resolveEntryById(prisma: PrismaClient, id: string): Promise<EntryRow | null> {
  const err = (await prisma.errorLog
    .findFirst({ where: { id }, include: { shop: true } })
    .catch(() => null)) as ErrorLogRow | null;
  if (err) return mapErrorLog(err);
  const job = (await prisma.job
    .findFirst({ where: { id }, include: { shop: true } })
    .catch(() => null)) as JobRow | null;
  if (job) return mapJob(job);
  const api = (await prisma.apiLog
    .findFirst({ where: { id }, include: { shop: true } })
    .catch(() => null)) as ApiLogRow | null;
  if (api) return mapApiLog(api);
  const act = (await prisma.activityLog
    .findFirst({ where: { id }, include: { shop: true } })
    .catch(() => null)) as ActivityRow | null;
  if (act) return mapActivity(act);
  return null;
}

/** Resolve a correlation token to a representative row (error → job → api → activity). */
async function resolveEntryByCorrelation(prisma: PrismaClient, cid: string): Promise<EntryRow | null> {
  const where = { OR: [{ correlationId: cid }, { requestId: cid }] };
  const order = { createdAt: 'asc' as const };
  const err = (await prisma.errorLog
    .findFirst({ where, orderBy: order, include: { shop: true } })
    .catch(() => null)) as ErrorLogRow | null;
  if (err) return mapErrorLog(err);
  const job = (await prisma.job
    .findFirst({ where, orderBy: order, include: { shop: true } })
    .catch(() => null)) as JobRow | null;
  if (job) return mapJob(job);
  const api = (await prisma.apiLog
    .findFirst({ where, orderBy: order, include: { shop: true } })
    .catch(() => null)) as ApiLogRow | null;
  if (api) return mapApiLog(api);
  const act = (await prisma.activityLog
    .findFirst({ where, orderBy: order, include: { shop: true } })
    .catch(() => null)) as ActivityRow | null;
  if (act) return mapActivity(act);
  return null;
}

/** Latest sentinel: most recent ERROR-level errorLog, else most recent FAILED job. */
async function resolveLatestEntry(prisma: PrismaClient): Promise<EntryRow | null> {
  const err = (await prisma.errorLog
    .findFirst({ where: { level: 'ERROR' }, orderBy: { createdAt: 'desc' }, include: { shop: true } })
    .catch(() => null)) as ErrorLogRow | null;
  if (err) return mapErrorLog(err);
  const job = (await prisma.job
    .findFirst({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, include: { shop: true } })
    .catch(() => null)) as JobRow | null;
  if (job) return mapJob(job);
  return null;
}

type TimelineItem = { at: string; source: string; summary: string };

/** Build the correlation trace (trace-page join shape, bounded take, redacted). */
async function buildInvestigationTrace(prisma: PrismaClient, cid: string): Promise<TimelineItem[]> {
  const where = { OR: [{ correlationId: cid }, { requestId: cid }] };
  const cidWhere = { correlationId: cid };
  const order = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
  const take = TRACE_TAKE_PER_TABLE;
  const [apiLogs, jobs, errorLogs, aiUsage, flowSteps, activity] = await Promise.all([
    prisma.apiLog.findMany({ where, orderBy: order, include: { shop: true }, take }).catch(() => []),
    prisma.job.findMany({ where, orderBy: order, include: { shop: true }, take }).catch(() => []),
    prisma.errorLog.findMany({ where, orderBy: order, include: { shop: true }, take }).catch(() => []),
    prisma.aiUsage.findMany({ where: cidWhere, orderBy: order, include: { provider: true }, take }).catch(() => []),
    prisma.flowStepLog.findMany({ where: cidWhere, orderBy: order, take }).catch(() => []),
    prisma.activityLog.findMany({ where, orderBy: order, include: { shop: true }, take }).catch(() => []),
  ]);
  const items: Array<{ at: Date; source: string; summary: string }> = [];
  for (const l of apiLogs as ApiLogRow[] & Array<{ finishedAt?: Date | null }>) {
    const finished = (l as { finishedAt?: Date | null }).finishedAt;
    items.push({
      at: l.createdAt,
      source: 'api',
      summary: `${l.actor} ${l.method} ${l.path} -> ${finished == null ? 'running' : `HTTP ${l.status}`}`,
    });
  }
  for (const j of jobs as JobRow[]) {
    items.push({ at: j.createdAt, source: 'job', summary: `Job ${j.type} -> ${j.status}${j.error ? `: ${j.error}` : ''}` });
  }
  for (const e of errorLogs as ErrorLogRow[]) {
    items.push({ at: e.createdAt, source: 'error', summary: `${e.level} ${e.source ?? ''} ${e.message ?? ''}`.trim() });
  }
  for (const a of aiUsage as Array<{ createdAt: Date; action: string; tokensIn: number; tokensOut: number }>) {
    items.push({ at: a.createdAt, source: 'ai', summary: `AI ${a.action} · ${a.tokensIn}+${a.tokensOut} tok` });
  }
  for (const s of flowSteps as Array<{ createdAt: Date; step: number; kind: string; status: string }>) {
    items.push({ at: s.createdAt, source: 'flow', summary: `Flow step ${s.step} ${s.kind} -> ${s.status}` });
  }
  for (const a of activity as ActivityRow[]) {
    items.push({ at: a.createdAt, source: 'activity', summary: `${a.actor} ${a.action}${a.resource ? ` · ${a.resource}` : ''}` });
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return items.map((i) => ({ at: i.at.toISOString(), source: i.source, summary: investigateExcerpt(i.summary) }));
}

type RelatedRecurrence = {
  basis: string;
  count: number;
  latest: { id: string; at: string; detail?: string; shopDomain?: string | null } | null;
};

/** Recurrence evidence: same failing job.type, or same errorLog.message prefix, in 7d. */
async function buildInvestigationRelated(prisma: PrismaClient, entry: EntryRow): Promise<RelatedRecurrence | null> {
  const since = new Date(Date.now() - RELATED_WINDOW_MS);
  if (entry.table === 'job' && entry.jobType) {
    const base = { type: entry.jobType, status: 'FAILED', createdAt: { gte: since } };
    const [count, latestArr] = await Promise.all([
      prisma.job.count({ where: base }).catch(() => 0),
      prisma.job
        .findMany({ where: { ...base, id: { not: entry.id } }, orderBy: { createdAt: 'desc' }, take: 1, include: { shop: true } })
        .catch(() => []),
    ]);
    const latest = (latestArr as JobRow[])[0];
    return {
      basis: `job.type=${entry.jobType} FAILED (7d)`,
      count,
      latest: latest
        ? { id: latest.id, at: latest.createdAt.toISOString(), shopDomain: latest.shop?.shopDomain ?? null }
        : null,
    };
  }
  if (entry.table === 'errorLog' && entry.message) {
    const prefix = entry.message.slice(0, 40);
    const base = { level: 'ERROR', message: { startsWith: prefix }, createdAt: { gte: since } };
    const [count, latestArr] = await Promise.all([
      prisma.errorLog.count({ where: base }).catch(() => 0),
      prisma.errorLog
        .findMany({ where: { ...base, id: { not: entry.id } }, orderBy: { createdAt: 'desc' }, take: 1, include: { shop: true } })
        .catch(() => []),
    ]);
    const latest = (latestArr as ErrorLogRow[])[0];
    return {
      basis: 'errorLog.message prefix (7d)',
      count,
      latest: latest
        ? { id: latest.id, at: latest.createdAt.toISOString(), detail: investigateExcerpt(latest.message) }
        : null,
    };
  }
  return null;
}

/**
 * Centerpiece: resolve → correlate (trace) → recurrence, all redacted + budgeted.
 *
 * Scoping policy (deliberate): the aggregated log tools (getRecentErrors/fetchLogs)
 * require an explicit myshopify domain before returning row-level detail. This tool
 * is the intentional exception — an explicit id or correlation token in the prompt,
 * or the single `latest` sentinel row, IS explicit operator intent to inspect one
 * specific record, so it returns that row's detail WITHOUT a shop domain. Everything
 * is still passed through {@link redactString} and capped, so no secrets leak.
 */
async function runInvestigateLogEntry(prisma: PrismaClient, prompt: string): Promise<AssistantToolRunResult> {
  const target = extractInvestigationTarget(prompt);
  if (!target) {
    return {
      toolName: 'investigateLogEntry',
      ok: false,
      data: {
        found: false,
        reason:
          'No investigation target found. Include a log/job id (cuid), a correlation id, or ask about the latest error/failed job.',
      },
    };
  }
  let entry: EntryRow | null = null;
  if (target.kind === 'id') entry = await resolveEntryById(prisma, target.id);
  else if (target.kind === 'correlation') entry = await resolveEntryByCorrelation(prisma, target.correlationId);
  else entry = await resolveLatestEntry(prisma);

  if (!entry) {
    return {
      toolName: 'investigateLogEntry',
      ok: false,
      data: {
        found: false,
        target: target.kind === 'id' ? target.id : target.kind === 'correlation' ? target.correlationId : 'latest',
        reason:
          target.kind === 'latest'
            ? 'No recent ERROR-level log or FAILED job found.'
            : 'No errorLog, job, apiLog or activityLog row matches that identifier.',
      },
    };
  }

  // A correlation token from the prompt is the correlation itself; otherwise use
  // the resolved row's correlationId.
  const correlationId = target.kind === 'correlation' ? target.correlationId : entry.correlationId;
  const trace = correlationId ? await buildInvestigationTrace(prisma, correlationId) : [];
  const related = await buildInvestigationRelated(prisma, entry);

  const entryOut: Record<string, unknown> = {
    table: entry.table,
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    shopDomain: entry.shopDomain,
    correlationId,
  };
  if (entry.level) entryOut.level = entry.level;
  if (entry.status) entryOut.status = entry.status;
  if (entry.route) entryOut.route = investigateExcerpt(entry.route);
  if (entry.message) entryOut.message = investigateExcerpt(entry.message);

  const payload: Record<string, unknown> = { found: true, entry: entryOut };
  let traceItems = trace;
  if (traceItems.length) payload.trace = traceItems;
  if (related) payload.related = related;

  // Enforce the whole-payload cap by trimming trace items (the sacrificial part);
  // entry + related are investigation essentials and are never dropped.
  while (JSON.stringify(payload).length > INVESTIGATE_PAYLOAD_CAP && traceItems.length > 0) {
    traceItems = traceItems.slice(0, -1);
    if (traceItems.length) payload.trace = traceItems;
    else delete payload.trace;
  }

  return { toolName: 'investigateLogEntry', ok: true, data: payload };
}

export async function runAssistantTool(
  toolName: AssistantToolName,
  options: AssistantToolRunOptions = {},
): Promise<AssistantToolRunResult> {
  const prisma = getPrisma();
  const since1h = new Date(Date.now() - 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const scopedShopId = await resolveShopIdByDomain(options.shopDomain);
  const hasShopScope = Boolean(scopedShopId);

  if (toolName === 'checkDBStatus') {
    const started = Date.now();
    const [shopCount, moduleCount] = await Promise.all([
      prisma.shop.count(),
      prisma.module.count(),
    ]);
    return {
      toolName,
      ok: true,
      data: {
        connected: true,
        latencyMs: Date.now() - started,
        shopCount,
        moduleCount,
      },
    };
  }

  if (toolName === 'getRecentErrors') {
    const rows = await prisma.errorLog.findMany({
      where: {
        createdAt: { gte: since24h },
        ...(hasShopScope ? { shopId: scopedShopId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: hasShopScope ? 20 : 200,
      select: {
        id: true,
        level: true,
        message: true,
        source: true,
        route: true,
        createdAt: true,
      },
    });
    return {
      toolName,
      ok: true,
      data: {
        totalLast24h: rows.length,
        scopedToShopDomain: hasShopScope ? options.shopDomain : null,
        ...(hasShopScope
          ? {
              recent: rows.map((row) => ({
                id: row.id,
                level: row.level,
                source: row.source,
                route: sanitizePath(row.route),
                message: sanitizeMessage(row.message),
                createdAt: row.createdAt.toISOString(),
              })),
            }
          : {
              levelBuckets: rows.reduce<Record<string, number>>((acc, row) => {
                const key = row.level || 'UNKNOWN';
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
              }, {}),
              sourceBuckets: rows.reduce<Record<string, number>>((acc, row) => {
                const key = row.source || 'unknown';
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
              }, {}),
              note:
                'Add a myshopify domain in the prompt to retrieve scoped error details. Unscoped results are aggregated.',
            }),
      },
    };
  }

  if (toolName === 'fetchLogs') {
    const rows = await prisma.apiLog.findMany({
      where: {
        createdAt: { gte: since1h },
        ...(hasShopScope ? { shopId: scopedShopId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: hasShopScope ? 50 : 200,
      select: {
        id: true,
        actor: true,
        path: true,
        method: true,
        status: true,
        durationMs: true,
        createdAt: true,
      },
    });
    return {
      toolName,
      ok: true,
      data: {
        totalLast1h: rows.length,
        scopedToShopDomain: hasShopScope ? options.shopDomain : null,
        statusBuckets: summarizeStatusCodeDistribution(rows.map((row) => row.status)),
        ...(hasShopScope
          ? {
              recent: rows.slice(0, 15).map((row) => ({
                id: row.id,
                actor: row.actor,
                method: row.method,
                path: sanitizePath(row.path),
                status: row.status,
                durationMs: row.durationMs,
                createdAt: row.createdAt.toISOString(),
              })),
            }
          : {
              topMethods: rows.reduce<Record<string, number>>((acc, row) => {
                acc[row.method] = (acc[row.method] ?? 0) + 1;
                return acc;
              }, {}),
              note:
                'Add a myshopify domain in the prompt to retrieve scoped log rows. Unscoped results are aggregated.',
            }),
      },
    };
  }

  if (toolName === 'searchAppDocs') {
    const docsDir = resolveDocsDir();
    if (!docsDir) {
      return {
        toolName,
        ok: false,
        data: {
          available: false,
          reason:
            'App documentation corpus (docs/) is not available on this deployment; answer from tool snapshots only and say docs are unavailable.',
        },
      };
    }
    const index = getDocsIndex(docsDir);
    const snippets = searchDocs(index, options.prompt ?? '');
    return {
      toolName,
      ok: true,
      data: {
        available: true,
        query: (options.prompt ?? '').slice(0, 200),
        matches: snippets.length,
        snippets,
      },
    };
  }

  if (toolName === 'investigateLogEntry') {
    return runInvestigateLogEntry(prisma, options.prompt ?? '');
  }

  if (toolName === 'getActivityEvents') {
    const asCount = (p: Promise<number>) => p.catch(() => 0);
    const scoped = hasShopScope && scopedShopId ? { shopId: scopedShopId } : {};
    const [activity, auditCount, auditLatest] = await Promise.all([
      prisma.activityLog
        .findMany({
          where: { createdAt: { gte: since24h }, ...scoped },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { actor: true, action: true, resource: true, createdAt: true },
        })
        .catch(() => [] as Array<{ actor: string; action: string; resource: string | null; createdAt: Date }>),
      asCount(prisma.auditLog.count({ where: { createdAt: { gte: since24h }, ...scoped } })),
      prisma.auditLog
        .findMany({
          where: { createdAt: { gte: since24h }, ...scoped },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { action: true, createdAt: true },
        })
        .catch(() => [] as Array<{ action: string; createdAt: Date }>),
    ]);
    const byActor = activity.reduce<Record<string, number>>((acc, row) => {
      acc[row.actor] = (acc[row.actor] ?? 0) + 1;
      return acc;
    }, {});
    const actionCounts = activity.reduce<Record<string, number>>((acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    }, {});
    const topActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([action, count]) => ({ action, count }));
    return {
      toolName,
      ok: true,
      data: {
        windowHours: 24,
        scopedToShopDomain: hasShopScope ? options.shopDomain : null,
        activityTotal: activity.length,
        byActor,
        topActions,
        recent: activity.slice(0, 5).map((row) => ({
          actor: row.actor,
          action: row.action,
          resource: row.resource ? sanitizeMessage(row.resource, 80) : null,
          when: row.createdAt.toISOString(),
        })),
        audit: {
          totalLast24h: auditCount,
          latestActions: auditLatest.map((row) => ({ action: row.action, when: row.createdAt.toISOString() })),
        },
      },
    };
  }

  if (toolName === 'getWebhookStatus') {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const asCount = (p: Promise<number>) => p.catch(() => 0);
    const [total, failed, byTopicRows, failures] = await Promise.all([
      asCount(prisma.webhookEvent.count({ where: { processedAt: { gte: since7d } } })),
      asCount(prisma.webhookEvent.count({ where: { processedAt: { gte: since7d }, success: false } })),
      prisma.webhookEvent
        .groupBy({ by: ['topic'], where: { processedAt: { gte: since7d } }, _count: { _all: true } })
        .catch(() => [] as Array<{ topic: string; _count: { _all: number } }>),
      prisma.webhookEvent
        .findMany({
          where: { processedAt: { gte: since7d }, success: false },
          orderBy: { processedAt: 'desc' },
          take: 3,
          select: { topic: true, shopDomain: true, processedAt: true },
        })
        .catch(() => [] as Array<{ topic: string; shopDomain: string; processedAt: Date }>),
    ]);
    const byTopic = byTopicRows
      .map((row) => ({ topic: row.topic, count: row._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return {
      toolName,
      ok: true,
      data: {
        windowDays: 7,
        processed: Math.max(total - failed, 0),
        failed,
        total,
        byTopic,
        latestFailures: failures.map((row) => ({
          topic: row.topic,
          shopDomain: row.shopDomain,
          when: row.processedAt.toISOString(),
        })),
      },
    };
  }

  if (toolName === 'getJobStatus') {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const asCount = (p: Promise<number>) => p.catch(() => 0);
    const [byStatusRows, dlq, failedJobs] = await Promise.all([
      prisma.job
        .groupBy({ by: ['status'], where: { createdAt: { gte: since7d } }, _count: { _all: true } })
        .catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
      asCount(prisma.job.count({ where: { status: 'FAILED' } })),
      prisma.job
        .findMany({
          where: { status: 'FAILED', createdAt: { gte: since7d } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { shop: true },
        })
        .catch(() => [] as JobRow[]),
    ]);
    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;
    return {
      toolName,
      ok: true,
      data: {
        windowDays: 7,
        byStatus,
        dlqFailedTotal: dlq,
        recentFailed: (failedJobs as JobRow[]).map((job) => ({
          id: job.id,
          type: job.type,
          shopDomain: job.shop?.shopDomain ?? null,
          result: investigateExcerpt(job.error ?? job.result ?? job.payload ?? ''),
          when: job.createdAt.toISOString(),
        })),
      },
    };
  }

  if (toolName === 'getAppOverview') {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const asCount = (p: Promise<number>) => p.catch(() => 0);
    const [
      shopsTotal,
      shopsActive,
      modulesByStatus,
      flows,
      connectors,
      dataStores,
      activeProvider,
      failedJobsDlq,
      webhookFailures7d,
      aiUsage30d,
      appSettings,
    ] = await Promise.all([
      asCount(prisma.shop.count()),
      asCount(prisma.appSubscription.count({ where: { status: 'ACTIVE' } })),
      prisma.module
        .groupBy({ by: ['status'], _count: { _all: true } })
        .catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
      asCount(prisma.module.count({ where: { type: 'flow.automation' } })),
      asCount(prisma.connector.count()),
      asCount(prisma.dataStore.count()),
      prisma.aiProvider
        .findFirst({ where: { isActive: true }, select: { name: true, model: true, provider: true } })
        .catch(() => null),
      asCount(prisma.job.count({ where: { status: 'FAILED' } })),
      asCount(prisma.webhookEvent.count({ where: { success: false, processedAt: { gte: since7d } } })),
      prisma.aiUsage
        .aggregate({ where: { createdAt: { gte: since30d } }, _sum: { requestCount: true } })
        .catch(() => ({ _sum: { requestCount: 0 } })),
      prisma.appSettings
        .findUnique({ where: { id: 'singleton' }, select: { appName: true } })
        .catch(() => null),
    ]);
    const byStatus: Record<string, number> = {};
    for (const row of modulesByStatus) byStatus[row.status] = row._count._all;
    const modulesTotal = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return {
      toolName,
      ok: true,
      data: {
        appName: appSettings?.appName,
        shops: { total: shopsTotal, active: shopsActive },
        modules: { total: modulesTotal, byStatus },
        flows,
        connectors,
        dataStores,
        activeProvider: activeProvider
          ? { name: activeProvider.name, model: activeProvider.model ?? null, provider: activeProvider.provider }
          : null,
        failedJobsDlq,
        webhookFailures7d,
        aiRequests30d: aiUsage30d._sum.requestCount ?? 0,
      },
    };
  }

  const [db, recentErrors, apiLastHour, aiUsageLastHour] = await Promise.all([
    runAssistantTool('checkDBStatus'),
    runAssistantTool('getRecentErrors'),
    prisma.apiLog.count({ where: { createdAt: { gte: since1h } } }),
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: since1h } },
      _sum: { tokensIn: true, tokensOut: true, costCents: true },
    }),
  ]);

  return {
    toolName,
    ok: true,
    data: {
      now: new Date().toISOString(),
      db: db.data,
      apiRequestsLast1h: apiLastHour,
      aiLast1h: {
        tokensIn: aiUsageLastHour._sum.tokensIn ?? 0,
        tokensOut: aiUsageLastHour._sum.tokensOut ?? 0,
        costCents: aiUsageLastHour._sum.costCents ?? 0,
      },
      errorCountLast24h: Array.isArray((recentErrors.data as { recent?: unknown[] }).recent)
        ? ((recentErrors.data as { recent: unknown[] }).recent).length
        : 0,
    },
  };
}

/** Overall char budget for the injected tool context (local 4B has a tiny window). */
const TOOL_CONTEXT_BUDGET = 6000;

type DocsSnippet = { doc: string; heading: string; excerpt: string };

function formatOverviewBlock(result: AssistantToolRunResult): string {
  if (!result.ok) return 'App overview: unavailable.';
  const d = result.data as {
    appName?: string;
    shops?: { total?: number; active?: number };
    modules?: { total?: number; byStatus?: Record<string, number> };
    flows?: number;
    connectors?: number;
    dataStores?: number;
    activeProvider?: { name?: string; model?: string | null; provider?: string } | null;
    failedJobsDlq?: number;
    webhookFailures7d?: number;
    aiRequests30d?: number;
  };
  const lines = ['App overview (live):'];
  if (d.appName) lines.push(`app: ${d.appName}`);
  lines.push(`shops: ${d.shops?.total ?? 0} total, ${d.shops?.active ?? 0} active`);
  const byStatus = d.modules?.byStatus ?? {};
  const statusStr = Object.entries(byStatus)
    .map(([status, count]) => `${status} ${count}`)
    .join(', ');
  lines.push(`modules: ${d.modules?.total ?? 0}${statusStr ? ` (${statusStr})` : ''}`);
  lines.push(`flows: ${d.flows ?? 0}, connectors: ${d.connectors ?? 0}, dataStores: ${d.dataStores ?? 0}`);
  lines.push(
    d.activeProvider
      ? `activeProvider: ${d.activeProvider.name} (${d.activeProvider.model ?? d.activeProvider.provider})`
      : 'activeProvider: none active',
  );
  lines.push(
    `failedJobsDlq: ${d.failedJobsDlq ?? 0}, webhookFailures7d: ${d.webhookFailures7d ?? 0}, aiRequests30d: ${d.aiRequests30d ?? 0}`,
  );
  return lines.join('\n');
}

/** Render the docs snippets, dropping lowest-ranked snippets whole when over `budget`. */
function formatDocsBlock(result: AssistantToolRunResult, budget: number): string {
  if (!result.ok) {
    const reason = (result.data as { reason?: string }).reason ?? 'App documentation is unavailable.';
    return `App documentation excerpts: ${reason}`;
  }
  const snippets = ((result.data as { snippets?: DocsSnippet[] }).snippets ?? []).filter(Boolean);
  if (snippets.length === 0) return 'App documentation excerpts: no matching documentation found.';
  const header = 'App documentation excerpts:';
  if (budget <= header.length) return '';
  const parts = [header];
  let used = header.length;
  for (const snippet of snippets) {
    const line = `[${snippet.doc} § ${snippet.heading}]\n${snippet.excerpt}`;
    if (used + 1 + line.length > budget) break; // drop this + lower-ranked snippets
    parts.push(line);
    used += 1 + line.length;
  }
  return parts.length > 1 ? parts.join('\n') : '';
}

/** Render the investigation snapshot: entry, timeline lines, recurrence line. */
function formatInvestigationBlock(result: AssistantToolRunResult): string {
  const d = result.data as {
    found?: boolean;
    reason?: string;
    entry?: {
      table?: string;
      id?: string;
      createdAt?: string;
      level?: string;
      status?: string;
      route?: string;
      message?: string;
      shopDomain?: string | null;
      correlationId?: string | null;
    };
    trace?: Array<{ at?: string; source?: string; summary?: string }>;
    related?: { basis?: string; count?: number; latest?: { id?: string; detail?: string } | null } | null;
  };
  if (!result.ok || !d.found || !d.entry) {
    return `Investigation snapshot: ${d.reason ?? 'no matching log entry found.'}`;
  }
  const e = d.entry;
  const lines = ['Investigation snapshot:'];
  const state = [e.level, e.status].filter(Boolean).join('/');
  lines.push(
    `entry: ${e.table} ${e.id ?? ''} @ ${e.createdAt ?? '?'}${state ? ` [${state}]` : ''}` +
      `${e.route ? ` ${e.route}` : ''}${e.shopDomain ? ` (${e.shopDomain})` : ''}`,
  );
  if (e.message) lines.push(`message: ${e.message}`);
  lines.push(`correlationId: ${e.correlationId ?? 'none'}`);
  if (d.trace && d.trace.length) {
    lines.push('timeline:');
    for (const item of d.trace) {
      const at = (item.at ?? '').slice(11, 19) || '--:--:--';
      lines.push(`[${at} ${item.source ?? '?'}] ${item.summary ?? ''}`);
    }
  } else {
    lines.push('timeline: none (no correlation id on this entry).');
  }
  if (d.related) {
    const ex = d.related.latest ? ` latest ${d.related.latest.id ?? ''}${d.related.latest.detail ? `: ${d.related.latest.detail}` : ''}` : '';
    lines.push(`recurrence: ${d.related.count ?? 0}× ${d.related.basis ?? ''}${ex}`);
  }
  return lines.join('\n');
}

/** Render a log-family coverage tool as terse key/value + list lines. */
function formatFamilyBlock(result: AssistantToolRunResult): string {
  const d = result.data as Record<string, unknown>;
  if (!result.ok) return `${result.toolName}: unavailable.`;
  if (result.toolName === 'getActivityEvents') {
    const byActor = (d.byActor as Record<string, number>) ?? {};
    const topActions = (d.topActions as Array<{ action: string; count: number }>) ?? [];
    const audit = (d.audit as { totalLast24h?: number }) ?? {};
    const lines = ['Activity/audit (24h):'];
    lines.push(`activity: ${d.activityTotal ?? 0} events`);
    const actorStr = Object.entries(byActor).map(([a, c]) => `${a} ${c}`).join(', ');
    if (actorStr) lines.push(`byActor: ${actorStr}`);
    if (topActions.length) lines.push(`topActions: ${topActions.map((a) => `${a.action} ${a.count}`).join(', ')}`);
    lines.push(`audit: ${audit.totalLast24h ?? 0} entries`);
    return lines.join('\n');
  }
  if (result.toolName === 'getWebhookStatus') {
    const byTopic = (d.byTopic as Array<{ topic: string; count: number }>) ?? [];
    const failures = (d.latestFailures as Array<{ topic: string; shopDomain: string; when: string }>) ?? [];
    const lines = ['Webhooks (7d):'];
    lines.push(`processed: ${d.processed ?? 0}, failed: ${d.failed ?? 0}, total: ${d.total ?? 0}`);
    if (byTopic.length) lines.push(`topTopics: ${byTopic.map((t) => `${t.topic} ${t.count}`).join(', ')}`);
    if (failures.length) lines.push(`latestFailures: ${failures.map((f) => `${f.topic}@${f.shopDomain}`).join('; ')}`);
    return lines.join('\n');
  }
  if (result.toolName === 'getJobStatus') {
    const byStatus = (d.byStatus as Record<string, number>) ?? {};
    const failed = (d.recentFailed as Array<{ id: string; type: string; result: string }>) ?? [];
    const lines = ['Jobs (7d):'];
    const statusStr = Object.entries(byStatus).map(([s, c]) => `${s} ${c}`).join(', ');
    if (statusStr) lines.push(`byStatus: ${statusStr}`);
    lines.push(`dlqFailedTotal: ${d.dlqFailedTotal ?? 0}`);
    for (const j of failed) lines.push(`- ${j.type} ${j.id}: ${j.result}`);
    return lines.join('\n');
  }
  return `${result.toolName}: ${JSON.stringify(d).slice(0, 1000)}`;
}

const FAMILY_TOOL_NAMES = new Set<AssistantToolName>(['getActivityEvents', 'getWebhookStatus', 'getJobStatus']);

export function formatToolContext(results: AssistantToolRunResult[]): string {
  if (!results.length) return '';
  const snapshotLines: string[] = [];
  let docsResult: AssistantToolRunResult | undefined;
  let overviewResult: AssistantToolRunResult | undefined;
  let investigateResult: AssistantToolRunResult | undefined;
  const familyResults: AssistantToolRunResult[] = [];
  for (const result of results) {
    if (result.toolName === 'searchAppDocs') docsResult = result;
    else if (result.toolName === 'getAppOverview') overviewResult = result;
    else if (result.toolName === 'investigateLogEntry') investigateResult = result;
    else if (FAMILY_TOOL_NAMES.has(result.toolName)) familyResults.push(result);
    else snapshotLines.push(`- ${result.toolName}: ${JSON.stringify(result.data).slice(0, 3000)}`);
  }

  // Investigation snapshot is the highest-priority block (never sacrificial),
  // followed by family coverage, the ops snapshot, and overview. Docs excerpts
  // fill the remaining budget and are trimmed (lowest-ranked snippet first).
  const blocks: string[] = [];
  if (investigateResult) blocks.push(formatInvestigationBlock(investigateResult));
  for (const family of familyResults) blocks.push(formatFamilyBlock(family));
  if (snapshotLines.length) blocks.push(['Internal tools snapshot (sanitized):', ...snapshotLines].join('\n'));
  if (overviewResult) blocks.push(formatOverviewBlock(overviewResult));
  const priority = blocks.join('\n\n');

  if (docsResult) {
    const remaining = TOOL_CONTEXT_BUDGET - priority.length - (priority ? 2 : 0);
    const docsBlock = formatDocsBlock(docsResult, remaining);
    if (docsBlock) blocks.push(docsBlock);
  }
  return blocks.join('\n\n');
}
