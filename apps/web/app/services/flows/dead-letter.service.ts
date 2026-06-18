import { getPrisma } from '~/db.server';

/**
 * Dead-letter queue for flow runs. When a flow run fails after its in-run retries,
 * it is dead-lettered here. The cron endpoint replays PENDING entries with bounded
 * exponential backoff; after `maxAttempts` the entry is DISCARDED (never retried in
 * an infinite loop) and kept for manual inspection / replay from the admin.
 */

// Backoff per attempt (ms). Length also bounds the default maxAttempts.
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];

function nextRetryAt(attempts: number): Date {
  const idx = Math.min(attempts, BACKOFF_MS.length - 1);
  return new Date(Date.now() + BACKOFF_MS[idx]!);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}).slice(0, 20_000);
  } catch {
    return '{}';
  }
}

export interface DeadLetterInput {
  shopId: string;
  flowId?: string | null;
  trigger: string;
  event: unknown;
  error: string;
}

export class DeadLetterService {
  /** Record a failed flow run. No-ops in tests. */
  async record(input: DeadLetterInput) {
    if (process.env.NODE_ENV === 'test') return null;
    try {
      return await getPrisma().flowDeadLetter.create({
        data: {
          shopId: input.shopId,
          flowId: input.flowId ?? null,
          trigger: input.trigger,
          eventJson: safeJson(input.event),
          error: input.error.slice(0, 4000),
          attempts: 0,
          status: 'PENDING',
          nextRetryAt: nextRetryAt(0),
        },
      });
    } catch {
      return null; // dead-lettering must never throw into the caller
    }
  }

  /** Claim PENDING entries whose retry is due, marking them REPLAYING. */
  async claimDue(limit = 20): Promise<
    Array<{ id: string; shopId: string; flowId: string | null; trigger: string; eventJson: string; attempts: number; maxAttempts: number }>
  > {
    const prisma = getPrisma();
    const due = await prisma.flowDeadLetter.findMany({
      where: { status: 'PENDING', nextRetryAt: { lte: new Date() } },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
    if (due.length > 0) {
      await prisma.flowDeadLetter.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { status: 'REPLAYING' },
      });
    }
    return due.map((d) => ({
      id: d.id,
      shopId: d.shopId,
      flowId: d.flowId,
      trigger: d.trigger,
      eventJson: d.eventJson,
      attempts: d.attempts,
      maxAttempts: d.maxAttempts,
    }));
  }

  async markResolved(id: string) {
    return getPrisma().flowDeadLetter.update({ where: { id }, data: { status: 'RESOLVED' } });
  }

  /**
   * A replay attempt failed: bump attempts and either reschedule (PENDING) or, once
   * attempts reach maxAttempts, DISCARD — the bound that prevents an infinite loop.
   */
  async recordFailure(id: string, attempts: number, maxAttempts: number, error: string) {
    const nextAttempts = attempts + 1;
    const exhausted = nextAttempts >= maxAttempts;
    return getPrisma().flowDeadLetter.update({
      where: { id },
      data: {
        attempts: nextAttempts,
        lastError: error.slice(0, 4000),
        status: exhausted ? 'DISCARDED' : 'PENDING',
        nextRetryAt: exhausted ? null : nextRetryAt(nextAttempts),
      },
    });
  }
}
