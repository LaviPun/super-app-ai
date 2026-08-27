import { getPrisma } from '~/db.server';

/**
 * WS-C Task 13 (funnel spine). The "99.9% headline" the launch program tracks:
 * of every AI_GENERATE job created in the window, what fraction survived all
 * the way to a successful PUBLISH job sharing its correlationId? Each stage
 * (optioned → hydrated → published) is a strict subset check keyed on the
 * SAME correlationId the WS-QF billing-dedupe seam already uses — this
 * service never introduces a second parallel id.
 */
export type FunnelStats = {
  windowDays: number;
  /** AI_GENERATE jobs created in the window. */
  classified: number;
  /** …of those, jobs that reached SUCCESS (>=1 valid option). */
  optioned: number;
  /** …whose correlationId has an AI_HYDRATE SUCCESS job (any time after). */
  hydrated: number;
  /** …whose correlationId has a PUBLISH SUCCESS job (any time after). */
  published: number;
  optionedRate: number;
  hydratedRate: number;
  publishedRate: number;
  /** The 99.9% headline: published / classified. */
  endToEndRate: number;
  recentFailures: Array<{
    jobId: string;
    type: string;
    correlationId: string | null;
    error: string;
    createdAt: string;
    shopDomain: string | null;
  }>;
};

const DEFAULT_WINDOW_DAYS = 7;
const MAX_GENERATE_SCAN = 5000;
const RECENT_FAILURES_LIMIT = 20;
const FUNNEL_FAILURE_TYPES = ['AI_GENERATE', 'AI_HYDRATE', 'PUBLISH'];

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

/**
 * `Job.error` is either a typed AppErrorPayload JSON string (`{ error, message,
 * requestId?, details? }`, written by `failWithPayload`) or a legacy bare
 * string / `String(Error)` (written by the older `jobs.fail`). Mirrors the
 * poll route's `parseJobError` (api.ai.jobs.$jobId.tsx) but this call site only
 * needs the human-readable summary for the ops table, not the full structure.
 */
function friendlyErrorMessage(raw: string | null): string {
  if (!raw) return 'Unknown error';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string') {
      return (parsed as { message: string }).message;
    }
  } catch {
    // Not JSON — legacy bare-string format, fall through and use it as-is.
  }
  return raw;
}

export class FunnelService {
  async windowStats(windowDays: number = DEFAULT_WINDOW_DAYS): Promise<FunnelStats> {
    const prisma = getPrisma();
    const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

    const generateJobs = await prisma.job.findMany({
      where: { type: 'AI_GENERATE', createdAt: { gte: cutoff } },
      select: { id: true, correlationId: true, status: true },
      take: MAX_GENERATE_SCAN,
    });

    const classified = generateJobs.length;
    const optioned = generateJobs.filter((j) => j.status === 'SUCCESS').length;
    const correlationIds = Array.from(
      new Set(generateJobs.map((j) => j.correlationId).filter((id): id is string => Boolean(id))),
    );

    // Hydrate/publish jobs are created strictly after the generation job that
    // seeded their correlationId, so there's no need for a window on these
    // queries — only an upper bound via the `in` list already collected above.
    let hydrated = 0;
    let published = 0;
    if (correlationIds.length > 0) {
      const [hydrateJobs, publishJobs] = await Promise.all([
        prisma.job.findMany({
          where: { type: 'AI_HYDRATE', status: 'SUCCESS', correlationId: { in: correlationIds } },
          select: { correlationId: true },
        }),
        prisma.job.findMany({
          where: { type: 'PUBLISH', status: 'SUCCESS', correlationId: { in: correlationIds } },
          select: { correlationId: true },
        }),
      ]);
      hydrated = new Set(hydrateJobs.map((j) => j.correlationId)).size;
      published = new Set(publishJobs.map((j) => j.correlationId)).size;
    }

    const failedJobs = await prisma.job.findMany({
      where: { type: { in: FUNNEL_FAILURE_TYPES }, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: RECENT_FAILURES_LIMIT,
      include: { shop: true },
    });

    return {
      windowDays,
      classified,
      optioned,
      hydrated,
      published,
      optionedRate: rate(optioned, classified),
      hydratedRate: rate(hydrated, classified),
      publishedRate: rate(published, classified),
      endToEndRate: rate(published, classified),
      recentFailures: failedJobs.map((j) => ({
        jobId: j.id,
        type: j.type,
        correlationId: j.correlationId ?? null,
        error: friendlyErrorMessage(j.error),
        createdAt: j.createdAt.toISOString(),
        shopDomain: j.shop?.shopDomain ?? null,
      })),
    };
  }
}
