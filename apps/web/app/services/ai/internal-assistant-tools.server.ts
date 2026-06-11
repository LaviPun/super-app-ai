import { getPrisma } from '~/db.server';
import { redactString } from '~/services/observability/redact.server';

export type AssistantToolName =
  | 'getSystemHealth'
  | 'checkDBStatus'
  | 'getRecentErrors'
  | 'fetchLogs';

export type AssistantToolRunResult = {
  toolName: AssistantToolName;
  ok: boolean;
  data: Record<string, unknown>;
};

type AssistantToolRunOptions = {
  shopDomain?: string;
};

const TOOL_KEYWORDS: Array<{ tool: AssistantToolName; patterns: RegExp[] }> = [
  { tool: 'checkDBStatus', patterns: [/\bdb\b/i, /\bdatabase\b/i, /\bsqlite\b/i] },
  { tool: 'getRecentErrors', patterns: [/\berrors?\b/i, /\bfail(?:ed|ure)?\b/i, /\bexception\b/i] },
  { tool: 'fetchLogs', patterns: [/\blogs?\b/i, /\bapi\b/i, /\brequests?\b/i] },
  { tool: 'getSystemHealth', patterns: [/\bhealth\b/i, /\bstatus\b/i, /\bsystem\b/i, /\buptime\b/i] },
];

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
  for (const entry of TOOL_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(prompt))) selected.push(entry.tool);
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

export function formatToolContext(results: AssistantToolRunResult[]): string {
  if (!results.length) return '';
  const lines: string[] = [];
  lines.push('Internal tools snapshot (sanitized):');
  for (const result of results) {
    lines.push(`- ${result.toolName}: ${JSON.stringify(result.data).slice(0, 3000)}`);
  }
  return lines.join('\n');
}
