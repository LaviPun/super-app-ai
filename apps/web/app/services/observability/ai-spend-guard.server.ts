import { getPrisma } from '~/db.server';

/**
 * AI spend guardrail (DevOps hardening 2026-09, item e).
 *
 * Observability ONLY — this module never blocks or throttles a request. It
 * answers one question: "how much AI money did we burn today, and is that over
 * the configured daily soft cap?" The answer feeds:
 *   - the cron ops-health sweep (fires an AI_SPEND_CAP_EXCEEDED ops alert on breach)
 *   - the internal admin shell banner (warn at >=80% of cap, critical at >=100%)
 *   - /healthz/deep's `aiSpend` signal
 *
 * Motivating incident: ~$20 of AI spend burned invisibly before anyone looked
 * at /internal/usage (see PR #45's unknown-model $0.00 masking fix — cost rows
 * exist and are now correct, but nothing WATCHED them).
 *
 * Cap resolution order: AppSettings.aiDailySpendCapCents (operator-set, null =
 * unset) → AI_DAILY_SPEND_CAP_CENTS env → DEFAULT_DAILY_CAP_CENTS. A cap <= 0
 * disables the check (signal reports 'skipped').
 */

/** $20/day default — matches the size of the incident that motivated this guard. */
export const DEFAULT_DAILY_CAP_CENTS = 2000;

export type SpendStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export interface SpendCheck {
  status: SpendStatus;
  spentCents: number;
  capCents: number | null;
  /** spentCents / capCents, rounded to 3 decimals; null when the cap is disabled. */
  ratio: number | null;
}

/** Warn when today's spend reaches this fraction of the cap. */
export const SPEND_WARN_RATIO = 0.8;

/**
 * Pure cap resolution — exported for tests.
 * `settingsCap` is AppSettings.aiDailySpendCapCents (null = operator never set one).
 * `envCap` is the raw AI_DAILY_SPEND_CAP_CENTS value (already number-coerced or undefined).
 */
export function resolveDailyCapCents(settingsCap: number | null | undefined, envCap: number | undefined): number {
  if (settingsCap != null && Number.isFinite(settingsCap)) return settingsCap;
  if (envCap != null && Number.isFinite(envCap)) return envCap;
  return DEFAULT_DAILY_CAP_CENTS;
}

/** Pure classifier — exported for tests. capCents <= 0 disables the check. */
export function classifySpend(spentCents: number, capCents: number): SpendCheck {
  if (!(capCents > 0)) {
    return { status: 'skipped', spentCents, capCents: null, ratio: null };
  }
  // Classify on the RAW ratio; round only the reported value (rounding first
  // would promote 79.95% to the 80% warn band).
  const rawRatio = spentCents / capCents;
  const status: SpendStatus = rawRatio >= 1 ? 'fail' : rawRatio >= SPEND_WARN_RATIO ? 'warn' : 'ok';
  return { status, spentCents, capCents, ratio: Math.round(rawRatio * 1000) / 1000 };
}

/** Start of the current UTC day — spend windows are UTC-aligned like the nightly backup. */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Sum of AiUsage.costCents since UTC midnight. */
export async function getTodaySpendCents(now: Date = new Date()): Promise<number> {
  const agg = await getPrisma().aiUsage.aggregate({
    _sum: { costCents: true },
    where: { createdAt: { gte: utcDayStart(now) } },
  });
  return agg._sum.costCents ?? 0;
}

function envCapCents(): number | undefined {
  const raw = process.env.AI_DAILY_SPEND_CAP_CENTS;
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Full check against the live DB: today's spend vs the resolved cap.
 * `settingsCap` lets callers that already loaded AppSettings avoid a second read.
 */
export async function checkDailySpend(opts: { now?: Date; settingsCap?: number | null } = {}): Promise<SpendCheck> {
  const now = opts.now ?? new Date();
  let settingsCap = opts.settingsCap;
  if (settingsCap === undefined) {
    try {
      const row = await getPrisma().appSettings.findUnique({
        where: { id: 'singleton' },
        select: { aiDailySpendCapCents: true },
      });
      settingsCap = row?.aiDailySpendCapCents ?? null;
    } catch {
      settingsCap = null;
    }
  }
  const capCents = resolveDailyCapCents(settingsCap, envCapCents());
  const spentCents = await getTodaySpendCents(now);
  return classifySpend(spentCents, capCents);
}
