import { json } from '@remix-run/node';
import { Outlet, useLoaderData, useLocation, useMatches } from '@remix-run/react';
import {
  Frame, Navigation, TopBar, Toast,
} from '@shopify/polaris';
import {
  AppsIcon, ConnectIcon, ClockIcon, PersonIcon,
  AlertCircleIcon, NoteIcon, SettingsIcon,
  ExitIcon, AutomationIcon, CashDollarIcon, StoreIcon, BugIcon,
} from '@shopify/polaris-icons';
import { useState, useCallback, useEffect } from 'react';
import { internalSessionStorage } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get('cookie');
  const session = await internalSessionStorage.getSession(cookie);
  const isAuthed = session.get('internal_admin') === true;
  return json({ isAuthed });
}

export default function InternalLayout() {
  const { isAuthed } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isLoginPage = location.pathname === '/internal/login' || location.pathname.startsWith('/internal/sso');

  if (!isAuthed || isLoginPage) {
    return <Outlet />;
  }

  return <InternalAppFrame />;
}

function InternalAppFrame() {
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

  const navItems = [
    { url: '/internal', label: 'Dashboard', icon: AppsIcon, exactMatch: true },
    { url: '/internal/ai-providers', label: 'AI Providers', icon: SettingsIcon },
    { url: '/internal/usage', label: 'Usage & Costs', icon: CashDollarIcon },
    { url: '/internal/activity', label: 'Activity Log', icon: AutomationIcon },
    { url: '/internal/logs', label: 'Error Logs', icon: BugIcon },
    { url: '/internal/api-logs', label: 'API Logs', icon: NoteIcon },
    { url: '/internal/stores', label: 'Stores', icon: StoreIcon },
    { url: '/internal/jobs', label: 'Jobs', icon: ClockIcon },
  ];

  const navigation = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={navItems.map(item => ({
          ...item,
          selected: item.exactMatch
            ? location.pathname === item.url
            : location.pathname.startsWith(item.url),
        }))}
      />
      <Navigation.Section
        separator
        items={[
          { url: '/internal/logout', label: 'Logout', icon: ExitIcon },
        ]}
      />
    </Navigation>
  );

  const userMenu = (
    <TopBar.UserMenu
      actions={[
        { items: [{ content: 'Logout', url: '/internal/logout' }] },
      ]}
      name="Admin"
      initials="SA"
      open={userMenuOpen}
      onToggle={toggleUserMenu}
    />
  );

  const topBar = (
    <TopBar
      showNavigationToggle
      userMenu={userMenu}
      onNavigationToggle={toggleMobileNav}
    />
  );

  const logo = {
    width: 36,
    topBarSource: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="%23000"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="16" font-weight="700" fill="%23fff">SA</text></svg>'
    ),
    accessibilityLabel: 'SuperApp AI',
    url: '/internal',
  };

  return (
    <Frame
      topBar={topBar}
      navigation={navigation}
      showMobileNavigation={mobileNavActive}
      onNavigationDismiss={toggleMobileNav}
      logo={logo}
    >
      <Outlet context={{ showToast: (msg: string, error?: boolean) => {
        setToastMsg(msg);
        setToastError(!!error);
        setToastActive(true);
      }}} />
      {toastActive && (
        <Toast
          content={toastMsg}
          error={toastError}
          onDismiss={dismissToast}
          duration={4000}
        />
      )}
    </Frame>
  );
}
