/* Mock domain data for the SuperApp AI design port. Grounded in the real Prisma schema.
   Ported from the design bundle (data.jsx). This is the PLACEHOLDER layer — routes prefer
   real loader data and fall back to these shapes for fields the backend does not provide. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { titleCase } from './ui';

export const STORES: any[] = [
  { id: 'shp_8x21', domain: 'aurora-threads.myshopify.com', name: 'Aurora Threads', plan: 'GROWTH', status: 'ACTIVE', modules: 14, published: 9, aiCalls30d: 1280, installedAt: '2025-11-02', country: 'US', owner: 'Mara Liang', provider: 'OpenAI · gpt-4o' },
  { id: 'shp_4f90', domain: 'northpeak-gear.myshopify.com', name: 'Northpeak Gear', plan: 'PRO', status: 'ACTIVE', modules: 31, published: 22, aiCalls30d: 4910, installedAt: '2025-09-18', country: 'CA', owner: 'Devon Park', provider: 'Anthropic · claude-3.5' },
  { id: 'shp_1a55', domain: 'lumen-skincare.myshopify.com', name: 'Lumen Skincare', plan: 'STARTER', status: 'ACTIVE', modules: 6, published: 3, aiCalls30d: 340, installedAt: '2026-01-12', country: 'UK', owner: 'Priya Anand', provider: 'Default · gpt-4o' },
  { id: 'shp_7c33', domain: 'bldr-coffee.myshopify.com', name: 'BLDR Coffee Co', plan: 'GROWTH', status: 'TRIAL', modules: 8, published: 4, aiCalls30d: 720, installedAt: '2026-05-28', country: 'US', owner: 'Sam Reyes', provider: 'Default · gpt-4o' },
  { id: 'shp_9b02', domain: 'verdant-home.myshopify.com', name: 'Verdant Home', plan: 'ENTERPRISE', status: 'ACTIVE', modules: 58, published: 41, aiCalls30d: 12400, installedAt: '2025-06-04', country: 'AU', owner: 'Jordan Wu', provider: 'Azure · gpt-4o' },
  { id: 'shp_3e77', domain: 'pixel-toys.myshopify.com', name: 'Pixel Toys', plan: 'FREE', status: 'ACTIVE', modules: 2, published: 0, aiCalls30d: 40, installedAt: '2026-06-09', country: 'DE', owner: 'Lena Hoff', provider: 'Default · gpt-4o' },
  { id: 'shp_6d18', domain: 'wildflower-co.myshopify.com', name: 'Wildflower & Co', plan: 'STARTER', status: 'EXPIRED', modules: 5, published: 2, aiCalls30d: 0, installedAt: '2025-12-21', country: 'US', owner: 'Casey Bloom', provider: 'Default · gpt-4o' },
  { id: 'shp_2k44', domain: 'forge-supply.myshopify.com', name: 'Forge Supply', plan: 'PRO', status: 'ACTIVE', modules: 27, published: 19, aiCalls30d: 3300, installedAt: '2025-10-30', country: 'US', owner: 'Alex Stone', provider: 'OpenAI · gpt-4o' },
];

export const MODULE_TYPES = ['Storefront UI', 'Function', 'Integration', 'Flow', 'Data store'];
export const MODULES: any[] = [
  { id: 'mod_a1', name: 'Sticky Add-to-Cart Bar', type: 'Storefront UI', category: 'Conversion', status: 'PUBLISHED', version: 7, source: 'template', updated: '2h ago', summary: 'Floating cart bar with quantity + variant selector', store: 'Aurora Threads', storeId: 'shp_8x21', instances: 3, aiCalls30d: 210 },
  { id: 'mod_a2', name: 'Volume Discount Tiers', type: 'Function', category: 'Pricing', status: 'PUBLISHED', version: 3, source: 'recipe', updated: '1d ago', summary: 'Cart transform: 3-tier quantity break pricing', store: 'Aurora Threads', storeId: 'shp_8x21', instances: 1, aiCalls30d: 64 },
  { id: 'mod_a3', name: 'Welcome Popup', type: 'Storefront UI', category: 'Marketing', status: 'DRAFT', version: 2, source: 'scratch', updated: '5m ago', summary: 'First-visit email capture overlay', store: 'Aurora Threads', storeId: 'shp_8x21', instances: 0, aiCalls30d: 18 },
  { id: 'mod_a4', name: 'Loyalty Points Widget', type: 'Storefront UI', category: 'Retention', status: 'PUBLISHED', version: 12, source: 'template', updated: '3d ago', summary: 'Account-page points balance + redeem', store: 'Northpeak Gear', storeId: 'shp_4f90', instances: 2, aiCalls30d: 142 },
  { id: 'mod_a5', name: 'Klaviyo Sync', type: 'Integration', category: 'Marketing', status: 'PUBLISHED', version: 4, source: 'recipe', updated: '6h ago', summary: 'Push order + profile events to Klaviyo', store: 'Northpeak Gear', storeId: 'shp_4f90', instances: 1, aiCalls30d: 0 },
  { id: 'mod_a6', name: 'Abandoned Cart Flow', type: 'Flow', category: 'Automation', status: 'DRAFT', version: 1, source: 'image', updated: '12m ago', summary: 'Trigger SMS + email on cart abandonment', store: 'Northpeak Gear', storeId: 'shp_4f90', instances: 0, aiCalls30d: 31 },
  { id: 'mod_a7', name: 'Size Guide Drawer', type: 'Storefront UI', category: 'Merchandising', status: 'PUBLISHED', version: 5, source: 'template', updated: '4d ago', summary: 'Slide-out sizing chart per product type', store: 'Lumen Skincare', storeId: 'shp_1a55', instances: 1, aiCalls30d: 44 },
  { id: 'mod_a8', name: 'Reviews Import', type: 'Data store', category: 'Social proof', status: 'DRAFT', version: 1, source: 'scratch', updated: '1h ago', summary: 'Custom store for migrated product reviews', store: 'Verdant Home', storeId: 'shp_9b02', instances: 0, aiCalls30d: 12 },
  { id: 'mod_a9', name: 'Bundle Builder', type: 'Storefront UI', category: 'Merchandising', status: 'PUBLISHED', version: 9, source: 'recipe', updated: '8h ago', summary: 'Mix-and-match product bundle with live pricing', store: 'Verdant Home', storeId: 'shp_9b02', instances: 4, aiCalls30d: 388 },
  { id: 'mod_a10', name: 'Back-in-stock Notify', type: 'Function', category: 'Retention', status: 'PUBLISHED', version: 6, source: 'template', updated: '1d ago', summary: 'Email capture + restock webhook trigger', store: 'Forge Supply', storeId: 'shp_2k44', instances: 2, aiCalls30d: 96 },
  { id: 'mod_a11', name: 'Wholesale Gate', type: 'Function', category: 'B2B', status: 'PUBLISHED', version: 2, source: 'scratch', updated: '2d ago', summary: 'Hide prices + require login for B2B catalog', store: 'Forge Supply', storeId: 'shp_2k44', instances: 1, aiCalls30d: 22 },
  { id: 'mod_a12', name: 'Spin-to-win Wheel', type: 'Storefront UI', category: 'Marketing', status: 'ARCHIVED', version: 3, source: 'template', updated: '3w ago', summary: 'Gamified email capture overlay', store: 'BLDR Coffee Co', storeId: 'shp_7c33', instances: 0, aiCalls30d: 0 },
];

export const PROVIDERS: any[] = [
  { id: 'prov_oai', name: 'OpenAI Production', provider: 'OPENAI', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', active: true, fallback: false, key: '••••••••••3xK9', calls30d: 18420, costCents: 142300, skills: null, codeExec: false },
  { id: 'prov_ant', name: 'Claude (Anthropic)', provider: 'ANTHROPIC', model: 'claude-3-5-sonnet', baseUrl: 'https://api.anthropic.com', active: false, fallback: true, key: '••••••••••aZ2p', calls30d: 6210, costCents: 78900, skills: ['pptx', 'xlsx'], codeExec: true },
  { id: 'prov_azr', name: 'Azure OpenAI (EU)', provider: 'AZURE_OPENAI', model: 'gpt-4o', baseUrl: 'https://eu.azure.com/openai', active: false, fallback: false, key: '••••••••••Qd71', calls30d: 2040, costCents: 19800, skills: null, codeExec: false },
  { id: 'prov_qwn', name: 'Qwen3 Local (Ollama)', provider: 'CUSTOM', model: 'qwen3:4b-instruct', baseUrl: 'http://127.0.0.1:11434', active: false, fallback: false, key: '— none —', calls30d: 990, costCents: 0, skills: null, codeExec: false },
];

export const MODEL_PRICES: any[] = [
  { id: 'pr1', provider: 'OpenAI Production', model: 'gpt-4o', input: 250, output: 1000, cached: 125 },
  { id: 'pr2', provider: 'OpenAI Production', model: 'gpt-4o-mini', input: 15, output: 60, cached: 7 },
  { id: 'pr3', provider: 'Claude (Anthropic)', model: 'claude-3-5-sonnet', input: 300, output: 1500, cached: 30 },
  { id: 'pr4', provider: 'Azure OpenAI (EU)', model: 'gpt-4o', input: 250, output: 1000, cached: null },
];

export const JOB_TYPES = ['AI_GENERATE', 'PUBLISH', 'CONNECTOR_TEST', 'FLOW_RUN', 'THEME_ANALYZE'];
function mkJobs() {
  const out: any[] = [];
  const statuses = ['SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'RUNNING', 'QUEUED', 'FAILED', 'SUCCESS'];
  for (let i = 0; i < 26; i++) {
    const st = statuses[i % statuses.length];
    const type = JOB_TYPES[i % JOB_TYPES.length];
    out.push({
      id: 'job_' + (9300 - i * 7).toString(36),
      type, status: st,
      shop: STORES[i % STORES.length].name,
      attempts: st === 'FAILED' ? 3 : 1,
      durationMs: st === 'QUEUED' ? null : 200 + ((i * 137) % 4200),
      correlationId: 'cor_' + (1000 + i * 13).toString(36) + 'f2',
      created: i < 3 ? `${2 + i}m ago` : i < 10 ? `${i * 6}m ago` : `${Math.floor(i / 2)}h ago`,
      error: st === 'FAILED' ? 'Upstream 502 from provider after 3 retries' : null,
    });
  }
  return out;
}
export const JOBS: any[] = mkJobs();

const API_PATHS: any[] = [
  ['POST', '/api/ai/create-module', 200], ['POST', '/api/publish', 200], ['GET', '/api/agent/modules', 200],
  ['POST', '/api/connectors/test', 502], ['POST', '/api/flow/run', 200], ['POST', '/api/ai/create-module', 429],
  ['GET', '/api/catalog/search', 200], ['POST', '/api/ai/modify-module', 200], ['POST', '/api/rollback', 200],
  ['GET', '/api/data-stores', 200], ['POST', '/api/preview', 200], ['POST', '/api/theme/analyze', 500],
];
function mkApiLogs() {
  return API_PATHS.concat(API_PATHS).map((p: any, i: number) => ({
    id: 'log_' + (5400 - i).toString(36),
    actor: ['MERCHANT', 'INTERNAL', 'WEBHOOK', 'APP_PROXY'][i % 4],
    method: p[0], path: p[1], status: p[2],
    durationMs: 40 + ((i * 91) % 1800),
    shop: STORES[i % STORES.length].domain,
    requestId: 'req_' + (3000 + i * 7).toString(36),
    correlationId: 'cor_' + (1000 + (i % 13) * 13).toString(36) + 'f2',
    success: p[2] < 400,
    created: i < 4 ? `${i + 1}m ago` : `${i * 3}m ago`,
  }));
}
export const API_LOGS: any[] = mkApiLogs();

export const ERROR_LOGS: any[] = [
  { id: 'err_a1', level: 'ERROR', message: 'Provider request failed: 502 Bad Gateway', source: 'API', route: '/api/connectors/test', shop: 'pixel-toys.myshopify.com', created: '3m ago', correlationId: 'cor_rs8f2' },
  { id: 'err_a2', level: 'ERROR', message: 'RecipeSpec validation failed: missing layout.mode', source: 'SERVER', route: '/api/ai/create-module', shop: 'lumen-skincare.myshopify.com', created: '21m ago', correlationId: 'cor_x12f2' },
  { id: 'err_a3', level: 'WARN', message: 'AI response truncated, retrying with smaller schema', source: 'SERVER', route: '/api/ai/create-module', shop: 'bldr-coffee.myshopify.com', created: '44m ago', correlationId: 'cor_aa2f2' },
  { id: 'err_a4', level: 'ERROR', message: 'Uncaught TypeError: cannot read property of undefined', source: 'CLIENT', route: '/modules/mod_a3', shop: 'aurora-threads.myshopify.com', created: '1h ago', correlationId: 'cor_b41f2' },
  { id: 'err_a5', level: 'INFO', message: 'Rate limit applied (429) — backoff scheduled', source: 'API', route: '/api/ai/create-module', shop: 'northpeak-gear.myshopify.com', created: '2h ago', correlationId: 'cor_c90f2' },
  { id: 'err_a6', level: 'ERROR', message: 'Theme analyze worker timeout after 30s', source: 'SERVER', route: '/api/theme/analyze', shop: 'verdant-home.myshopify.com', created: '3h ago', correlationId: 'cor_d33f2' },
];

export const ACTIVITY: any[] = [
  { id: 'act_1', actor: 'MERCHANT', action: 'MODULE_PUBLISHED', resource: 'Sticky Add-to-Cart Bar', shop: 'Aurora Threads', ip: '24.18.x.x', created: '2m ago' },
  { id: 'act_2', actor: 'INTERNAL_ADMIN', action: 'PLAN_CHANGED', resource: 'BLDR Coffee → GROWTH', shop: 'BLDR Coffee Co', ip: '10.0.x.x', created: '14m ago' },
  { id: 'act_3', actor: 'WEBHOOK', action: 'ORDER_CREATED', resource: '#10428', shop: 'Northpeak Gear', ip: 'shopify', created: '18m ago' },
  { id: 'act_4', actor: 'SYSTEM', action: 'JOB_REPLAYED', resource: 'job_2f8a', shop: 'Verdant Home', ip: 'cron', created: '32m ago' },
  { id: 'act_5', actor: 'MERCHANT', action: 'CONNECTOR_CREATED', resource: 'Klaviyo', shop: 'Northpeak Gear', ip: '99.x.x.x', created: '1h ago' },
  { id: 'act_6', actor: 'INTERNAL_ADMIN', action: 'PROVIDER_ACTIVATED', resource: 'OpenAI Production', shop: '—', ip: '10.0.x.x', created: '2h ago' },
  { id: 'act_7', actor: 'CRON', action: 'RETENTION_PURGE', resource: '1,204 rows', shop: '—', ip: 'cron', created: '4h ago' },
  { id: 'act_8', actor: 'MERCHANT', action: 'AI_GENERATE', resource: 'Welcome Popup', shop: 'Aurora Threads', ip: '24.18.x.x', created: '5h ago' },
];

export const PLAN_TIERS: any[] = [
  { id: 'pt_free', name: 'FREE', display: 'Free', price: 0, trialDays: 0, ai: 25, publish: 5, workflows: 0, connectors: 1 },
  { id: 'pt_start', name: 'STARTER', display: 'Starter', price: 19, trialDays: 7, ai: 250, publish: 50, workflows: 5, connectors: 3 },
  { id: 'pt_grow', name: 'GROWTH', display: 'Growth', price: 49, trialDays: 14, ai: 1500, publish: 300, workflows: 25, connectors: 10 },
  { id: 'pt_pro', name: 'PRO', display: 'Pro', price: 149, trialDays: 14, ai: 15000, publish: 3000, workflows: 250, connectors: 50 },
  { id: 'pt_ent', name: 'ENTERPRISE', display: 'Enterprise', price: -1, trialDays: 30, ai: -1, publish: -1, workflows: -1, connectors: -1 },
];

export const CATEGORIES: any[] = [
  { id: 'cat_1', key: 'storefront-ui', display: 'Storefront UI', enabled: true, modules: 142, icon: 'desktop' },
  { id: 'cat_2', key: 'function', display: 'Function', enabled: true, modules: 38, icon: 'bolt' },
  { id: 'cat_3', key: 'integration', display: 'Integration', enabled: true, modules: 51, icon: 'connect' },
  { id: 'cat_4', key: 'flow', display: 'Flow', enabled: true, modules: 24, icon: 'flow' },
  { id: 'cat_5', key: 'data-store', display: 'Data store', enabled: true, modules: 12, icon: 'database' },
  { id: 'cat_6', key: 'experimental', display: 'Experimental', enabled: false, modules: 3, icon: 'magic' },
];

export const TEMPLATES: any[] = [
  { id: 'tpl_1', name: 'Sticky Add-to-Cart Bar', category: 'Storefront UI', tags: ['conversion', 'cart'], uses: 1820, desc: 'Persistent buy bar that follows scroll' },
  { id: 'tpl_2', name: 'Volume Discount Tiers', category: 'Function', tags: ['pricing', 'cart-transform'], uses: 940, desc: '3-tier quantity break pricing function' },
  { id: 'tpl_3', name: 'Klaviyo Event Sync', category: 'Integration', tags: ['email', 'marketing'], uses: 1310, desc: 'Stream order + profile events to Klaviyo' },
  { id: 'tpl_4', name: 'Abandoned Cart Recovery', category: 'Flow', tags: ['automation', 'sms'], uses: 760, desc: 'Multi-step recovery with delays' },
  { id: 'tpl_5', name: 'Product Reviews Store', category: 'Data store', tags: ['reviews', 'social-proof'], uses: 410, desc: 'Custom store + import for reviews' },
  { id: 'tpl_6', name: 'Free Shipping Bar', category: 'Storefront UI', tags: ['conversion'], uses: 2240, desc: 'Progress bar to free-shipping threshold' },
];

export const DATA_STORES: any[] = [
  { id: 'ds_1', key: 'orders', name: 'Orders', kind: 'predefined', enabled: true, records: 8420, desc: 'Synced order events', store: 'Northpeak Gear', storeId: 'shp_4f90' },
  { id: 'ds_2', key: 'customers', name: 'Customers', kind: 'predefined', enabled: true, records: 3110, desc: 'Customer profiles + tags', store: 'Northpeak Gear', storeId: 'shp_4f90' },
  { id: 'ds_3', key: 'products', name: 'Products', kind: 'predefined', enabled: true, records: 612, desc: 'Catalog snapshot', store: 'Aurora Threads', storeId: 'shp_8x21' },
  { id: 'ds_4', key: 'reviews', name: 'Product Reviews', kind: 'custom', enabled: true, records: 1840, desc: 'Imported review records', store: 'Verdant Home', storeId: 'shp_9b02' },
  { id: 'ds_5', key: 'waitlist', name: 'Back-in-stock Waitlist', kind: 'custom', enabled: true, records: 290, desc: 'Email waitlist by variant', store: 'Forge Supply', storeId: 'shp_2k44' },
  { id: 'ds_6', key: 'wholesale', name: 'Wholesale Applications', kind: 'custom', enabled: false, records: 0, desc: 'B2B intake form submissions', store: 'Forge Supply', storeId: 'shp_2k44' },
  { id: 'ds_7', key: 'analytics', name: 'Analytics', kind: 'predefined', enabled: true, records: 14200, desc: 'Custom events + metrics', store: 'Verdant Home', storeId: 'shp_9b02' },
  { id: 'ds_8', key: 'campaigns', name: 'Campaigns', kind: 'custom', enabled: true, records: 76, desc: 'Marketing campaign records', store: 'Lumen Skincare', storeId: 'shp_1a55' },
];

export const STORE_RECORDS: any[] = [
  { id: 'rec_1', title: 'Aurora Hoodie — 5★', externalId: 'rv_8821', date: '2026-06-14', payload: '{"rating":5,"author":"Mia K.","body":"Softest hoodie ever."}' },
  { id: 'rec_2', title: 'Trail Pack — 4★', externalId: 'rv_8822', date: '2026-06-14', payload: '{"rating":4,"author":"Theo R.","body":"Great but straps a bit thin."}' },
  { id: 'rec_3', title: 'Glow Serum — 5★', externalId: 'rv_8823', date: '2026-06-13', payload: '{"rating":5,"author":"Asha P.","body":"Visible results in a week."}' },
  { id: 'rec_4', title: 'Camp Mug — 3★', externalId: 'rv_8824', date: '2026-06-13', payload: '{"rating":3,"author":"Jon D.","body":"Keeps heat ok, handle small."}' },
];

export const CONNECTORS: any[] = [
  { id: 'con_1', name: 'Klaviyo', baseUrl: 'https://a.klaviyo.com/api', auth: 'API_KEY', endpoints: 6, lastTested: '6h ago', lastStatus: 200, status: 'CONNECTED' },
  { id: 'con_2', name: 'Slack Alerts', baseUrl: 'https://hooks.slack.com', auth: 'API_KEY', endpoints: 2, lastTested: '2d ago', lastStatus: 200, status: 'CONNECTED' },
  { id: 'con_3', name: 'Internal WMS', baseUrl: 'https://wms.internal.io/v2', auth: 'BASIC', endpoints: 9, lastTested: '5m ago', lastStatus: 502, status: 'ERROR' },
  { id: 'con_4', name: 'Stripe Billing', baseUrl: 'https://api.stripe.com/v1', auth: 'OAUTH2', endpoints: 4, lastTested: '1d ago', lastStatus: 200, status: 'CONNECTED' },
];

export const FLOWS: any[] = [
  { id: 'flo_1', name: 'Order → Slack alert', trigger: 'order/created', steps: 3, runs7d: 412, status: 'ACTIVE', lastRun: '8m ago', store: 'Aurora Threads', storeId: 'shp_8x21', fails7d: 2 },
  { id: 'flo_2', name: 'New review → tag product', trigger: 'record/created', steps: 4, runs7d: 88, status: 'ACTIVE', lastRun: '1h ago', store: 'Verdant Home', storeId: 'shp_9b02', fails7d: 0 },
  { id: 'flo_3', name: 'Cart abandoned → SMS', trigger: 'workflow/completed', steps: 5, runs7d: 0, status: 'DRAFT', lastRun: '—', store: 'Northpeak Gear', storeId: 'shp_4f90', fails7d: 0 },
  { id: 'flo_4', name: 'Low stock → WMS sync', trigger: 'connector/synced', steps: 2, runs7d: 33, status: 'ACTIVE', lastRun: '3h ago', store: 'Forge Supply', storeId: 'shp_2k44', fails7d: 5 },
  { id: 'flo_5', name: 'New customer → welcome email', trigger: 'customer/created', steps: 3, runs7d: 154, status: 'ACTIVE', lastRun: '22m ago', store: 'Lumen Skincare', storeId: 'shp_1a55', fails7d: 1 },
  { id: 'flo_6', name: 'Daily sales digest', trigger: 'schedule/cron', steps: 4, runs7d: 7, status: 'PAUSED', lastRun: '2d ago', store: 'Verdant Home', storeId: 'shp_9b02', fails7d: 0 },
];

export const WEBHOOKS: any[] = [
  { id: 'wh_1', topic: 'orders/create', shop: 'northpeak-gear.myshopify.com', eventId: 'evt_88a1', success: true, created: '8m ago' },
  { id: 'wh_2', topic: 'products/update', shop: 'aurora-threads.myshopify.com', eventId: 'evt_88a2', success: true, created: '24m ago' },
  { id: 'wh_3', topic: 'customers/data_request', shop: 'lumen-skincare.myshopify.com', eventId: 'evt_88a3', success: true, created: '1h ago' },
  { id: 'wh_4', topic: 'fulfillments/create', shop: 'verdant-home.myshopify.com', eventId: 'evt_88a4', success: false, created: '2h ago' },
  { id: 'wh_5', topic: 'app/uninstalled', shop: 'wildflower-co.myshopify.com', eventId: 'evt_88a5', success: true, created: '5h ago' },
];

export const AI_ACCOUNTS: any[] = [
  { id: 'ac1', name: 'OpenAI — Platform', email: 'ops@superapp.ai', balance: '$1,240.00', keys: 3, status: 'ACTIVE', provider: 'OPENAI' },
  { id: 'ac2', name: 'Anthropic Console', email: 'ops@superapp.ai', balance: '$880.00', keys: 2, status: 'ACTIVE', provider: 'ANTHROPIC' },
  { id: 'ac3', name: 'Azure Subscription', email: 'cloud@superapp.ai', balance: 'Committed', keys: 1, status: 'ACTIVE', provider: 'AZURE_OPENAI' },
  { id: 'ac4', name: 'Modal (Qwen host)', email: 'cloud@superapp.ai', balance: '$120.00', keys: 1, status: 'ACTIVE', provider: 'CUSTOM' },
];

// Platform-level rollups used by the dashboard KPI layer.
export const PLATFORM: any = {
  mrr: 9420, mrrDelta: 6.2, arpu: 38, ltv: 1180,
  installs7d: 6, installs30d: 19, trials: 1, trialConv: 38, churn30d: 1.4, churnStores: 1,
  netNew30d: 14, aiCostMonth: 4820, costPerCall: 8.9, grossMargin: 71,
  mrrSeries: [6200, 6500, 6750, 7050, 7400, 7900, 8250, 8650, 9050, 9420],
  installSeries: [1, 2, 1, 3, 2, 4, 2, 3, 1, 1],
};

export const ASSISTANT_SESSIONS: any[] = [
  { id: 'ses_1', title: 'Why did publish job fail?', mode: 'local', updated: '5m ago', messages: 8 },
  { id: 'ses_2', title: 'Summarize 24h error spike', mode: 'cloud', updated: '2h ago', messages: 14 },
  { id: 'ses_3', title: 'Draft plan-tier copy', mode: 'local', updated: 'Yesterday', messages: 6 },
  { id: 'ses_4', title: 'Trace cor_rs8f2 timeline', mode: 'local', updated: '2d ago', messages: 11 },
];

export const ASSISTANT_THREAD: any[] = [
  { role: 'user', text: 'Why did the publish job for Northpeak Gear fail this morning?' },
  { role: 'assistant', text: 'I pulled the job + trace. Job `job_2f8a` (PUBLISH) failed after 3 attempts with an upstream **502 Bad Gateway** from the theme assets API.\n\nThe correlated API log `log_5400` shows the request started at 09:14 and the provider connection dropped mid-write. This is a transient upstream failure, not a RecipeSpec problem — the spec validated cleanly.', tools: ['get_job', 'get_trace'] },
  { role: 'assistant', text: 'Recommendation: **Replay** the job — the payload is intact and the theme API recovered at 09:31 (subsequent publishes for the same shop succeeded). Want me to summarize the other 2 failed jobs in the DLQ?' },
];

export const USAGE_ROWS: any[] = STORES.slice(0, 6).map((s, i) => ({
  id: 'use_' + i, shop: s.name, action: ['RECIPE_GENERATION', 'MAPPING_SUGGESTION', 'MODIFY_MODULE', 'HYDRATE'][i % 4],
  tokensIn: 1200 + i * 800, tokensOut: 600 + i * 400, costCents: 40 + i * 35, provider: s.provider, created: `${i + 1}h ago`,
}));

// ---------- Customers / Merchants directory (commercial view, derived from STORES) ----------
const LIFECYCLE: Record<string, string> = { ACTIVE: 'Customer', TRIAL: 'Trialing', EXPIRED: 'Churned' };
export const CUSTOMERS: any[] = STORES.map((s, i) => {
  const tier = PLAN_TIERS.find((p) => p.name === s.plan);
  const mrr = s.status === 'EXPIRED' ? 0 : (tier && tier.price > 0 ? tier.price : (s.plan === 'ENTERPRISE' ? 1200 : 0));
  return {
    id: 'cus_' + s.id.replace('shp_', ''), storeId: s.id, name: s.owner, store: s.name, domain: s.domain,
    email: s.owner.toLowerCase().replace(/[^a-z]+/g, '.') + '@' + s.domain.split('.')[0] + '.com',
    plan: s.plan, lifecycle: LIFECYCLE[s.status] || 'Customer', mrr, country: s.country,
    signed: s.installedAt, lastActive: ['2m ago', '1h ago', '3h ago', 'Today', 'Yesterday', '2d ago', '3w ago', '5h ago'][i % 8],
    seats: [1, 3, 1, 2, 6, 1, 1, 4][i % 8], tickets: [0, 1, 0, 2, 0, 0, 3, 1][i % 8],
  };
});

// ---------- Detail synthesizers (deterministic, derived from the entity) ----------
export function moduleVersions(m: any) {
  const out: any[] = [];
  for (let v = m.version; v >= 1; v--) {
    out.push({
      version: v, status: v === m.version ? m.status : 'PUBLISHED', active: v === m.version && m.status !== 'DRAFT',
      diff: v === m.version ? 'Current revision' : ['Adjusted spacing + tokens', 'Fixed mobile layout', 'Added variant selector', 'Initial generation', 'Copy tweaks', 'Perf: lazy-load assets'][v % 6],
      created: v === m.version ? m.updated : (m.version - v) + 'd ago',
      publishedAt: v === m.version && m.status === 'DRAFT' ? null : (m.version - v) + 'd ago',
    });
  }
  return out;
}
export function moduleSpec(m: any) {
  return JSON.stringify({ type: m.type.toUpperCase().replace(/ /g, '_'), category: m.category, name: m.name,
    layout: { mode: 'BLOCK', surface: m.type === 'Function' ? 'CHECKOUT' : 'PRODUCT' },
    settings: { schema: ['title', 'enabled', 'theme'], defaults: { enabled: true, theme: 'auto' } },
    source: m.source, version: m.version }, null, 2);
}
export function flowSteps(f: any) {
  const kinds = ['trigger', 'condition', 'action', 'transform', 'action', 'end'];
  const names: Record<string, string> = { 'order/created': 'Order created', 'record/created': 'Record created', 'workflow/completed': 'Workflow completed', 'connector/synced': 'Connector synced', 'customer/created': 'Customer created', 'schedule/cron': 'Schedule (cron)' };
  const actions = ['Send to Slack', 'Write to store', 'Send notification', 'Tag order', 'Send HTTP', 'Branch on value'];
  const out: any[] = [{ stepId: 'n0', nodeType: 'trigger', nodeName: names[f.trigger] || f.trigger, status: 'SUCCESS', durationMs: 4 }];
  for (let i = 1; i < f.steps; i++) {
    out.push({ stepId: 'n' + i, nodeType: kinds[i % kinds.length], nodeName: actions[(i + f.steps) % actions.length],
      status: f.status === 'DRAFT' ? 'PENDING' : (f.fails7d && i === f.steps - 1 && f.id === 'flo_4' ? 'FAILED' : 'SUCCESS'),
      durationMs: 20 + i * 45 });
  }
  return out;
}
export function flowRuns(f: any) {
  if (f.status === 'DRAFT') return [];
  const out: any[] = [];
  const n = Math.min(8, Math.max(3, Math.round(f.runs7d / 8) || 3));
  for (let i = 0; i < n; i++) {
    const failed = f.fails7d && i < f.fails7d && i < 2;
    out.push({ id: 'run_' + f.id + '_' + i, status: failed ? 'FAILED' : 'SUCCEEDED',
      trigger: f.trigger, durationMs: 200 + i * 120 + (failed ? 4000 : 0),
      started: i === 0 ? f.lastRun : (i * 3 + 2) + 'h ago', steps: f.steps,
      error: failed ? 'Action step timed out after 30s (upstream 502)' : null });
  }
  return out;
}
export function connectorEndpoints(c: any) {
  const presets: Record<string, any[]> = {
    Klaviyo: [['List members', '/v2/list/{id}/members', 'GET'], ['Track event', '/track', 'POST'], ['Identify', '/identify', 'POST'], ['Profiles', '/api/profiles', 'GET'], ['Metrics', '/api/metrics', 'GET'], ['Campaigns', '/api/campaigns', 'GET']],
    'Slack Alerts': [['Post message', '/services/{hook}', 'POST'], ['Post block', '/services/{hook}/block', 'POST']],
    'Internal WMS': [['Stock levels', '/inventory', 'GET'], ['Reserve', '/reserve', 'POST'], ['Ship', '/ship', 'POST'], ['Cancel', '/cancel/{id}', 'DELETE'], ['Locations', '/locations', 'GET'], ['Adjust', '/adjust', 'POST'], ['Batch', '/batch', 'POST'], ['Webhook', '/hooks', 'POST'], ['Status', '/status', 'GET']],
    'Stripe Billing': [['Create charge', '/charges', 'POST'], ['Get customer', '/customers/{id}', 'GET'], ['Subscriptions', '/subscriptions', 'GET'], ['Refund', '/refunds', 'POST']],
    'Recharge Subscriptions': [['Subscriptions', '/subscriptions', 'GET'], ['Charges', '/charges', 'GET'], ['Customers', '/customers', 'GET'], ['Address', '/addresses/{id}', 'PUT'], ['Cancel', '/subscriptions/{id}/cancel', 'POST']],
    'Custom 3PL': [['Create shipment', '/shipments', 'POST'], ['Track', '/track/{id}', 'GET'], ['Rates', '/rates', 'GET']],
  };
  const verbs = ['GET', 'POST', 'PUT', 'DELETE'];
  let base: any[] = presets[c.name] || [];
  while (base.length < c.endpoints) { const n = base.length + 1; base = base.concat([['Operation ' + n, '/op/' + n, verbs[n % verbs.length]]]); }
  return base.slice(0, c.endpoints).map((e: any, i: number) => ({ id: c.id + '_ep' + i, name: e[0], path: e[1], method: e[2],
    lastStatus: i === 0 ? c.lastStatus : (c.status === 'ERROR' && i === 1 ? c.lastStatus : 200),
    lastTested: i === 0 ? c.lastTested : (i + 1) + 'd ago' }));
}
export function connectorTests(c: any) {
  const eps = connectorEndpoints(c);
  const out: any[] = [];
  for (let i = 0; i < 6; i++) {
    const ok = !(c.status === 'ERROR' && i === 0);
    const ep = (eps.length ? eps[i % eps.length] : null) || { name: 'Endpoint' };
    out.push({ id: c.id + '_t' + i, status: ok ? 200 : c.lastStatus, ok, durationMs: 80 + i * 40,
      when: i === 0 ? c.lastTested : (i + 1) + 'd ago', endpoint: ep.name });
  }
  return out;
}
export function dataStoreRecords(d: any) {
  if (!d.records) return [];
  const samples: Record<string, any[]> = {
    reviews: [['Aurora Hoodie — 5★', '{"rating":5,"author":"Mia K.","body":"Softest hoodie ever."}'], ['Trail Pack — 4★', '{"rating":4,"author":"Theo R.","body":"Great but straps thin."}'], ['Glow Serum — 5★', '{"rating":5,"author":"Asha P.","body":"Results in a week."}']],
    orders: [['#10428', '{"total":"84.00","items":3,"status":"paid"}'], ['#10427', '{"total":"22.50","items":1,"status":"fulfilled"}'], ['#10426', '{"total":"156.00","items":5,"status":"paid"}']],
    waitlist: [['Charcoal Tee / M', '{"email":"sam@x.com","variant":"M"}'], ['Trail Pack / OS', '{"email":"jo@x.com","variant":"OS"}']],
  };
  const base = samples[d.key] || [['Record A', '{"value":1}'], ['Record B', '{"value":2}'], ['Record C', '{"value":3}']];
  return base.map((r: any, i: number) => ({ id: 'rec_' + d.key + '_' + i, title: r[0], externalId: 'ext_' + (8800 + i), payload: r[1], created: (i + 1) + 'd ago' }));
}
export function jobPayload(j: any) {
  const sid = (STORES.find((s) => s.name === j.shop) || {}).id || 'shp_x';
  return JSON.stringify({ type: j.type, shopId: sid, correlationId: j.correlationId,
    params: j.type === 'AI_GENERATE' ? { prompt: 'Generate module from template', provider: 'OPENAI' } : j.type === 'PUBLISH' ? { moduleId: 'mod_a1', target: 'live-theme' } : { ref: 'auto' } }, null, 2);
}
export function jobAttempts(j: any) {
  const out: any[] = [];
  for (let i = 1; i <= (j.attempts || 1); i++) {
    const last = i === j.attempts;
    out.push({ n: i, status: last && j.status === 'FAILED' ? 'FAILED' : last ? j.status : 'FAILED',
      durationMs: j.durationMs ? Math.round(j.durationMs / j.attempts) : 300, when: (j.attempts - i) * 2 + 'm ago',
      detail: last && j.status === 'FAILED' ? j.error : last ? 'Completed' : 'Upstream 502 — retry scheduled' });
  }
  return out;
}
export function webhookPayload(w: any) {
  return JSON.stringify({ topic: w.topic, shop_domain: w.shop, webhook_id: w.eventId,
    payload: { id: 8800000 + parseInt((w.eventId || '').replace(/\D/g, '') || '1', 10), created_at: '2026-06-15T09:14:02Z', test: false } }, null, 2);
}

// ---------- Global search index ----------
export function buildSearchIndex(mode: 'admin' | 'merchant') {
  const idx: any[] = [];
  STORES.forEach((s) => idx.push({ type: 'Store', icon: 'store', title: s.name, sub: s.domain, route: '#/admin/stores/' + s.id, kw: s.domain + ' ' + s.plan }));
  const adminMode = mode === 'admin';
  MODULES.forEach((m) => idx.push({ type: 'Module', icon: 'layers', title: m.name, sub: m.store + ' · ' + m.type, route: (adminMode ? '#/admin/modules/' : '#/app/modules/') + m.id, kw: m.summary + ' ' + m.category }));
  PROVIDERS.forEach((p) => idx.push({ type: 'Provider', icon: 'connect', title: p.name, sub: p.model, route: '#/admin/ai-providers', kw: p.provider }));
  JOBS.slice(0, 12).forEach((j) => idx.push({ type: 'Job', icon: 'work', title: j.id, sub: titleCase(j.type) + ' · ' + j.shop, route: '#/admin/jobs/' + j.id, kw: j.correlationId + ' ' + j.status }));
  CONNECTORS.forEach((c) => idx.push({ type: 'Connector', icon: 'connect', title: c.name, sub: c.baseUrl, route: (adminMode ? '#/admin/connectors/' : '#/app/connectors/') + c.id, kw: c.auth }));
  FLOWS.forEach((f) => idx.push({ type: 'Flow', icon: 'flow', title: f.name, sub: 'Trigger: ' + f.trigger, route: (adminMode ? '#/admin/flows/' + f.id : '#/app/flows'), kw: f.trigger }));
  TEMPLATES.forEach((t) => idx.push({ type: 'Template', icon: 'template', title: t.name, sub: t.category, route: '#/admin/templates', kw: t.tags.join(' ') }));
  DATA_STORES.forEach((d) => idx.push({ type: 'Data store', icon: 'database', title: d.name, sub: d.records + ' records', route: (adminMode ? '#/admin/data-stores/' + d.key : '#/app/data/' + d.key), kw: d.desc }));
  if (adminMode) CUSTOMERS.forEach((c) => idx.push({ type: 'Customer', icon: 'user', title: c.name, sub: c.store + ' · ' + c.email, route: '#/admin/customers/' + c.id, kw: c.domain + ' ' + c.plan }));
  // pages
  [['Dashboard', '#/admin', 'home'], ['AI Assistant', '#/admin/ai-assistant', 'chat'], ['Activity Log', '#/admin/activity', 'live'],
   ['API Logs', '#/admin/api-logs', 'table'], ['Error Logs', '#/admin/logs', 'bug'], ['Plan Tiers', '#/admin/plan-tiers', 'plan'],
   ['Usage & Costs', '#/admin/usage', 'chart'], ['Settings', '#/admin/settings', 'settings'],
   ['Home', '#/app', 'home'], ['AI Modules', '#/app/modules', 'layers'], ['Flows', '#/app/flows', 'flow'],
   ['Connectors', '#/app/connectors', 'connect'], ['Data', '#/app/data', 'database'], ['Templates', '#/app/templates', 'template'],
   ['Analytics', '#/app/analytics', 'chart'], ['Activity', '#/app/activity', 'live'], ['Help & guides', '#/app/help', 'question'],
   ['Billing', '#/app/billing', 'plan'], ['Settings', '#/app/settings', 'settings']].forEach((p) => idx.push({ type: 'Page', icon: p[2], title: p[0], sub: 'Go to page', route: p[1], kw: '' }));
  // Each dashboard only searches its own surface — no cross-surface results.
  if (mode === 'admin') return idx.filter((r) => r.route.startsWith('#/admin'));
  if (mode === 'merchant') return idx.filter((r) => r.route.startsWith('#/app'));
  return idx;
}
