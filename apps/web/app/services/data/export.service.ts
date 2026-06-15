/**
 * Export service (Module System v2 backend data). Dependency-free CSV + a
 * print-optimized HTML view (browser "Save as PDF" / print). Used by the data
 * store and module-captures export routes.
 */
import type { DataModel } from '@superapp/core';

export interface ExportableRecord {
  title?: string | null;
  externalId?: string | null;
  createdAt: string;
  /** JSON string payload (as stored in DataStoreRecord.payload / DataCapture.payload). */
  payload: string;
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const p = JSON.parse(payload);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : { value: p };
  } catch {
    return { raw: payload };
  }
}

/** Columns: model fields when typed, else the union of payload keys across records. */
function resolveColumns(records: ExportableRecord[], model?: DataModel | null): string[] {
  if (model && model.fields.length > 0) return model.fields.map((f) => f.name);
  const keys = new Set<string>();
  for (const r of records) for (const k of Object.keys(parsePayload(r.payload))) keys.add(k);
  return [...keys];
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize records to CSV. Always includes title, externalId, createdAt + payload columns. */
export function recordsToCsv(records: ExportableRecord[], model?: DataModel | null): string {
  const cols = resolveColumns(records, model);
  const header = ['title', 'externalId', 'createdAt', ...cols];
  const lines = [header.map(csvCell).join(',')];
  for (const r of records) {
    const payload = parsePayload(r.payload);
    const row = [r.title ?? '', r.externalId ?? '', r.createdAt, ...cols.map((c) => payload[c])];
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\r\n');
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** A self-contained, print-optimized HTML document (browser print → PDF). */
export function recordsToPrintHtml(
  opts: { title: string; subtitle?: string; records: ExportableRecord[]; model?: DataModel | null },
): string {
  const cols = resolveColumns(opts.records, opts.model);
  const headCells = ['Title', 'External ID', 'Created', ...cols].map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const bodyRows = opts.records
    .map((r) => {
      const payload = parsePayload(r.payload);
      const cells = [r.title, r.externalId, r.createdAt, ...cols.map((c) => payload[c])]
        .map((v) => `<td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  // Print styling aligned with DESIGN.md (IBM Plex Mono for tabular data; #1F3A5F headers).
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Instrument Sans', system-ui, sans-serif; color: #111827; margin: 32px; }
  h1 { font-size: 20px; color: #1F3A5F; margin: 0 0 4px; }
  p.sub { color: #6B7280; margin: 0 0 16px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
  th, td { border: 1px solid #DCE3EC; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #F6F8FB; color: #1F3A5F; }
  @media print { body { margin: 0; } button { display: none; } }
</style></head><body>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
  <button onclick="window.print()">Print / Save as PDF</button>
  <table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows || '<tr><td colspan="99">No records.</td></tr>'}</tbody></table>
</body></html>`;
}
