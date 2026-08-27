/**
 * Human-friendly relative time for internal admin surfaces.
 *
 * Ported from the richest local variant (internal.ai-assistant) so every log,
 * job, module and store page renders elapsed time identically: "just now" for
 * the last 45s, then m/h/d ago, then an ISO date once past a week. Accepts an
 * ISO string or a Date; returns '' for unparseable input.
 */
export function formatRelativeTime(input: string | Date): string {
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Merchant-facing "time ago" formatters (WS-I dedupe — was 8 near-duplicate
 * local `timeAgo`/`relativeTime` implementations across merchant route
 * files, see docs/superpowers/plans/2026-08-24-ws-i-cleanup.md Task 16).
 * Kept distinct from `formatRelativeTime` above, which is the internal-admin
 * formatter with its own established behavior and callers.
 *
 * Re-verification at execution time found the prior merchant-route
 * implementations fell into four genuinely distinct bucketing schemes, not
 * just different signatures/fallbacks:
 *  - `relativeTime` — minute → hour → day, rounded. (modules._index.tsx,
 *    support._index.tsx, support.$ticketId.tsx were byte-identical bodies.)
 *  - `relativeTimeHourly` — hour → day only, rounded, no minute bucket.
 *    (connectors._index.tsx, connectors.$connectorId.tsx were byte-identical.)
 *  - `relativeTimeFloor` — second → minute → hour → day, floored (not
 *    rounded), with a lower "just now" cutoff. (flows._index.tsx.)
 *  - `relativeTimeVerbose` — second → minute → hour → day, rounded, with a
 *    "Yesterday" special case at exactly 1 day. (_index.tsx,
 *    activity._index.tsx were byte-identical.)
 *
 * Per WS-I's binding constraint against silently unifying differing
 * behavior, each scheme keeps its own exported function here (one canonical
 * implementation per behavior, consolidated into one file) rather than being
 * forced into a single function.
 */

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const t = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Minute → hour → day, rounded. Matches the original bodies of
 * `modules._index.tsx`, `support._index.tsx`, and `support.$ticketId.tsx`.
 */
export function relativeTime(value: Date | string | null | undefined, fallback = 'never'): string {
  const t = toTime(value);
  if (t == null) return fallback;
  const diffMs = Date.now() - t;
  const m = Math.round(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Hour → day only, rounded (no minute bucket — a diff under 30 minutes reads
 * as "just now", 30min-90min reads as "1h ago", etc). Matches the original
 * bodies of `connectors._index.tsx` and `connectors.$connectorId.tsx`.
 */
export function relativeTimeHourly(value: Date | string | null | undefined, fallback = 'never'): string {
  const t = toTime(value);
  if (t == null) return fallback;
  const diffMs = Date.now() - t;
  const h = Math.round(diffMs / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Second → minute → hour → day, floored (not rounded). Matches the original
 * body of `flows._index.tsx`.
 */
export function relativeTimeFloor(value: Date | string | null | undefined, fallback = 'never'): string {
  const t = toTime(value);
  if (t == null) return fallback;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Second → minute → hour → day, rounded, with a "Yesterday" special case at
 * exactly 1 day. Matches the original bodies of `_index.tsx` and
 * `activity._index.tsx`.
 */
export function relativeTimeVerbose(value: Date | string | null | undefined, fallback = 'never'): string {
  const t = toTime(value);
  if (t == null) return fallback;
  const secs = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return secs + 's ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.round(hrs / 24);
  return days === 1 ? 'Yesterday' : days + 'd ago';
}
