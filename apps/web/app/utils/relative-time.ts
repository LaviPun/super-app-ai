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
