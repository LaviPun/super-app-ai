import { getPrisma } from '~/db.server';

/**
 * WS-C Task 15 (QA telemetry aggregation + promote-to-blocking).
 *
 * `runAllQaGates` (llm.server.ts) already runs the design/render/richness QA
 * gates on every generated option and records the non-autofixed issue ids on
 * `AiGenerationOption.qaIssuesJson` (via `RecipeOption.qaSummary.issueIds`).
 * This service is the read side (aggregate the top recurring issue ids for
 * the ops dashboard) and the write side (let ops PROMOTE a recurring `warn`
 * to `fail` without a redeploy — `AppSettings.qaPromotedBlockingIssueIds`,
 * read back into `QaGateContext.promotedBlockingIssueIds` on the next run).
 *
 * Promoting an id changes generation behavior globally and immediately: the
 * next run whose QA gate reports that id as `warn` escalates it to `fail`,
 * which fires the existing bounded corrective-regeneration loop instead of
 * silently shipping the option.
 */
export type QaIssueStat = { issueId: string; count: number; promoted: boolean };
export type QaTelemetrySummary = { windowDays: number; totalOptions: number; topIssues: QaIssueStat[] };

const DEFAULT_WINDOW_DAYS = 7;
const MAX_OPTION_SCAN = 5000;
const TOP_ISSUES_LIMIT = 20;
const SETTINGS_ID = 'singleton';

/** Parse `AiGenerationOption.qaIssuesJson` defensively — null/corrupt/non-array all resolve to []. */
function parseIssueIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export class QaTelemetryService {
  /** Aggregates AiGenerationOption.qaIssuesJson over the window (top 20 by count). */
  async topIssues(windowDays: number = DEFAULT_WINDOW_DAYS): Promise<QaTelemetrySummary> {
    const prisma = getPrisma();
    const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

    const options = await prisma.aiGenerationOption.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { qaIssuesJson: true },
      take: MAX_OPTION_SCAN,
    });

    const counts = new Map<string, number>();
    for (const option of options) {
      for (const issueId of parseIssueIds(option.qaIssuesJson)) {
        counts.set(issueId, (counts.get(issueId) ?? 0) + 1);
      }
    }

    const promoted = new Set(await this.getPromotedBlockingIssueIds());
    const topIssues = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_ISSUES_LIMIT)
      .map(([issueId, count]) => ({ issueId, count, promoted: promoted.has(issueId) }));

    return { windowDays, totalOptions: options.length, topIssues };
  }

  /** Reads AppSettings.qaPromotedBlockingIssueIds (JSON string[]; [] on null/corrupt). */
  async getPromotedBlockingIssueIds(): Promise<string[]> {
    const prisma = getPrisma();
    const row = await prisma.appSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { qaPromotedBlockingIssueIds: true },
    });
    return parseIssueIds(row?.qaPromotedBlockingIssueIds ?? null);
  }

  /** Adds/removes an id; persists via SettingsService-style singleton update; audited by the caller. */
  async setPromoted(issueId: string, promoted: boolean): Promise<string[]> {
    const current = new Set(await this.getPromotedBlockingIssueIds());
    if (promoted) current.add(issueId);
    else current.delete(issueId);
    const next = Array.from(current);
    const json = JSON.stringify(next);

    const prisma = getPrisma();
    await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, qaPromotedBlockingIssueIds: json },
      update: { qaPromotedBlockingIssueIds: json },
    });

    return next;
  }
}
