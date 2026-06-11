const INTERNAL_ROUTE_TITLES: Record<string, string> = {
  '/internal': 'Dashboard',
  '/internal/login': 'Sign in',
  '/internal/release-dashboard': 'Release dashboard',
  '/internal/activity': 'Activity log',
  '/internal/logs': 'Error logs',
  '/internal/api-logs': 'API logs',
  '/internal/audit': 'Audit log',
  '/internal/webhooks': 'Webhooks',
  '/internal/stores': 'Stores',
  '/internal/usage': 'Usage & costs',
  '/internal/ai-accounts': 'AI accounts',
  '/internal/jobs': 'Jobs',
  '/internal/ai-providers': 'AI providers',
  '/internal/ai-assistant': 'AI assistant',
  '/internal/model-setup': 'Local AI settings',
  '/internal/plan-tiers': 'Plan tiers',
  '/internal/categories': 'Categories',
  '/internal/templates': 'Templates',
  '/internal/recipe-edit': 'Recipe editor',
  '/internal/settings': 'Settings',
  '/internal/metaobject-backfill': 'Metaobject backfill',
  '/internal/advanced': 'Settings',
  '/internal/logout': 'Sign out',
};

const PREFIX_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/internal/stores/', title: 'Store details' },
  { prefix: '/internal/activity/', title: 'Activity details' },
  { prefix: '/internal/logs/', title: 'Error log details' },
  { prefix: '/internal/api-logs/', title: 'API log details' },
  { prefix: '/internal/templates/', title: 'Template' },
  { prefix: '/internal/trace/', title: 'Trace' },
];

export function titleForInternalPath(pathname: string): string {
  const exact = INTERNAL_ROUTE_TITLES[pathname];
  if (exact) return exact;
  for (const { prefix, title } of PREFIX_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  if (pathname.startsWith('/internal/sso')) return 'Single sign-on';
  return 'Admin';
}

export function internalDocumentTitle(pathname: string, appName = 'SuperApp Admin'): string {
  const page = titleForInternalPath(pathname);
  return `${page} · ${appName}`;
}
