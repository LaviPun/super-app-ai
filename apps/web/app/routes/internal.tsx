import { json } from '@remix-run/node';
import type { HeadersFunction, MetaFunction } from '@remix-run/node';
import { Outlet, useLoaderData, useLocation, useMatches, useNavigate } from '@remix-run/react';
import { useState, useCallback, useEffect } from 'react';
import { internalSessionStorage } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { SettingsService, type AppSettingsData } from '~/services/settings/settings.service';
import { internalDocumentTitle } from '~/utils/internal-route-meta';
import {
  Icon,
  Avatar,
  Toast,
  CommandPalette,
  superappRoute,
} from '~/components/superapp';

/** Live nav-badge / health counts surfaced in the admin chrome. */
type NavCounts = { dlq: number; err: number; wh: number; tickets: number };

export const meta: MetaFunction<typeof loader> = ({ location, data }) => {
  const appName = data?.settings?.appName ?? 'SuperApp Admin';
  return [{ title: internalDocumentTitle(location.pathname, appName) }];
};

export const headers: HeadersFunction = () => ({
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
});

export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get('cookie');
  const session = await internalSessionStorage.getSession(cookie);
  const isAuthed = session.get('internal_admin') === true;

  let settings: AppSettingsData | null = null;
  // Real cross-shop counts backing the sidebar badges + health footer.
  // Each query is guarded so a missing table degrades to 0 rather than 500ing
  // the whole admin shell.
  let counts: NavCounts = { dlq: 0, err: 0, wh: 0, tickets: 0 };

  if (isAuthed) {
    const prisma = getPrisma();
    const since24h = new Date(Date.now() - 86_400_000);
    const [settingsResult, failedJobs, errors24h, failedWebhooks24h, openTickets] = await Promise.all([
      new SettingsService().get().catch(() => null),
      prisma.job.count({ where: { status: 'FAILED' } }).catch(() => 0),
      prisma.errorLog.count({ where: { level: 'ERROR', createdAt: { gte: since24h } } }).catch(() => 0),
      prisma.webhookEvent
        .count({ where: { success: false, processedAt: { gte: since24h } } })
        .catch(() => 0),
      prisma.supportTicket
        .count({ where: { OR: [{ status: { in: ['OPEN', 'ESCALATED'] } }, { needsIntervention: true }] } })
        .catch(() => 0),
    ]);
    settings = settingsResult;
    counts = { dlq: failedJobs, err: errors24h, wh: failedWebhooks24h, tickets: openTickets };
  }

  return json({ isAuthed, settings, counts });
}

export default function InternalLayout() {
  const { isAuthed, settings, counts } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isLoginPage =
    location.pathname === '/internal/login' || location.pathname.startsWith('/internal/sso');

  if (!isAuthed || isLoginPage) {
    return <Outlet />;
  }

  return <AdminChrome settings={settings} counts={counts} />;
}

/* ---------------- ADMIN_NAV — exactly mirrors the design's shell.jsx ---------------- */
type NavItem = {
  url: string; // design hash route (#/admin/...)
  label: string;
  icon: string;
  exact?: boolean;
  badge?: string;
  countKey?: 'dlq' | 'err' | 'wh' | 'tickets';
  countTone?: string;
  /** Extra hash routes that should also highlight this item (consolidated pages). */
  also?: string[];
};
type NavSection = { title: string; items: NavItem[] };

const ADMIN_NAV: NavSection[] = [
  { title: 'Overview', items: [{ url: '#/admin', label: 'Dashboard', icon: 'home', exact: true }] },
  {
    title: 'Operations',
    items: [
      { url: '#/admin/stores', label: 'Stores', icon: 'store' },
      { url: '#/admin/jobs', label: 'Jobs', icon: 'work', countKey: 'dlq', countTone: 'critical' },
      {
        url: '#/admin/activity',
        label: 'Logs',
        icon: 'live',
        countKey: 'err',
        countTone: 'critical',
        also: ['#/admin/api-logs', '#/admin/logs', '#/admin/audit'],
      },
      { url: '#/admin/webhooks', label: 'Webhooks', icon: 'transfer', countKey: 'wh', countTone: 'warning' },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        url: '#/admin/support',
        label: 'Support CRM',
        icon: 'chat',
        countKey: 'tickets',
        countTone: 'warning',
        also: ['#/admin/support/'],
      },
    ],
  },
  {
    title: 'Platform',
    items: [
      { url: '#/admin/modules', label: 'Modules', icon: 'layers' },
      { url: '#/admin/flows', label: 'Flows', icon: 'flow' },
      { url: '#/admin/connectors', label: 'Connectors', icon: 'connect' },
      { url: '#/admin/data-stores', label: 'Data Stores', icon: 'database' },
      { url: '#/admin/customers', label: 'Customers', icon: 'users' },
    ],
  },
  {
    title: 'AI & Models',
    items: [
      { url: '#/admin/ai-providers', label: 'AI Providers', icon: 'connect' },
      { url: '#/admin/ai-assistant', label: 'AI Assistant', icon: 'chat', badge: 'New' },
      { url: '#/admin/model-setup', label: 'Local AI Setting', icon: 'desktop' },
      { url: '#/admin/usage', label: 'Usage & Costs', icon: 'chart' },
      { url: '#/admin/release', label: 'Release Gate', icon: 'rocket' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { url: '#/admin/plan-tiers', label: 'Plan Tiers', icon: 'plan' },
      { url: '#/admin/categories', label: 'Categories', icon: 'categories' },
      { url: '#/admin/templates', label: 'Templates', icon: 'template' },
      { url: '#/admin/recipe-edit', label: 'Recipe Edit', icon: 'code' },
    ],
  },
];

// Does the current real pathname match a design hash route?
// `also` lets a consolidated item (e.g. "Logs") highlight for sibling routes.
function navMatch(hash: string, pathname: string, exact?: boolean, also?: string[]): boolean {
  const hit = (h: string) => {
    const target = superappRoute(h);
    if (exact) return pathname === target;
    return pathname === target || pathname.startsWith(target + '/');
  };
  if (hit(hash)) return true;
  return (also ?? []).some(hit);
}

function AdminChrome({ settings, counts }: { settings: AppSettingsData | null; counts: NavCounts }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean; id: number } | null>(null);

  // hydrate collapsed state from localStorage (client only)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('saai_nav_collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem('saai_nav_collapsed', n ? '1' : '0');
      } catch {
        /* ignore */
      }
      return n;
    });
  }, []);

  // ⌘K / Ctrl+K opens the command palette (ported from app.jsx)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Mobile nav drawer: close on route change, and on Escape while open.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [path]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [mobileNavOpen]);

  const showToast = useCallback((message: string, error?: boolean) => {
    if (!message || !message.trim()) return;
    setToast({ message, error, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Surface route-level toasts (loader/action returning `{ toast: {...} }`).
  const matches = useMatches();
  const routeData = matches[matches.length - 1]?.data as Record<string, unknown> | undefined;
  const routeToast = routeData?.toast;
  useEffect(() => {
    if (routeToast && typeof routeToast === 'object') {
      const tt = routeToast as { message?: unknown; error?: unknown };
      if (typeof tt.message === 'string' && tt.message.trim()) {
        showToast(tt.message, Boolean(tt.error));
      }
    }
  }, [routeToast, showToast]);

  const adminName = settings?.adminName ?? 'Lavi Admin';
  const profilePicUrl = settings?.profilePicUrl ?? undefined;

  // Derive the footer health state from the real counts (no hardcoded status).
  const healthy = counts.dlq === 0 && counts.err === 0 && counts.wh === 0;
  const healthTone = counts.dlq > 0 ? 'critical' : counts.err > 0 || counts.wh > 0 ? 'warning' : 'success';
  const healthDotStyle = healthy
    ? undefined
    : { background: `var(--p-${healthTone})`, boxShadow: `0 0 0 3px var(--p-${healthTone}-bg)` };

  const goHash = (hash: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(superappRoute(hash));
  };

  const navLink = (it: NavItem) => {
    const sel = navMatch(it.url, path, it.exact, it.also);
    const count = it.countKey ? counts[it.countKey] : null;
    return (
      <a
        key={it.url}
        href={superappRoute(it.url)}
        onClick={goHash(it.url)}
        className={'nav-item' + (sel ? ' sel' : '')}
        title={collapsed ? it.label : undefined}
      >
        <Icon name={it.icon} size={17} />
        <span className="grow nav-label">{it.label}</span>
        {it.badge && (
          <span className="badge badge-new nav-badge" style={{ height: 16, fontSize: 10 }}>
            {it.badge}
          </span>
        )}
        {count ? <span className={'nav-count ' + (it.countTone || '')}>{count}</span> : null}
        {collapsed && count ? <span className={'nav-dot ' + (it.countTone || '')} /> : null}
      </a>
    );
  };

  const footLink = (hash: string, label: string, icon: string) => (
    <a
      href={superappRoute(hash)}
      onClick={goHash(hash)}
      className={'nav-item' + (navMatch(hash, path) ? ' sel' : '')}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} size={17} />
      <span className="nav-label">{label}</span>
    </a>
  );

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `.internal-admin-viewport { flex: 1; min-height: 0; height: 100%; display: flex; }
            .internal-admin-viewport .admin-shell { flex: 1; min-width: 0; }`,
        }}
      />
      <div className="internal-admin-viewport">
        <div className={'admin-shell' + (collapsed ? ' collapsed' : '') + (mobileNavOpen ? ' nav-open' : '')}>
          <nav className="admin-nav" aria-label="Admin">
            <div className="admin-brand">
              <div className="brand-mark">SA</div>
              <div className="stack nav-label" style={{ gap: 0, minWidth: 0 }}>
                <div className="brand-name">SuperApp AI</div>
                <div className="brand-sub">Internal Admin</div>
              </div>
              <button
                className="nav-collapse-btn"
                onClick={toggle}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label="Toggle sidebar"
              >
                <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={15} />
              </button>
            </div>
            <div className="admin-nav-scroll">
              {ADMIN_NAV.map((sec) => (
                <div key={sec.title} className="nav-sec">
                  <div className="nav-sec-title">{sec.title}</div>
                  {sec.items.map(navLink)}
                </div>
              ))}
            </div>
            <div className="admin-nav-foot">
              <a
                href={superappRoute('#/admin/release')}
                onClick={goHash('#/admin/release')}
                className="nav-health"
                style={{ textDecoration: 'none' }}
                title={`Release gate ${healthy ? 'healthy' : 'needs attention'} · ${counts.dlq} in DLQ · ${counts.err} errors 24h · ${counts.wh} webhook failures 24h`}
              >
                <span className="nav-health-dot" style={healthDotStyle} />
                <div className="stack grow nav-label" style={{ gap: 0, minWidth: 0 }}>
                  <span className="t-xs t-strong" style={{ color: 'var(--p-text)' }}>
                    {healthy ? 'All systems healthy' : 'Attention needed'}
                  </span>
                  <span className="t-xs t-muted">{`${counts.dlq} in DLQ · ${counts.err} errors 24h`}</span>
                </div>
              </a>
              {footLink('#/admin/settings', 'Settings', 'settings')}
              {footLink('#/admin/logout', 'Logout', 'exit')}
            </div>
          </nav>
          {mobileNavOpen && (
            <button
              className="admin-nav-backdrop"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            />
          )}
          <div className="admin-main">
            <header className="admin-top">
              <button
                className="nav-mobile-toggle"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
              >
                <Icon name="menu" size={18} />
              </button>
              <button className="global-search" onClick={() => setCmdkOpen(true)}>
                <Icon name="search" size={16} />
                <span className="grow" style={{ textAlign: 'left' }}>
                  Search stores, modules, jobs, logs…
                </span>
                <kbd className="kbd">⌘K</kbd>
              </button>
              <div className="row-3">
                <a
                  className="top-icon-btn"
                  href={superappRoute('#/admin/activity')}
                  onClick={goHash('#/admin/activity')}
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <Icon name="bell" size={18} />
                  <span className="top-dot" />
                </a>
                <Avatar name={adminName} src={profilePicUrl} size={30} />
              </div>
            </header>
            <div className="admin-content">
              <Outlet context={{ showToast }} />
            </div>
          </div>
        </div>
      </div>
      {cmdkOpen && <CommandPalette mode="admin" onClose={() => setCmdkOpen(false)} />}
      <Toast toast={toast} />
    </>
  );
}
