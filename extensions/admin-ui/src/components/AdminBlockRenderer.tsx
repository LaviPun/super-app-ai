/**
 * Renders a generic admin block/action from the SuperApp module config.
 *
 * The config is DECLARATIVE and comes straight from the persisted metaobject
 * (`$app:superapp_admin_block` / `$app:superapp_admin_action`, written by the
 * publish pipeline). This renderer maps the shared admin-content vocab — description,
 * fields, badges, table, buttons, links — onto Polaris `s-*` web components (2026-04),
 * then falls back to a dynamic key/value dump for any additional config keys so nothing
 * is silently dropped. No per-module code: one generic renderer for every admin module.
 */
import type { AdminBlockConfig } from '../hooks/useAdminBlocks';

type Props = { block: AdminBlockConfig };

/** Tones understood by the config vocab, mapped 1:1 onto Polaris tones. */
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'critical';

type Field = { label: string; value: string; tone?: Tone };
type BadgeItem = { label: string; tone?: Tone };
type TableSpec = { columns: string[]; rows: string[][] };
type ButtonItem = { label: string; url?: string; tone?: 'default' | 'critical' };
type LinkItem = { label: string; url: string };

/** The presentational keys the vocab renders explicitly (everything else is dumped). */
const KNOWN_KEYS = new Set(['target', 'label', 'title', 'shouldRender', 'description', 'fields', 'badges', 'table', 'buttons', 'links']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asFields(v: unknown): Field[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((f) => ({ label: String(f.label ?? ''), value: String(f.value ?? ''), tone: f.tone as Tone | undefined }))
    .filter((f) => f.label !== '');
}

function asBadges(v: unknown): BadgeItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((b) => ({ label: String(b.label ?? ''), tone: b.tone as Tone | undefined }))
    .filter((b) => b.label !== '');
}

function asTable(v: unknown): TableSpec | null {
  if (!isRecord(v) || !Array.isArray(v.columns) || v.columns.length === 0) return null;
  const columns = v.columns.map(String);
  const rows = Array.isArray(v.rows) ? v.rows.filter(Array.isArray).map((r) => (r as unknown[]).map(String)) : [];
  return { columns, rows };
}

function asButtons(v: unknown): ButtonItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((b) => ({ label: String(b.label ?? ''), url: b.url ? String(b.url) : undefined, tone: b.tone as ButtonItem['tone'] }))
    .filter((b) => b.label !== '');
}

function asLinks(v: unknown): LinkItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((l) => ({ label: String(l.label ?? ''), url: String(l.url ?? '') }))
    .filter((l) => l.label !== '' && l.url !== '');
}

/** Dynamic fallback for any config key not covered by the explicit vocab. */
function renderUnknownField(key: string, value: unknown): preact.JSX.Element | null {
  if (value == null) return null;
  const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

  if (typeof value === 'boolean') {
    return (
      <s-stack direction="inline" gap="small">
        <s-text type="strong">{label}:</s-text>
        <s-badge tone={value ? 'success' : 'critical'}>{value ? 'Yes' : 'No'}</s-badge>
      </s-stack>
    );
  }

  if (typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('href'))) {
    return (
      <s-stack direction="inline" gap="small">
        <s-text type="strong">{label}:</s-text>
        <s-link href={value}>{value}</s-link>
      </s-stack>
    );
  }

  if (Array.isArray(value)) {
    return (
      <s-stack gap="small">
        <s-text type="strong">{label}:</s-text>
        {value.map((item, i) => (
          <s-text key={i}>• {typeof item === 'object' ? JSON.stringify(item) : String(item)}</s-text>
        ))}
      </s-stack>
    );
  }

  if (typeof value === 'object') {
    return (
      <s-stack gap="small">
        <s-text type="strong">{label}:</s-text>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <s-text key={k}>  {k}: {v == null ? '—' : String(v)}</s-text>
        ))}
      </s-stack>
    );
  }

  return (
    <s-stack direction="inline" gap="small">
      <s-text type="strong">{label}:</s-text>
      <s-text>{String(value)}</s-text>
    </s-stack>
  );
}

export function AdminBlockRenderer({ block }: Props) {
  const config = block.config;
  const description = typeof config.description === 'string' ? config.description : '';
  const fields = asFields(config.fields);
  const badges = asBadges(config.badges);
  const table = asTable(config.table);
  const buttons = asButtons(config.buttons);
  const links = asLinks(config.links);

  const unknownEntries = Object.entries(config).filter(([k, v]) => !KNOWN_KEYS.has(k) && v != null);

  const hasStructured =
    description !== '' || fields.length > 0 || badges.length > 0 || !!table || buttons.length > 0 || links.length > 0;

  return (
    <s-stack gap="base">
      <s-text type="strong">{block.label || block.name}</s-text>
      <s-divider />

      {description !== '' && <s-text>{description}</s-text>}

      {badges.length > 0 && (
        <s-stack direction="inline" gap="small">
          {badges.map((b, i) => (
            <s-badge key={i} tone={b.tone ?? 'neutral'}>{b.label}</s-badge>
          ))}
        </s-stack>
      )}

      {fields.map((f, i) => (
        <s-stack key={`f${i}`} direction="inline" gap="small">
          <s-text type="strong">{f.label}:</s-text>
          {f.tone ? <s-badge tone={f.tone}>{f.value}</s-badge> : <s-text>{f.value}</s-text>}
        </s-stack>
      ))}

      {table && (
        <s-table>
          <s-table-header-row>
            {table.columns.map((c, i) => (
              <s-table-header key={i}>{c}</s-table-header>
            ))}
          </s-table-header-row>
          <s-table-body>
            {table.rows.map((row, ri) => (
              <s-table-row key={ri}>
                {row.map((cell, ci) => (
                  <s-table-cell key={ci}>{cell}</s-table-cell>
                ))}
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      )}

      {links.length > 0 && (
        <s-stack gap="small">
          {links.map((l, i) => (
            <s-link key={i} href={l.url}>{l.label}</s-link>
          ))}
        </s-stack>
      )}

      {buttons.length > 0 && (
        <s-stack direction="inline" gap="small">
          {buttons.map((b, i) =>
            b.url ? (
              <s-button key={i} href={b.url} tone={b.tone === 'critical' ? 'critical' : 'auto'}>{b.label}</s-button>
            ) : (
              <s-button key={i} tone={b.tone === 'critical' ? 'critical' : 'auto'}>{b.label}</s-button>
            ),
          )}
        </s-stack>
      )}

      {unknownEntries.map(([key, value]) => renderUnknownField(key, value))}

      {!hasStructured && unknownEntries.length === 0 && (
        <s-text color="subdued">No additional configuration to display.</s-text>
      )}
    </s-stack>
  );
}
