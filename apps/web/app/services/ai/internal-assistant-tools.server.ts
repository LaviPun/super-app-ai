import { getPrisma } from '~/db.server';
import { getDocsIndex, resolveDocsDir, searchDocs } from '~/services/ai/app-docs-index.server';
import { redactString } from '~/services/observability/redact.server';

export type AssistantToolName =
  | 'getSystemHealth'
  | 'checkDBStatus'
  | 'getRecentErrors'
  | 'fetchLogs'
  | 'searchAppDocs'
  | 'getAppOverview';

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
  // 1. Ops tools first (existing keyword rules) so a docs/overview match can never
  //    evict e.g. getRecentErrors on "why did the publish job fail?".
  for (const entry of TOOL_KEYWORDS) {
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

export function formatToolContext(results: AssistantToolRunResult[]): string {
  if (!results.length) return '';
  const snapshotLines: string[] = [];
  let docsResult: AssistantToolRunResult | undefined;
  let overviewResult: AssistantToolRunResult | undefined;
  for (const result of results) {
    if (result.toolName === 'searchAppDocs') docsResult = result;
    else if (result.toolName === 'getAppOverview') overviewResult = result;
    else snapshotLines.push(`- ${result.toolName}: ${JSON.stringify(result.data).slice(0, 3000)}`);
  }

  // Ops snapshot + overview are the priority blocks; docs excerpts fill the
  // remaining budget and are trimmed (lowest-ranked snippet first) when over.
  const blocks: string[] = [];
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
