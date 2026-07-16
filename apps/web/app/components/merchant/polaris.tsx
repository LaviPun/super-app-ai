import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Link, useLocation } from '@remix-run/react';

/**
 * Merchant-surface helpers for the Polaris web-components migration.
 *
 * This module is merchant-only: it must not import from `~/components/superapp`
 * (the vendored system that stays for the internal admin) and must not depend
 * on the vendored `--sa-*` / `--p-*` CSS tokens, which move to the internal
 * layout at the end of the migration. Light-DOM styles live in
 * `app/styles/merchant.css` (`sa-m-*` classes, fixed values).
 */

/* ---------- chart palette (fixed values — decision: one restrained brand accent) ---------- */
export const CHART = {
  primary: '#1F3A5F',
  accent: '#2F80ED',
  success: '#0E9F6E',
  critical: '#DC2626',
  muted: '#8A8A8A',
} as const;

/* ---------- events: React 18 doesn't bind component-specific custom events ---------- */
export function useCustomEvent<T extends HTMLElement>(
  ref: RefObject<T | null>,
  event: string,
  handler: (e: Event) => void,
) {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = (e: Event) => saved.current(e);
    el.addEventListener(event, listener);
    return () => el.removeEventListener(event, listener);
  }, [ref, event]);
}

/* ---------- status → badge tone ---------- */
export type WcTone = 'neutral' | 'info' | 'success' | 'caution' | 'warning' | 'critical';

const STATUS_TONE: Record<string, WcTone | undefined> = {
  PUBLISHED: 'success', ACTIVE: 'success', SUCCESS: 'success', ENABLED: 'success', LIVE: 'success', PASS: 'success', HEALTHY: 'success', CONNECTED: 'success', PAID: 'success', RESOLVED: 'success',
  DRAFT: 'info', QUEUED: 'info', RUNNING: 'info', PENDING: 'info', INFO: 'info', NEW: 'info', OPEN: 'info',
  FAILED: 'critical', ERROR: 'critical', CANCELLED: 'critical', BLOCKED: 'critical', CRITICAL: 'critical', DOWN: 'critical', EXPIRED: 'critical',
  WARN: 'warning', WARNING: 'warning', TRIAL: 'warning', DEGRADED: 'warning', SKIPPED: 'warning', ARCHIVED: 'warning', ESCALATED: 'warning',
  DISABLED: 'neutral', INACTIVE: 'neutral', OFFLINE: 'neutral',
};

export function toneForStatus(status: string): WcTone {
  return STATUS_TONE[status.toUpperCase()] ?? 'neutral';
}

export function StatusBadge({ status, label }: { status: string; label?: ReactNode }) {
  return <s-badge tone={toneForStatus(status)}>{label ?? titleCase(status)}</s-badge>;
}

/* ---------- formatting (copied from the vendored system to cut the import edge) ---------- */
export function titleCase(s: string) {
  return s.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
export function fmtCents(c: number) {
  return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtNum(n: number | null | undefined) {
  return n == null ? '—' : n.toLocaleString('en-US');
}
export function fmtQuota(n: number) {
  return n === -1 ? 'Unlimited' : n.toLocaleString('en-US');
}
export function fmtMs(ms: number | null | undefined) {
  return ms == null ? '—' : ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
}

export function exportCSV(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows
    .map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','))
    .join('\n');
  // UTF-8 BOM so Excel opens non-ASCII content correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function useTableState(initialSort?: string) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(initialSort || null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const onSort = (c: string) => {
    if (sortCol === c) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(c); setSortDir('asc'); }
  };
  return { search, setSearch, sortCol, sortDir, onSort };
}

/* ---------- sub-navigation (Build / Insights) ---------- */
const BUILD_TABS = [
  { url: '/modules', label: 'Modules' },
  { url: '/flows', label: 'Flows' },
  { url: '/connectors', label: 'Connectors' },
  { url: '/data', label: 'Data' },
  { url: '/templates', label: 'Templates' },
];
const INSIGHTS_TABS = [
  { url: '/analytics', label: 'Analytics' },
  { url: '/activity', label: 'Activity' },
];
const BUILD_PATHS = ['/modules', '/flows', '/connectors', '/data', '/templates', '/generate'];
const INSIGHTS_PATHS = ['/analytics', '/activity'];

function matchPath(target: string, path: string) {
  return path === target || path.startsWith(target + '/');
}

/** Admin-native underline tab row for the Build/Insights sections. Hidden on /generate. */
export function SubnavTabs() {
  const { pathname: path } = useLocation();
  const buildActive = BUILD_PATHS.some((p) => matchPath(p, path));
  const insightsActive = INSIGHTS_PATHS.some((p) => matchPath(p, path));
  const onGenerate = matchPath('/generate', path);
  const tabs = buildActive && !onGenerate ? BUILD_TABS : insightsActive ? INSIGHTS_TABS : null;
  if (!tabs) return null;
  return (
    <nav className="sa-m-subnav" aria-label="Section">
      <div className="sa-m-subnav-inner">
        {tabs.map((t) => (
          <Link
            key={t.url}
            to={t.url}
            className={'sa-m-tab' + (matchPath(t.url, path) ? ' sel' : '')}
            aria-current={matchPath(t.url, path) ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/* ---------- in-page tabs (settings, detail pages) ---------- */
export interface TabDef { id: string; label: ReactNode }
export function Tabs({ tabs, value, onChange }: { tabs: TabDef[]; value: string; onChange: (id: string) => void }) {
  // Roving tabindex + arrow-key navigation per the WAI-ARIA tabs pattern.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === -1) return;
    e.preventDefault();
    const nextTab = tabs[next];
    if (!nextTab) return;
    onChange(nextTab.id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
  };
  return (
    <div className="sa-m-tabs" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={'sa-m-tab' + (t.id === value ? ' sel' : '')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- confirm modal (s-modal wrapper, ref-driven) ---------- */
export interface ConfirmModalProps {
  open: boolean;
  heading: string;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: 'critical' | 'neutral';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}
export function ConfirmModal({ open, heading, children, confirmLabel = 'Confirm', tone, loading, onConfirm, onClose }: ConfirmModalProps) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current as (HTMLElement & { show?: () => void; hide?: () => void }) | null;
    if (!el) return;
    if (open) el.show?.();
    else el.hide?.();
  }, [open]);
  useCustomEvent(ref, 'afterhide', () => { if (open) onClose(); });
  if (!open) return null;
  return (
    <s-modal ref={ref as never} heading={heading}>
      {children}
      <s-button
        slot="primary-action"
        variant="primary"
        tone={tone === 'critical' ? 'critical' : undefined}
        loading={loading || undefined}
        onClick={onConfirm}
      >
        {confirmLabel}
      </s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

/* ---------- empty state ---------- */
export function EmptyState({ icon, heading, children, action }: { icon?: string; heading: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <s-stack alignItems="center" gap="base" padding="large-100">
      {icon && <s-icon type={icon as never} size="base" tone="neutral" />}
      <s-heading>{heading}</s-heading>
      {children && <s-text tone="neutral">{children}</s-text>}
      {action}
    </s-stack>
  );
}

/* ---------- compact KPI tile (dense: label, value, delta and sparkline in one tile) ---------- */
export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  /** true direction of change (arrow) */
  deltaDir?: 'up' | 'down';
  /** whether the change is good/bad — diverges from deltaDir for cost/error metrics */
  deltaTone?: 'up' | 'down';
  sub?: ReactNode;
  /** inline mini chart data — rendered compactly inside the tile */
  trend?: number[];
  trendColor?: string;
  href?: string;
}
export function StatTile({ label, value, delta, deltaDir, deltaTone, sub, trend, trendColor, href }: StatTileProps) {
  const good = (deltaTone || deltaDir) !== 'down';
  const body = (
    <div className="sa-m-stat">
      <div className="sa-m-stat-top">
        <span className="sa-m-stat-label">{label}</span>
        {delta != null && (
          <span
            className={'sa-m-stat-delta ' + (good ? 'good' : 'bad')}
            role="img"
            aria-label={`${deltaDir === 'down' ? 'Down' : 'Up'} ${typeof delta === 'string' || typeof delta === 'number' ? delta : ''} — ${good ? 'improving' : 'worsening'}`}
          >
            {deltaDir === 'down' ? '▾' : '▴'} {delta}
          </span>
        )}
      </div>
      <div className="sa-m-stat-row">
        <span className="sa-m-stat-value">{value}</span>
        {trend && trend.length > 1 && (
          <span className="sa-m-stat-trend">
            <Sparkline data={trend} color={trendColor ?? CHART.accent} w={96} h={28} />
          </span>
        )}
      </div>
      {sub && <div className="sa-m-stat-sub">{sub}</div>}
    </div>
  );
  return href ? <Link to={href} className="sa-m-stat-link">{body}</Link> : body;
}

/* ---------- key/value list ---------- */
export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <div className="sa-m-kv">
      {rows.map(([k, v], i) => (
        <div className="sa-m-kv-row" key={i}>
          <span className="sa-m-kv-k">{k}</span>
          <span className="sa-m-kv-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- progress bar (no Polaris WC equivalent) ---------- */
export function Progress({ value, max = 100, tone }: { value: number; max?: number; tone?: 'critical' | 'warning' }) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div className="sa-m-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="sa-m-progress-fill"
        style={{ transform: `scaleX(${pct / 100})`, background: tone === 'critical' ? CHART.critical : tone === 'warning' ? '#D97706' : CHART.accent }}
      />
    </div>
  );
}

/* ---------- charts (Polaris WC ships none — plain SVG, fixed colors) ---------- */
export function MiniBars({ data, color = CHART.accent, height = 36 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{ flex: 1, height: Math.max(2, (v / max) * height) + 'px', background: color, borderRadius: 1, opacity: 0.35 + 0.65 * (v / max) }}
        />
      ))}
    </div>
  );
}

export function Sparkline({ data, color = CHART.accent, w = 220, h = 48 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const gid = useId();
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
    return [x, y] as const;
  });
  const d = 'M ' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L ');
  const area = d + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface DonutSegment { value: number; color: string }
export function Donut({ segments, size = 120, thickness = 14, center }: { segments: DonutSegment[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        {segments.map((s, i) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {center && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {center}
        </div>
      )}
    </div>
  );
}

/* ---------- monospace chip ---------- */
export function MonoChip({ children }: { children?: ReactNode }) {
  return <span className="sa-m-mono-chip">{children}</span>;
}

/* ---------- resource identifier → friendly label ----------
 * Activity/dashboard `resource` strings are raw internal paths that often carry
 * a cuid (e.g. `/support/cmr…`, `module:cmr…`, `job:cmr…`). Show a human label
 * for the resource kind and drop the opaque id; return null for empty/`—` so the
 * caller can omit the line entirely. */
const RESOURCE_LABELS: Array<[RegExp, string]> = [
  [/^\/?support(\/|:|$)/i, 'Support ticket'],
  [/^module(\/|:|$)/i, 'Module'],
  [/^\/?modules(\/|$)/i, 'Module'],
  [/^job(\/|:|$)/i, 'Job'],
  [/^\/?jobs(\/|$)/i, 'Job'],
  [/^flow(\/|:|$)/i, 'Flow'],
  [/^\/?flows(\/|$)/i, 'Flow'],
  [/^connector(\/|:|$)/i, 'Connector'],
  [/^\/?connectors(\/|$)/i, 'Connector'],
  [/^template(\/|:|$)/i, 'Template'],
  [/^\/?templates(\/|$)/i, 'Template'],
  [/^provider(\/|:|$)/i, 'Provider'],
  [/^endpoint(\/|:|$)/i, 'Endpoint'],
  [/^datastore(\/|:|$)/i, 'Data store'],
];
export function humanizeResource(resource: string | null | undefined): string | null {
  if (resource == null) return null;
  const raw = resource.trim();
  if (!raw || raw === '—') return null;
  for (const [re, label] of RESOURCE_LABELS) {
    if (re.test(raw)) return label;
  }
  // Unknown kind carrying an opaque cuid → nothing friendly to say; omit it.
  // Otherwise the resource is already human (e.g. a route intent) — keep as-is.
  return /c[a-z0-9]{20,}/i.test(raw) ? null : raw;
}
