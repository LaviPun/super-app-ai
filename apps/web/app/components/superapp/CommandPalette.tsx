import React from 'react';
import { useNavigate } from '@remix-run/react';
import { Icon } from './icons';
import { buildSearchIndex } from './placeholder-data';

const { useState: useS, useEffect: useE, useRef: useR, useMemo: useM } = React;

/* eslint-disable @typescript-eslint/no-explicit-any */

// Translate the design's hash routes (#/admin/…, #/app/…) to real Remix paths.
const ADMIN_SPECIAL: Record<string, string> = {
  '#/admin/release': '/internal/release-dashboard',
};
export function superappRoute(hash: string): string {
  if (!hash) return '/';
  if (ADMIN_SPECIAL[hash]) return ADMIN_SPECIAL[hash];
  if (hash === '#/admin') return '/internal';
  if (hash.startsWith('#/admin/')) return '/internal/' + hash.slice('#/admin/'.length);
  if (hash === '#/app') return '/';
  if (hash.startsWith('#/app/')) return '/' + hash.slice('#/app/'.length);
  return hash.replace(/^#/, '');
}

export function CommandPalette({ mode, onClose }: { mode: 'admin' | 'merchant'; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (hash: string) => navigate(superappRoute(hash));
  const [q, setQ] = useS('');
  const [sel, setSel] = useS(0);
  const inputRef = useR<HTMLInputElement>(null);
  const index = useM(() => buildSearchIndex(mode), [mode]);
  useE(() => { inputRef.current && inputRef.current.focus(); }, []);

  const results = useM(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      return index.filter((r: any) => r.type === 'Page').slice(0, 6);
    }
    const scored = index
      .map((r: any) => {
        const hay = (r.title + ' ' + r.sub + ' ' + r.kw + ' ' + r.type).toLowerCase();
        let score = 0;
        if (r.title.toLowerCase().startsWith(term)) score += 10;
        if (r.title.toLowerCase().includes(term)) score += 5;
        if (hay.includes(term)) score += 2;
        return { r, score };
      })
      .filter((x: any) => x.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 12);
    return scored.map((x: any) => x.r);
  }, [q, index]);

  useE(() => { setSel(0); }, [q]);
  useE(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const r = results[sel]; if (r) { go(r.route); onClose(); } }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, sel, onClose]);

  const grouped = useM(() => {
    const g: Record<string, any[]> = {};
    results.forEach((r: any) => { (g[r.type] = g[r.type] || []).push(r); });
    return g;
  }, [results]);

  let flatIdx = -1;
  return React.createElement(
    'div',
    {
      style: { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,33,58,.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 20px' },
      onMouseDown: (e: any) => { if (e.target === e.currentTarget) onClose(); },
    },
    React.createElement(
      'div',
      { className: 'cmdk' },
      React.createElement(
        'div',
        { className: 'cmdk-head' },
        React.createElement(Icon, { name: 'search', size: 18, className: 't-muted' }),
        React.createElement('input', { ref: inputRef, className: 'cmdk-input', placeholder: 'Search across stores, modules, jobs, logs, templates…', value: q, onChange: (e: any) => setQ(e.target.value) }),
        React.createElement('kbd', { className: 'kbd' }, 'Esc'),
      ),
      React.createElement(
        'div',
        { className: 'cmdk-body' },
        results.length === 0 && React.createElement('div', { className: 'cmdk-empty' }, 'No matches for “', q, '”'),
        Object.keys(grouped).map((type) =>
          React.createElement(
            'div',
            { key: type, className: 'cmdk-group' },
            React.createElement('div', { className: 'cmdk-group-title' }, type),
            (grouped[type] || []).map((r: any) => {
              flatIdx++;
              const active = flatIdx === sel;
              const myIdx = flatIdx;
              return React.createElement(
                'button',
                {
                  key: r.route + r.title, className: 'cmdk-item' + (active ? ' active' : ''),
                  onClick: () => { go(r.route); onClose(); },
                  onMouseEnter: () => setSel(myIdx),
                },
                React.createElement('span', { className: 'cmdk-ico' }, React.createElement(Icon, { name: r.icon, size: 16 })),
                React.createElement(
                  'span',
                  { className: 'grow', style: { textAlign: 'left' } },
                  React.createElement('span', { className: 'cmdk-title' }, r.title),
                  React.createElement('span', { className: 'cmdk-sub' }, r.sub),
                ),
                active && React.createElement('span', { className: 't-xs t-muted', style: { display: 'flex', alignItems: 'center', gap: 4 } }, 'Open', React.createElement(Icon, { name: 'arrowRight', size: 13 })),
              );
            }),
          ),
        ),
      ),
      React.createElement(
        'div',
        { className: 'cmdk-foot' },
        React.createElement('span', null, React.createElement('kbd', { className: 'kbd' }, '↑'), React.createElement('kbd', { className: 'kbd' }, '↓'), ' navigate'),
        React.createElement('span', null, React.createElement('kbd', { className: 'kbd' }, '↵'), ' open'),
        React.createElement('span', { className: 'grow' }),
        React.createElement('span', { className: 't-muted' }, results.length + ' results'),
      ),
    ),
  );
}
