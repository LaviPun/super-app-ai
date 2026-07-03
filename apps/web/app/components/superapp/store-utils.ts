/* Pure presentation utilities ported from the design bundle's store.jsx.
   (The design's localStorage CRUD is replaced by Remix loaders/actions; only the
   pure helpers below are shared.) */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Derived per-store health score (0-100). Pass real ErrorLog rows to apply the
// error penalty; callers that omit them get a score with no error deduction
// (no fabricated defaults).
export function storeHealth(s: any, errorLogs: any[] = []): number {
  let score = 100;
  if (s.status === 'EXPIRED') score -= 64;
  else if (s.status === 'TRIAL') score -= 8;
  if (s.published === 0 && s.status !== 'EXPIRED') score -= 16;
  const slug = (s.domain || '').split('.')[0];
  const errs = (errorLogs || []).filter((e) => e.level === 'ERROR' && (e.shop || '').includes(slug)).length;
  score -= errs * 8;
  if (s.aiCalls30d === 0 && s.status !== 'EXPIRED') score -= 10;
  if (s.plan === 'ENTERPRISE' || s.plan === 'PRO') score += 4;
  return Math.max(3, Math.min(100, Math.round(score)));
}
export function healthTone(h: number) { return h >= 80 ? 'success' : h >= 55 ? 'warning' : 'critical'; }
export function healthLabel(h: number) { return h >= 80 ? 'Healthy' : h >= 55 ? 'At risk' : 'Critical'; }

// Real client-side CSV export (download).
export function exportCSV(filename: string, rows: any[], columns?: string[]) {
  if (!rows || !rows.length) return;
  const cols = columns || Object.keys(rows[0]);
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
  try {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* download blocked — silent */ }
}

// Live nav counts (DLQ / errors / failed webhooks) computed from real rows the
// caller passes; empty arrays yield zero counts.
export function navCounts(jobs: any[] = [], errors: any[] = [], webhooks: any[] = []) {
  return {
    dlq: jobs.filter((j) => j.status === 'FAILED').length,
    err: errors.filter((e) => e.level === 'ERROR').length,
    wh: webhooks.filter((w) => !w.success).length,
  };
}
