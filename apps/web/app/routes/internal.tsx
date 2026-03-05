import { json } from '@remix-run/node';
import { Outlet, useLoaderData, useLocation, useMatches } from '@remix-run/react';
import {
  Frame, Navigation, TopBar, Toast,
} from '@shopify/polaris';
import {
  AppsIcon, ClockIcon, CodeIcon,
  NoteIcon, SettingsIcon,
  ExitIcon, AutomationIcon, CashDollarIcon, StoreIcon, BugIcon,
} from '@shopify/polaris-icons';
import { useState, useCallback, useEffect } from 'react';
import { internalSessionStorage } from '~/internal-admin/session.server';
import { SettingsService, type AppSettingsData } from '~/services/settings/settings.service';

export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get('cookie');
  const session = await internalSessionStorage.getSession(cookie);
  const isAuthed = session.get('internal_admin') === true;

  let settings: AppSettingsData | null = null;
  if (isAuthed) {
    try {
      settings = await new SettingsService().get();
    } catch {
      // Settings table might not exist yet; use defaults
    }
  }

  return json({ isAuthed, settings });
}

export default function InternalLayout() {
  const { isAuthed, settings } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isLoginPage = location.pathname === '/internal/login' || location.pathname.startsWith('/internal/sso');

  if (!isAuthed || isLoginPage) {
    return <Outlet />;
  }

  return <InternalAppFrame settings={settings} />;
}

function InternalAppFrame({ settings }: { settings: AppSettingsData | null }) {
  const location = useLocation();
  const [mobileNavActive, setMobileNavActive] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);

  const toggleMobileNav = useCallback(() => setMobileNavActive(v => !v), []);
  const dismissToast = useCallback(() => setToastActive(false), []);
  const toggleUserMenu = useCallback(() => setUserMenuOpen(v => !v), []);

  const matches = useMatches();
  const routeData = matches[matches.length - 1]?.data as Record<string, unknown> | undefined;

  useEffect(() => {
    if (routeData?.toast && typeof routeData.toast === 'object') {
      const t = routeData.toast as { message: string; error?: boolean };
      setToastMsg(t.message);
      setToastError(!!t.error);
      setToastActive(true);
    }
  }, [routeData?.toast]);

  const appName = settings?.appName ?? 'SuperApp AI';
  const headerColor = settings?.headerColor ?? '#000000';
  const adminName = settings?.adminName ?? 'Admin';
  const profilePicUrl = settings?.profilePicUrl ?? null;

  const initials = adminName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'SA';

  const mainItems = [
    { url: '/internal', label: 'Dashboard', icon: AppsIcon, exactMatch: true },
  ];

  const monitoringItems = [
    { url: '/internal/activity', label: 'Activity Log', icon: AutomationIcon },
    { url: '/internal/logs', label: 'Error Logs', icon: BugIcon },
    { url: '/internal/api-logs', label: 'API Logs', icon: NoteIcon },
  ];

  const dataItems = [
    { url: '/internal/stores', label: 'Stores', icon: StoreIcon },
    { url: '/internal/usage', label: 'Usage & Costs', icon: CashDollarIcon },
    { url: '/internal/jobs', label: 'Jobs', icon: ClockIcon },
  ];

  const configItems = [
    { url: '/internal/ai-providers', label: 'AI Providers', icon: SettingsIcon },
    { url: '/internal/plan-tiers', label: 'Plan Tiers', icon: CashDollarIcon },
    { url: '/internal/categories', label: 'Categories', icon: StoreIcon },
    { url: '/internal/templates', label: 'Templates', icon: StoreIcon },
    { url: '/internal/recipe-edit', label: 'Recipe edit', icon: CodeIcon },
  ];

  const toNavItems = (items: typeof mainItems) =>
    items.map(item => ({
      ...item,
      selected: 'exactMatch' in item && item.exactMatch
        ? location.pathname === item.url
        : location.pathname.startsWith(item.url),
    }));

  const navigation = (
    <Navigation location={location.pathname}>
      <Navigation.Section title="Overview" items={toNavItems(mainItems)} />
      <Navigation.Section title="Monitoring" items={toNavItems(monitoringItems)} />
      <Navigation.Section title="Data" items={toNavItems(dataItems)} />
      <Navigation.Section title="Configuration" items={toNavItems(configItems)} />
      <Navigation.Section
        separator
        items={[
          { url: '/internal/settings', label: 'Settings', icon: SettingsIcon },
          { url: '/internal/logout', label: 'Logout', icon: ExitIcon },
        ]}
      />
    </Navigation>
  );

  const userMenuMarkup = (
    <TopBar.UserMenu
      actions={[
        { items: [
          { content: 'Settings', url: '/internal/settings' },
          { content: 'Logout', url: '/internal/logout' },
        ]},
      ]}
      name={adminName}
      initials={initials}
      avatar={profilePicUrl ?? undefined}
      open={userMenuOpen}
      onToggle={toggleUserMenu}
    />
  );

  const topBar = (
    <TopBar
      showNavigationToggle
      userMenu={userMenuMarkup}
      onNavigationToggle={toggleMobileNav}
    />
  );

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="${headerColor.replace('#', '%23')}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="700" fill="%23fff">${encodeURIComponent(appName.slice(0, 2).toUpperCase())}</text></svg>`;

  const logo = {
    width: 36,
    topBarSource: settings?.logoUrl || ('data:image/svg+xml,' + logoSvg),
    accessibilityLabel: appName,
    url: '/internal',
  };

  return (
    <>
      <style>{`
        .Polaris-TopBar { background: ${headerColor} !important; }
        /* Internal admin: frame fills viewport; only main content scrolls so nav/top bar stay fixed */
        .internal-admin-frame-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .internal-admin-frame-wrapper > * { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
        .internal-admin-frame-wrapper :has(> .internal-admin-content) { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
        .internal-admin-content { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
        /* Internal admin: truncate long text with ellipsis; full value on hover via title */
        .internal-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .internal-truncate-wide { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* Scrollable table container; use thead th { position: sticky; top: 0; background: ... } for sticky header */
        .internal-table-scroll { overflow: auto; max-height: min(70vh, 520px); }
        .internal-table-scroll thead th { position: sticky; top: 0; z-index: 1; background: var(--p-color-bg-surface); box-shadow: 0 1px 0 var(--p-color-border); }
        /* Code / JSON block: capped height, scroll, optional expand */
        .internal-code-block { margin: 0; padding: 12px; background: var(--p-color-bg-surface-secondary); border-radius: 8px; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 280px; overflow-y: auto; }
        .internal-code-block-expanded { max-height: none; }
      `}</style>
      <div className="internal-admin-frame-wrapper">
        <Frame
          topBar={topBar}
          navigation={navigation}
          showMobileNavigation={mobileNavActive}
          onNavigationDismiss={toggleMobileNav}
          logo={logo}
        >
          <div className="internal-admin-content">
            <Outlet context={{ showToast: (msg: string, error?: boolean) => {
              setToastMsg(msg);
              setToastError(!!error);
              setToastActive(true);
            }}} />
          </div>
          {toastActive && (
            <Toast
              content={toastMsg}
              error={toastError}
              onDismiss={dismissToast}
              duration={4000}
            />
          )}
        </Frame>
      </div>
    </>
  );
}
