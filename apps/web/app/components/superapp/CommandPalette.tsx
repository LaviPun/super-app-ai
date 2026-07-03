import React from 'react';
import { useNavigate } from '@remix-run/react';
import { Icon } from './icons';

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

/* ---------------------------------------------------------------------------
   Command index — static navigation commands only.

   The palette navigates to real routes; it does NOT deep-link to synthesized
   entity IDs. Each entry's `route` is a hash route that superappRoute() maps to
   a real Remix path (mirrors the shell nav in internal.tsx / MerchantSubnav).
   ------------------------------------------------------------------------- */
type Command = { type: string; icon: string; title: string; sub: string; route: string; kw: string };

const ADMIN_COMMANDS: Command[] = [
  { type: 'Overview', icon: 'home', title: 'Dashboard', sub: 'Platform overview', route: '#/admin', kw: 'home overview kpis' },
  { type: 'Operations', icon: 'store', title: 'Stores', sub: 'Installed shops', route: '#/admin/stores', kw: 'shops merchants installs' },
  { type: 'Operations', icon: 'work', title: 'Jobs', sub: 'Background job queue', route: '#/admin/jobs', kw: 'queue dlq background failed' },
  { type: 'Operations', icon: 'live', title: 'Activity Log', sub: 'Recent platform activity', route: '#/admin/activity', kw: 'events audit' },
  { type: 'Operations', icon: 'table', title: 'API Logs', sub: 'Request logs', route: '#/admin/api-logs', kw: 'requests http traces' },
  { type: 'Operations', icon: 'bug', title: 'Error Logs', sub: 'Errors and warnings', route: '#/admin/logs', kw: 'errors warnings exceptions' },
  { type: 'Operations', icon: 'transfer', title: 'Webhooks', sub: 'Shopify webhook events', route: '#/admin/webhooks', kw: 'events shopify topics' },
  { type: 'Operations', icon: 'shield', title: 'Audit Log', sub: 'Admin audit trail', route: '#/admin/audit', kw: 'security actions' },
  { type: 'Platform', icon: 'layers', title: 'Modules', sub: 'Generated modules', route: '#/admin/modules', kw: 'apps widgets recipes' },
  { type: 'Platform', icon: 'flow', title: 'Flows', sub: 'Automation flows', route: '#/admin/flows', kw: 'automation workflow' },
  { type: 'Platform', icon: 'connect', title: 'Connectors', sub: 'External integrations', route: '#/admin/connectors', kw: 'integrations api endpoints' },
  { type: 'Platform', icon: 'database', title: 'Data Stores', sub: 'Custom data', route: '#/admin/data-stores', kw: 'records tables' },
  { type: 'Platform', icon: 'users', title: 'Customers', sub: 'Merchant directory', route: '#/admin/customers', kw: 'merchants users accounts' },
  { type: 'AI & Models', icon: 'connect', title: 'AI Providers', sub: 'Model providers', route: '#/admin/ai-providers', kw: 'openai anthropic azure models' },
  { type: 'AI & Models', icon: 'chat', title: 'AI Assistant', sub: 'Internal copilot', route: '#/admin/ai-assistant', kw: 'copilot chat' },
  { type: 'AI & Models', icon: 'desktop', title: 'Local AI Setting', sub: 'Self-hosted models', route: '#/admin/model-setup', kw: 'ollama local qwen' },
  { type: 'AI & Models', icon: 'chart', title: 'Usage & Costs', sub: 'AI usage and spend', route: '#/admin/usage', kw: 'costs tokens spend billing' },
  { type: 'AI & Models', icon: 'rocket', title: 'Release Gate', sub: 'Deploy controls', route: '#/admin/release', kw: 'deploy publish rollback' },
  { type: 'Catalog', icon: 'plan', title: 'Plan Tiers', sub: 'Billing plans', route: '#/admin/plan-tiers', kw: 'billing pricing limits' },
  { type: 'Catalog', icon: 'categories', title: 'Categories', sub: 'Module categories', route: '#/admin/categories', kw: 'taxonomy' },
  { type: 'Catalog', icon: 'template', title: 'Templates', sub: 'Module templates', route: '#/admin/templates', kw: 'recipes presets' },
  { type: 'Catalog', icon: 'code', title: 'Recipe Edit', sub: 'Edit recipes', route: '#/admin/recipe-edit', kw: 'json spec' },
  { type: 'Settings', icon: 'settings', title: 'Settings', sub: 'Admin settings', route: '#/admin/settings', kw: 'config preferences' },
];

const MERCHANT_COMMANDS: Command[] = [
  { type: 'Navigate', icon: 'home', title: 'Home', sub: 'Dashboard', route: '#/app', kw: 'dashboard overview' },
  { type: 'Navigate', icon: 'layers', title: 'AI Modules', sub: 'Your modules', route: '#/app/modules', kw: 'apps widgets build' },
  { type: 'Navigate', icon: 'flow', title: 'Flows', sub: 'Automations', route: '#/app/flows', kw: 'automation workflow' },
  { type: 'Navigate', icon: 'connect', title: 'Connectors', sub: 'Integrations', route: '#/app/connectors', kw: 'integrations api' },
  { type: 'Navigate', icon: 'database', title: 'Data', sub: 'Data stores', route: '#/app/data', kw: 'records tables' },
  { type: 'Navigate', icon: 'template', title: 'Templates', sub: 'Template gallery', route: '#/app/templates', kw: 'presets recipes' },
  { type: 'Navigate', icon: 'chart', title: 'Analytics', sub: 'Insights', route: '#/app/analytics', kw: 'insights metrics' },
  { type: 'Navigate', icon: 'live', title: 'Activity', sub: 'Recent activity', route: '#/app/activity', kw: 'events' },
  { type: 'Navigate', icon: 'question', title: 'Help & guides', sub: 'Docs and support', route: '#/app/help', kw: 'docs support guides' },
  { type: 'Navigate', icon: 'plan', title: 'Billing', sub: 'Plan and usage', route: '#/app/billing', kw: 'plan subscription invoices' },
  { type: 'Navigate', icon: 'settings', title: 'Settings', sub: 'App settings', route: '#/app/settings', kw: 'config preferences' },
];

function commandsFor(mode: 'admin' | 'merchant'): Command[] {
  return mode === 'admin' ? ADMIN_COMMANDS : MERCHANT_COMMANDS;
}

export function CommandPalette({ mode, onClose }: { mode: 'admin' | 'merchant'; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (hash: string) => navigate(superappRoute(hash));
  const [q, setQ] = useS('');
  const [sel, setSel] = useS(0);
  const inputRef = useR<HTMLInputElement>(null);
  const index = useM(() => commandsFor(mode), [mode]);
  useE(() => { inputRef.current && inputRef.current.focus(); }, []);

  const results = useM(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      return index.slice(0, 6);
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
