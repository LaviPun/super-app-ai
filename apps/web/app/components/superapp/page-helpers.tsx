import React from 'react';
import { Icon } from './icons';
import { Input, Select } from './ui';

const { useState: uS } = React;

/* eslint-disable @typescript-eslint/no-explicit-any */

export function PageHead({ title, sub, badge, actions, back, crumbs }: any) {
  return React.createElement(
    'div',
    null,
    crumbs &&
      React.createElement(
        'div',
        { className: 'crumbs' },
        crumbs.map((c: any, i: number) =>
          React.createElement(
            React.Fragment,
            { key: i },
            i > 0 && React.createElement(Icon, { name: 'chevronRight', size: 12 }),
            c.href ? React.createElement('a', { href: c.href }, c.label) : React.createElement('span', null, c.label),
          ),
        ),
      ),
    back && React.createElement('a', { href: back.href, className: 'page-back' }, React.createElement(Icon, { name: 'arrowLeft', size: 15 }), back.label),
    React.createElement(
      'div',
      { className: 'page-head' },
      React.createElement(
        'div',
        { className: 'grow' },
        React.createElement('div', { className: 'page-title-row' }, React.createElement('h1', { className: 't-h1' }, title), badge),
        sub && React.createElement('div', { className: 'page-sub' }, sub),
      ),
      actions && React.createElement('div', { className: 'page-actions' }, actions),
    ),
  );
}

// generic filter bar: search + selects
export function FilterBar({ search, onSearch, placeholder, filters, right, results }: any) {
  return React.createElement(
    'div',
    { className: 'filter-bar' },
    React.createElement(
      'div',
      { className: 'filter-search' },
      React.createElement(Input, { icon: 'search', placeholder: placeholder || 'Search…', value: search, onChange: (e: any) => onSearch(e.target.value) }),
    ),
    (filters || []).map((f: any, i: number) =>
      React.createElement('div', { key: i, style: { minWidth: 150 } }, React.createElement(Select, { options: f.options, value: f.value, onChange: (e: any) => f.onChange(e.target.value) })),
    ),
    React.createElement('div', { className: 'grow' }),
    results != null && React.createElement('span', { className: 't-sm t-muted t-num' }, results, ' results'),
    right,
  );
}

export function StatTile({ label, value, delta, deltaDir, icon, tone = 'info', href, sub }: any) {
  const inner = React.createElement(
    'div',
    { className: 'card card-pad', style: { cursor: href ? 'pointer' : 'default', height: '100%' } },
    React.createElement(
      'div',
      { className: 'row spread', style: { marginBottom: 12 } },
      React.createElement('span', { className: 'tile-ico', style: { background: 'var(--p-' + tone + '-bg)', color: 'var(--p-' + tone + ')' } }, React.createElement(Icon, { name: icon, size: 19 })),
      delta && React.createElement('span', { className: 'metric-delta ' + (deltaDir || 'up') }, React.createElement(Icon, { name: deltaDir === 'down' ? 'chevronDown' : 'chevronUp', size: 13 }), delta),
    ),
    React.createElement('div', { className: 'metric-val', style: { fontSize: 26 } }, value),
    React.createElement('div', { className: 'metric-label', style: { marginTop: 3 } }, label),
    sub && React.createElement('div', { className: 't-xs t-muted', style: { marginTop: 5 } }, sub),
  );
  return href ? React.createElement('a', { href, style: { textDecoration: 'none', color: 'inherit', display: 'block' } }, inner) : inner;
}

// simple sparkline / bar mini chart
export function MiniBars({ data, color = 'var(--sa-primary)', height = 44 }: any) {
  const max = Math.max(...data, 1);
  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'flex-end', gap: 3, height } },
    data.map((v: number, i: number) =>
      React.createElement('div', { key: i, style: { flex: 1, height: Math.max(2, (v / max) * height) + 'px', background: color, borderRadius: 2, opacity: 0.35 + 0.65 * (v / max) } }),
    ),
  );
}

export function Sparkline({ data, color = 'var(--sa-secondary)', w = 220, h = 48 }: any) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts: Array<[number, number]> = data.map((v: number, i: number) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
    return [x, y] as [number, number];
  });
  const d = 'M ' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L ');
  const area = d + ` L ${w},${h} L 0,${h} Z`;
  return React.createElement(
    'svg',
    { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, preserveAspectRatio: 'none' },
    React.createElement(
      'defs',
      null,
      React.createElement(
        'linearGradient',
        { id: 'spark', x1: 0, y1: 0, x2: 0, y2: 1 },
        React.createElement('stop', { offset: '0%', stopColor: color, stopOpacity: 0.22 }),
        React.createElement('stop', { offset: '100%', stopColor: color, stopOpacity: 0 }),
      ),
    ),
    React.createElement('path', { d: area, fill: 'url(#spark)' }),
    React.createElement('path', { d, fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  );
}

// donut
export function Donut({ segments, size = 120, thickness = 14, center }: any) {
  const total = segments.reduce((a: number, s: any) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return React.createElement(
    'div',
    { style: { position: 'relative', width: size, height: size } },
    React.createElement(
      'svg',
      { width: size, height: size, style: { transform: 'rotate(-90deg)' } },
      segments.map((s: any, i: number) => {
        const len = (s.value / total) * circ;
        const el = React.createElement('circle', {
          key: i, cx: size / 2, cy: size / 2, r, fill: 'none', stroke: s.color, strokeWidth: thickness,
          strokeDasharray: `${len} ${circ - len}`, strokeDashoffset: -offset, strokeLinecap: 'butt',
        });
        offset += len;
        return el;
      }),
    ),
    center && React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }, center),
  );
}

export function useTableState(initialSort?: string) {
  const [search, setSearch] = uS('');
  const [sortCol, setSortCol] = uS<string | null>(initialSort || null);
  const [sortDir, setSortDir] = uS<'asc' | 'desc'>('desc');
  const onSort = (c: string) => {
    if (sortCol === c) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(c); setSortDir('asc'); }
  };
  return { search, setSearch, sortCol, sortDir, onSort };
}

export function fmtCents(c: number) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function fmtNum(n: number | null | undefined) { return n == null ? '—' : n.toLocaleString('en-US'); }
export function fmtQuota(n: number) { return n === -1 ? 'Unlimited' : n.toLocaleString('en-US'); }
export function fmtMs(ms: number | null | undefined) { return ms == null ? '—' : ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'; }

export function MonoChip({ children }: any) {
  return React.createElement(
    'span',
    { className: 't-mono', style: { background: 'var(--p-surface-secondary)', padding: '2px 7px', borderRadius: 5, border: '1px solid var(--p-border)', whiteSpace: 'nowrap' } },
    children,
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return React.createElement('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: ok ? 'var(--p-success)' : 'var(--p-critical)' } });
}
