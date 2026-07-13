import React from 'react';
import { Icon } from './icons';

const { useState: uiState, useRef: uiRef, useEffect: uiEffect } = React;

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ---------- Button ---------- */
export function Btn({ variant, size, icon, iconRight, children, className = '', loading, ...rest }: any) {
  const cls = ['btn'];
  if (variant) cls.push('btn-' + variant);
  if (size) cls.push('btn-' + size);
  if (!children) cls.push('btn-icon');
  cls.push(className);
  return React.createElement(
    'button',
    { className: cls.join(' '), ...rest },
    loading
      ? React.createElement('span', { className: 'spinner', style: { width: 14, height: 14, borderTopColor: 'currentColor' } })
      : icon && React.createElement(Icon, { name: icon, size: 16 }),
    children != null && React.createElement('span', null, children),
    iconRight && React.createElement(Icon, { name: iconRight, size: 16 }),
  );
}

/* ---------- Badge ---------- */
export function Badge({ tone, dot, children }: any) {
  return React.createElement(
    'span',
    { className: 'badge' + (tone ? ' badge-' + tone : '') },
    dot && React.createElement('span', { className: 'dot' }),
    children,
  );
}

// status badge with tone mapping
const STATUS_TONE: Record<string, string | undefined> = {
  PUBLISHED: 'success', ACTIVE: 'success', SUCCESS: 'success', ENABLED: 'success', LIVE: 'success', PASS: 'success', HEALTHY: 'success', CONNECTED: 'success', PAID: 'success',
  DRAFT: 'info', QUEUED: 'info', RUNNING: 'info', PENDING: 'info', INFO: 'info', NEW: 'info',
  FAILED: 'critical', ERROR: 'critical', CANCELLED: 'critical', BLOCKED: 'critical', CRITICAL: 'critical', DOWN: 'critical', EXPIRED: 'critical',
  WARN: 'warning', WARNING: 'warning', TRIAL: 'warning', DEGRADED: 'warning', SKIPPED: 'warning', ARCHIVED: 'warning',
  DISABLED: undefined, INACTIVE: undefined, OFFLINE: undefined,
};

export function StatusBadge({ value }: { value: any }) {
  const key = String(value || '').toUpperCase();
  const tone = STATUS_TONE[key];
  return React.createElement(
    'span',
    { className: 'badge' + (tone ? ' badge-' + tone : '') },
    React.createElement('span', { className: 'dot' }),
    titleCase(value),
  );
}

export function titleCase(s: any) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Ai|Api|Sso|Dlq|Id|Url|Html|Json|Gdpr)\b/gi, (m) => m.toUpperCase());
}

/* ---------- Card ---------- */
export function Card({ children, className = '', pad, ...rest }: any) {
  return React.createElement('div', { className: 'card ' + (pad ? 'card-pad ' : '') + className, ...rest }, children);
}
export function CardHead({ title, sub, actions, children }: any) {
  return React.createElement(
    'div',
    { className: 'card-head' },
    React.createElement(
      'div',
      { className: 'stack', style: { gap: 2 } },
      React.createElement('div', { className: 't-h3' }, title),
      sub && React.createElement('div', { className: 't-xs t-muted' }, sub),
    ),
    actions || children,
  );
}
export function Section({ children, className = '' }: any) {
  return React.createElement('div', { className: 'card-sec ' + className }, children);
}

/* ---------- Fields ---------- */
export function Field({ label, optional, help, error, children, action }: any) {
  return React.createElement(
    'div',
    { className: 'field' },
    label &&
      React.createElement(
        'div',
        { className: 'row spread' },
        React.createElement('label', { className: 'field-label' }, label, optional && React.createElement('span', { className: 'opt' }, '  (optional)')),
        action,
      ),
    children,
    error
      ? React.createElement('div', { className: 'field-error' }, React.createElement(Icon, { name: 'alert', size: 13 }), error)
      : help && React.createElement('div', { className: 'field-help' }, help),
  );
}
export function Input({ icon, mono, ...rest }: any) {
  const input = React.createElement('input', { className: 'input' + (mono ? ' input-mono' : ''), ...rest });
  if (!icon) return input;
  return React.createElement(
    'div',
    { className: 'input-prefix' },
    React.createElement('span', { className: 'ip-icon' }, React.createElement(Icon, { name: icon, size: 16 })),
    React.createElement('input', { className: 'input' + (mono ? ' input-mono' : ''), ...rest }),
  );
}
export function Textarea({ mono, ...rest }: any) {
  return React.createElement('textarea', { className: 'textarea' + (mono ? ' input-mono' : ''), ...rest });
}
export function Select({ options, value, onChange, ...rest }: any) {
  return React.createElement(
    'div',
    { className: 'select' },
    React.createElement(
      'select',
      { value, onChange, ...rest },
      options.map((o: any) => {
        const val = typeof o === 'string' ? o : o.value;
        const lab = typeof o === 'string' ? o : o.label;
        return React.createElement('option', { key: val, value: val }, lab);
      }),
    ),
  );
}
export function Toggle({ checked, onChange, ...rest }: any) {
  const inputProps: any = { type: 'checkbox', onChange, ...rest };
  if (checked !== undefined) inputProps.checked = !!checked;
  return React.createElement(
    'label',
    { className: 'toggle' },
    React.createElement('input', inputProps),
    React.createElement('span', { className: 'track' }),
    React.createElement('span', { className: 'knob' }),
  );
}
export function Checkbox({ label, checked, onChange, sub, ...rest }: any) {
  return React.createElement(
    'label',
    { className: 'checkbox' },
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange, ...rest }),
    label &&
      React.createElement(
        'span',
        { className: 'stack', style: { gap: 1 } },
        React.createElement('span', null, label),
        sub && React.createElement('span', { className: 't-xs t-muted' }, sub),
      ),
  );
}

/* ---------- Tabs ---------- */
export function Tabs({ tabs, active, onChange }: any) {
  return React.createElement(
    'div',
    { className: 'tabs row', style: { gap: 2, borderBottom: '1px solid var(--p-border)', padding: '0 4px' } },
    tabs.map((t: any) => {
      const id = typeof t === 'string' ? t : t.id;
      const label = typeof t === 'string' ? t : t.label;
      const badge = typeof t === 'object' ? t.badge : null;
      const sel = id === active;
      return React.createElement(
        'button',
        {
          key: id,
          onClick: () => onChange(id),
          style: {
            border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontWeight: 550,
            fontSize: 13.5, padding: '11px 12px', color: sel ? 'var(--p-text)' : 'var(--p-text-secondary)',
            borderBottom: '2px solid ' + (sel ? 'var(--sa-primary)' : 'transparent'), marginBottom: -1,
            display: 'inline-flex', alignItems: 'center', gap: 7,
          },
        },
        label,
        badge != null && React.createElement('span', { className: 'badge', style: { height: 18 } }, badge),
      );
    }),
  );
}

/* ---------- Banner ---------- */
export function Banner({ tone = 'info', title, children, onDismiss, action }: any) {
  const icon = ({ info: 'info', success: 'check', warning: 'alert', critical: 'alert' } as any)[tone];
  return React.createElement(
    'div',
    { className: 'banner banner-' + tone },
    React.createElement('span', { className: 'banner-icon' }, React.createElement(Icon, { name: icon, size: 18 })),
    React.createElement(
      'div',
      { className: 'grow stack', style: { gap: 3 } },
      title && React.createElement('div', { className: 'banner-title' }, title),
      children && React.createElement('div', { className: 't-sm' }, children),
      action && React.createElement('div', { style: { marginTop: 4 } }, action),
    ),
    onDismiss &&
      React.createElement(
        'button',
        { onClick: onDismiss, className: 'btn-plain btn-plain-subdued', style: { border: 0, background: 'none', cursor: 'pointer', padding: 2 } },
        React.createElement(Icon, { name: 'x', size: 16 }),
      ),
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon = 'layers', title, children, action }: any) {
  return React.createElement(
    'div',
    { className: 'empty' },
    React.createElement('div', { className: 'empty-illu' }, React.createElement(Icon, { name: icon, size: 36 })),
    React.createElement('div', { className: 't-h2', style: { marginBottom: 6 } }, title),
    children && React.createElement('div', { className: 't-sm t-muted', style: { marginBottom: 18 } }, children),
    action,
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, src, size = 28, square, color }: any) {
  const initials = String(name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  return React.createElement(
    'span',
    { className: 'avatar' + (square ? ' avatar-sq' : ''), style: { width: size, height: size, fontSize: size * 0.4, background: color } },
    src ? React.createElement('img', { src, alt: name }) : initials,
  );
}

/* ---------- Progress / Metric ---------- */
export function Progress({ value, tone }: any) {
  return React.createElement(
    'div',
    { className: 'progress' + (tone ? ' ' + tone : '') },
    React.createElement('i', { style: { width: Math.max(0, Math.min(100, value)) + '%' } }),
  );
}
export function Metric({ label, value, delta, deltaDir, icon, sub }: any) {
  return React.createElement(
    'div',
    { className: 'metric' },
    React.createElement('div', { className: 'metric-label' }, label),
    React.createElement(
      'div',
      { className: 'row-2', style: { alignItems: 'baseline' } },
      React.createElement('div', { className: 'metric-val' }, value),
      delta &&
        React.createElement(
          'span',
          { className: 'metric-delta ' + (deltaDir || 'up') },
          React.createElement(Icon, { name: deltaDir === 'down' ? 'chevronDown' : 'chevronUp', size: 13 }),
          delta,
        ),
    ),
    sub && React.createElement('div', { className: 't-xs t-muted' }, sub),
  );
}

/* ---------- KV ---------- */
export function KV({ rows }: any) {
  return React.createElement(
    'dl',
    { className: 'kv' },
    rows.filter(Boolean).map((r: any, i: number) =>
      React.createElement(React.Fragment, { key: i }, React.createElement('dt', null, r[0]), React.createElement('dd', null, r[1])),
    ),
  );
}

/* ---------- Tooltip ---------- */
export function Tooltip({ content, children }: any) {
  return React.createElement('span', { className: 'tip' }, children, React.createElement('span', { className: 'tip-bub' }, content));
}

/* ---------- Popover menu ---------- */
export function Menu({ trigger, items, align = 'right' }: any) {
  const [open, setOpen] = uiState(false);
  const ref = uiRef<HTMLDivElement>(null);
  uiEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return React.createElement(
    'div',
    { ref, style: { position: 'relative', display: 'inline-flex' } },
    React.cloneElement(trigger, { onClick: (e: any) => { e.stopPropagation(); setOpen((o) => !o); } }),
    open &&
      React.createElement(
        'div',
        {
          style: {
            position: 'absolute', top: 'calc(100% + 4px)', [align]: 0, zIndex: 50, minWidth: 180,
            background: 'var(--p-surface)', borderRadius: 'var(--p-r-md)', boxShadow: 'var(--p-shadow-500)',
            border: '1px solid var(--p-border)', padding: 4,
          },
        },
        items.filter(Boolean).map((it: any, i: number) =>
          it.divider
            ? React.createElement('div', { key: i, className: 'divider', style: { margin: '4px 0' } })
            : React.createElement(
                'button',
                {
                  key: i,
                  onClick: (e: any) => { e.stopPropagation(); setOpen(false); it.onClick && it.onClick(); },
                  style: {
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                    border: 0, background: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 6,
                    font: 'inherit', fontSize: 13.5, color: it.tone === 'critical' ? 'var(--p-critical)' : 'var(--p-text)',
                  },
                  onMouseEnter: (e: any) => (e.currentTarget.style.background = 'var(--p-surface-hover)'),
                  onMouseLeave: (e: any) => (e.currentTarget.style.background = 'none'),
                },
                it.icon && React.createElement(Icon, { name: it.icon, size: 16 }),
                it.label,
              ),
        ),
      ),
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, children, onClose, footer, size = 'md', sub }: any) {
  uiEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);
  const widths: Record<string, number> = { sm: 440, md: 560, lg: 760, xl: 920 };
  return React.createElement(
    'div',
    {
      className: 'modal-overlay',
      style: { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,33,58,.42)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 20px 40px', overflowY: 'auto' },
      onMouseDown: (e: any) => { if (e.target === e.currentTarget) onClose(); },
    },
    React.createElement(
      'div',
      { style: { width: '100%', maxWidth: widths[size], background: 'var(--p-surface)', borderRadius: 'var(--p-r-lg)', boxShadow: 'var(--p-shadow-500)', animation: 'modalIn .16s ease-out' } },
      React.createElement(
        'div',
        { className: 'row spread', style: { padding: '16px 20px', borderBottom: '1px solid var(--p-border)' } },
        React.createElement(
          'div',
          { className: 'stack', style: { gap: 2 } },
          React.createElement('div', { className: 't-h2' }, title),
          sub && React.createElement('div', { className: 't-xs t-muted' }, sub),
        ),
        React.createElement(
          'button',
          { onClick: onClose, style: { border: 0, background: 'none', cursor: 'pointer', padding: 4, color: 'var(--p-icon)' } },
          React.createElement(Icon, { name: 'x', size: 18 }),
        ),
      ),
      React.createElement('div', { style: { padding: 20, maxHeight: '64vh', overflowY: 'auto' } }, children),
      footer && React.createElement('div', { className: 'row spread', style: { padding: '14px 20px', borderTop: '1px solid var(--p-border)', gap: 10 } }, footer),
    ),
  );
}

/* ---------- DataTable ---------- */
export function DataTable({ columns, rows, onRowClick, selectable, selected, onSelectChange, sortCol, sortDir, onSort, rowKey }: any) {
  const allSel = selectable && rows.length > 0 && selected && selected.size === rows.length;
  return React.createElement(
    'div',
    { className: 'table-wrap' },
    React.createElement(
      'table',
      { className: 'dt' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          selectable &&
            React.createElement(
              'th',
              { className: 'dt-check' },
              React.createElement('input', { type: 'checkbox', checked: !!allSel, onChange: (e: any) => onSelectChange(e.target.checked ? 'all' : 'none') }),
            ),
          columns.map((c: any) =>
            React.createElement(
              'th',
              {
                key: c.key,
                className: (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : ''),
                style: c.width ? { width: c.width } : undefined,
                onClick: c.sortable ? () => onSort(c.key) : undefined,
              },
              c.label,
              c.sortable && sortCol === c.key && React.createElement('span', { className: 'dt-sort-ind' }, sortDir === 'asc' ? '▲' : '▼'),
            ),
          ),
        ),
      ),
      React.createElement(
        'tbody',
        null,
        rows.map((r: any, ri: number) => {
          const k = rowKey ? r[rowKey] : ri;
          return React.createElement(
            'tr',
            {
              key: k,
              className: onRowClick ? 'clickable' : '',
              onClick: onRowClick ? () => onRowClick(r) : undefined,
              // Keyboard parity for clickable rows: focusable + Enter/Space activate.
              tabIndex: onRowClick ? 0 : undefined,
              onKeyDown: onRowClick
                ? (e: any) => {
                    // Ignore keydowns bubbling up from inner interactive elements.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(r);
                    }
                  }
                : undefined,
            },
            selectable &&
              React.createElement(
                'td',
                { className: 'dt-check', onClick: (e: any) => e.stopPropagation() },
                React.createElement('input', { type: 'checkbox', checked: selected ? selected.has(k) : false, onChange: () => onSelectChange(k) }),
              ),
            columns.map((c: any) => React.createElement('td', { key: c.key, className: c.num ? 'num' : '' }, c.render ? c.render(r) : r[c.key])),
          );
        }),
      ),
    ),
  );
}

/* ---------- Confirm dialog ---------- */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'primary', icon = 'alert', onConfirm, onClose }: any) {
  return React.createElement(
    Modal,
    {
      title,
      size: 'sm',
      onClose,
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement('span', { className: 'grow' }),
        React.createElement(Btn, { onClick: onClose }, 'Cancel'),
        React.createElement(Btn, { variant: tone, onClick: () => { onClose(); onConfirm && onConfirm(); } }, confirmLabel),
      ),
    },
    React.createElement(
      'div',
      { className: 'row-3', style: { alignItems: 'flex-start' } },
      React.createElement(
        'span',
        { className: 'tile-ico', style: { background: 'var(--p-' + (tone === 'critical' ? 'critical' : 'info') + '-bg)', color: 'var(--p-' + (tone === 'critical' ? 'critical' : 'info') + ')' } },
        React.createElement(Icon, { name: icon, size: 18 }),
      ),
      React.createElement('div', { className: 't-sm', style: { lineHeight: 1.5, paddingTop: 2 } }, message),
    ),
  );
}

/* ---------- Toast ---------- */
export function Toast({ toast }: any) {
  if (!toast) return null;
  return React.createElement(
    'div',
    {
      style: { position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: toast.error ? 'var(--p-critical-text)' : '#14213A', color: '#fff', padding: '11px 16px', borderRadius: 10, boxShadow: 'var(--p-shadow-500)', fontSize: 13.5, fontWeight: 500, animation: 'toastIn .2s ease-out', display: 'flex', alignItems: 'center', gap: 9 },
    },
    React.createElement(Icon, { name: toast.error ? 'alert' : 'check', size: 16 }),
    toast.message,
  );
}
