export type SurfaceGroup = 'merchant' | 'internal';

export type V2RouteShell = {
  label: string;
  href: string;
  legacyRoutes: string[];
  apiBoundary: string;
  description: string;
};

export const merchantRoutes: V2RouteShell[] = [
  {
    label: 'Home',
    href: '/',
    legacyRoutes: ['apps/web/app/routes/_index.tsx'],
    apiBoundary: 'GET /health, future merchant summary APIs',
    description: 'Merchant dashboard with module, job, connector, usage, and plan summary.',
  },
  {
    label: 'AI modules',
    href: '/modules',
    legacyRoutes: ['modules._index.tsx', 'modules.$moduleId.tsx', 'templates.$templateId.tsx', 'api.modules.*'],
    apiBoundary: 'Modules, template, AI generation, hydrate, modify, publish contracts',
    description: 'Module catalog, safe RecipeSpec generation, drafts, and publish readiness.',
  },
  {
    label: 'Jobs',
    href: '/jobs',
    legacyRoutes: ['jobs._index.tsx'],
    apiBoundary: 'POST /v1/jobs, GET /v1/jobs/:jobId, SSE /v1/jobs/:jobId/events',
    description: 'Merchant-visible job ledger with SSE progress and polling fallback.',
  },
  {
    label: 'Advanced features',
    href: '/advanced',
    legacyRoutes: ['advanced._index.tsx', 'flows._index.tsx', 'flows.build.$flowId.tsx', 'connectors._index.tsx', 'api.flows.*', 'api.connectors.*'],
    apiBoundary: 'Flow, connector, and advanced capability APIs',
    description: 'Flows, connectors, workflow automation, and advanced module capabilities.',
  },
  {
    label: 'Data models',
    href: '/data',
    legacyRoutes: ['data._index.tsx', 'data.$storeKey.tsx'],
    apiBoundary: 'Data store contracts',
    description: 'Data stores and capture surfaces that support modules and flows.',
  },
  {
    label: 'Billing',
    href: '/billing',
    legacyRoutes: ['billing._index.tsx'],
    apiBoundary: 'Billing and quota APIs',
    description: 'Plan, quota, and subscription status.',
  },
  {
    label: 'Settings',
    href: '/settings',
    legacyRoutes: ['settings._index.tsx'],
    apiBoundary: 'Settings APIs',
    description: 'Merchant app settings and configuration.',
  },
];

export const internalRoutes: V2RouteShell[] = [
  {
    label: 'Dashboard',
    href: '/internal',
    legacyRoutes: ['internal.tsx', 'internal._index.tsx'],
    apiBoundary: 'Internal status, metrics, and trace APIs',
    description: 'Operator telemetry and system overview.',
  },
  {
    label: 'Monitoring',
    href: '/internal/monitoring',
    legacyRoutes: [
      'internal.release-dashboard.tsx',
      'internal.activity.tsx',
      'internal.logs.tsx',
      'internal.api-logs.tsx',
      'internal.audit.tsx',
      'internal.webhooks.tsx',
    ],
    apiBoundary: 'Activity, logs, webhook lag, and release-readiness APIs',
    description: 'Release dashboard, activity, logs, audit, and webhook monitoring.',
  },
  {
    label: 'Data',
    href: '/internal/data',
    legacyRoutes: ['internal.stores.$storeId.*', 'internal.usage.tsx', 'internal.ai-accounts.tsx', 'internal.jobs.tsx'],
    apiBoundary: 'Stores, usage, AI account, and job admin APIs',
    description: 'Store, cost, provider account, and job management.',
  },
  {
    label: 'AI Assistant',
    href: '/internal/ai-assistant',
    legacyRoutes: [
      'internal.ai-assistant.tsx',
      'internal.ai-assistant.chat.stream.tsx',
      'services/ai/internal-assistant.server.ts',
      'services/ai/internal-ai-local-only.ts',
    ],
    apiBoundary: 'POST /v1/internal/assistant/jobs, GET /v1/internal/assistant/jobs/:jobId, SSE /events',
    description: 'Internal operations assistant with local-only policy and isolated tool-run queue.',
  },
  {
    label: 'Configuration',
    href: '/internal/configuration',
    legacyRoutes: [
      'internal.ai-providers.tsx',
      'internal.ai-assistant.tsx',
      'internal.model-setup.tsx',
      'internal.plan-tiers.tsx',
      'internal.categories.tsx',
      'internal.templates.*',
      'internal.recipe-edit.tsx',
    ],
    apiBoundary: 'AI provider, model setup, plan, category, template, and recipe admin APIs',
    description: 'Operator configuration surfaces mirrored from Remix internal admin.',
  },
];

export const allV2RouteShells = [...merchantRoutes, ...internalRoutes];

export function getV2RouteShell(group: SurfaceGroup, label: string): V2RouteShell {
  const routes = group === 'merchant' ? merchantRoutes : internalRoutes;
  const route = routes.find((item) => item.label === label);
  if (!route) throw new Error(`Missing V2 route shell: ${group}/${label}`);
  return route;
}
