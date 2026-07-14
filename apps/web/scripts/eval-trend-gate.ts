/**
 * Eval quality trend gate (035 vocab-hardening — Phase 5b).
 *
 * The flywheel's regression brake. Given the CURRENT nightly report and the
 * append-only JSONL history (artifact-restored from prior runs), it fails when
 * `avgQualityScore` has dropped MORE than `MAX_DROP` (10%) below the trailing
 * median — catching a silent quality regression that every hard schema gate would
 * wave through.
 *
 * Graceful degradation: with no history (first run, or the artifact wasn't
 * restored) it PASSES with a notice — a trend gate can't gate a trend it can't
 * see. It also passes when the current score EXCEEDS the median (improvement).
 *
 * Pure core (`evaluateTrend`) is unit-tested; the CLI is a thin I/O wrapper.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.scripts.json scripts/eval-trend-gate.ts \
 *     --report scripts/eval-out/eval-report-<date>.json \
 *     --history scripts/eval-out/history.jsonl
 * Exit codes: 0 = pass (or no-history notice) · 1 = regression · 2 = usage/IO error
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimum history rows before the gate is willing to enforce (below this → notice-pass). */
export const MIN_HISTORY = 2;
/** Trailing window of history rows the median is computed over. */
export const TREND_WINDOW = 14;
/** Allowed fractional drop below the trailing median before failing (10%). */
export const MAX_DROP = 0.1;

export type TrendPoint = { avgQualityScore: number; date?: string };

export type TrendVerdict = {
  pass: boolean;
  reason: string;
  /** Trailing median of history avgQualityScore, or null when insufficient history. */
  median: number | null;
  /** Fractional drop of current vs median (positive = below median), or null. */
  drop: number | null;
  /** Whether the gate actually enforced (vs. a notice-pass). */
  enforced: boolean;
};

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Decide whether the current avgQualityScore constitutes a regression against the
 * trailing median of `history`. Pure — no I/O. `history` should be prior runs
 * (the current run excluded); order is oldest→newest but only the trailing
 * {@link TREND_WINDOW} rows are used.
 */
export function evaluateTrend(current: TrendPoint, history: TrendPoint[]): TrendVerdict {
  const scores = history
    .map((h) => h.avgQualityScore)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));

  if (scores.length < MIN_HISTORY) {
    return {
      pass: true,
      reason: `No enforceable history (${scores.length} prior run(s), need ≥${MIN_HISTORY}). Passing with notice; recording baseline.`,
      median: scores.length > 0 ? median(scores) : null,
      drop: null,
      enforced: false,
    };
  }

  const window = scores.slice(-TREND_WINDOW);
  const med = median(window);
  const floor = med * (1 - MAX_DROP);
  const drop = med > 0 ? (med - current.avgQualityScore) / med : 0;

  if (current.avgQualityScore < floor) {
    return {
      pass: false,
      reason:
        `avgQualityScore ${current.avgQualityScore.toFixed(3)} is ${(drop * 100).toFixed(1)}% below the trailing median ${med.toFixed(3)} ` +
        `(floor ${floor.toFixed(3)} = median − ${(MAX_DROP * 100).toFixed(0)}%). Quality regression.`,
      median: med,
      drop,
      enforced: true,
    };
  }

  return {
    pass: true,
    reason:
      current.avgQualityScore >= med
        ? `avgQualityScore ${current.avgQualityScore.toFixed(3)} ≥ trailing median ${med.toFixed(3)} — steady or improving.`
        : `avgQualityScore ${current.avgQualityScore.toFixed(3)} within ${(MAX_DROP * 100).toFixed(0)}% of trailing median ${med.toFixed(3)} (drop ${(drop * 100).toFixed(1)}%).`,
    median: med,
    drop,
    enforced: true,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Parse a JSONL history file into trend points; tolerates blank/corrupt lines. */
export function parseHistoryJsonl(text: string): TrendPoint[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const row = JSON.parse(line) as Partial<TrendPoint>;
        return typeof row.avgQualityScore === 'number' ? ({ avgQualityScore: row.avgQualityScore, date: row.date } as TrendPoint) : null;
      } catch {
        return null;
      }
    })
    .filter((p): p is TrendPoint => p !== null);
}

function isCliEntry(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.includes('eval-trend-gate');
}

if (isCliEntry()) {
  const reportPath = arg('report');
  if (!reportPath) {
    console.error('Usage: eval-trend-gate --report <report.json> [--history <history.jsonl>]');
    process.exit(2);
  }
  let current: TrendPoint;
  try {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), reportPath), 'utf8')) as Partial<TrendPoint>;
    if (typeof raw.avgQualityScore !== 'number') throw new Error('report has no numeric avgQualityScore');
    current = { avgQualityScore: raw.avgQualityScore, date: raw.date };
  } catch (err) {
    console.error(`[trend-gate] cannot read report ${reportPath}: ${String(err)}`);
    process.exit(2);
  }

  const historyPath = arg('history');
  let history: TrendPoint[] = [];
  if (historyPath && existsSync(resolve(process.cwd(), historyPath))) {
    history = parseHistoryJsonl(readFileSync(resolve(process.cwd(), historyPath), 'utf8'));
  }

  const verdict = evaluateTrend(current, history);
  const tag = verdict.pass ? (verdict.enforced ? 'PASS' : 'PASS (notice)') : 'FAIL';
  console.info(`[trend-gate] ${tag} — ${verdict.reason}`);
  process.exit(verdict.pass ? 0 : 1);
}
