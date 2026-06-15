import { Link, useLocation } from '@remix-run/react';

// In-app sub-navigation for the merchant dashboard. The TOP-LEVEL nav
// (Dashboard / Build / Insights / Settings / Billing) lives in the Shopify
// App Bridge nav (`<s-app-nav>` in root.tsx) — OUTSIDE the embedded app.
// This renders the design's `.m-subnav` row INSIDE the app, matching the
// prototype's Build / Insights tab groups.

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

export function MerchantSubnav() {
  const location = useLocation();
  const path = location.pathname;

  const buildActive = BUILD_PATHS.some((p) => matchPath(p, path));
  const insightsActive = INSIGHTS_PATHS.some((p) => matchPath(p, path));

  // The design hides the sub-nav on the full-screen generate flow.
  const onGenerate = matchPath('/generate', path);
  const tabs = buildActive && !onGenerate ? BUILD_TABS : insightsActive ? INSIGHTS_TABS : null;
  if (!tabs) return null;

  return (
    <div className="m-subnav">
      {tabs.map((t) => (
        <Link key={t.url} to={t.url} className={'m-tab' + (matchPath(t.url, path) ? ' sel' : '')}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
