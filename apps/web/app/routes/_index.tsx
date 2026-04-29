import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useCallback, useEffect, useState } from 'react';
import {
  Page, BlockStack, Text, Badge, InlineStack, Button, Box, TextField, Select,
  DataTable,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';

const STORAGE_KEY_METRICS = 'dashboard-custom-metrics';
const STORAGE_KEY_MODE = 'dashboard-analytics-mode';

type AnalyticsMode = 'values' | 'line' | 'bar';

interface CustomMetric {
  id: string;
  name: string;
  value: number;
}

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const quota = new QuotaService();

  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const since30d = new Date(Date.now() - 30 * 86400000);

  const [
    moduleCount,
    publishedCount,
    draftCount,
    connectorCount,
    scheduleCount,
    sub,
    last30Jobs,
    allModules,
    usage,
  ] = await Promise.all([
    prisma.module.count({ where: { shopId: shopRow.id } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'DRAFT' } }),
    prisma.connector.count({ where: { shopId: shopRow.id } }),
    prisma.flowSchedule.count({ where: { shopId: shopRow.id } }),
    prisma.appSubscription.findFirst({ where: { shopId: shopRow.id, status: 'ACTIVE' } }),
    prisma.job.findMany({ where: { shopId: shopRow.id, createdAt: { gte: since30d } }, select: { status: true } }),
    prisma.module.findMany({ where: { shopId: shopRow.id }, select: { createdAt: true }, orderBy: { createdAt: 'desc' } }),
    quota.getUsageSummary(shopRow.id),
  ]);

  const successJobs = last30Jobs.filter(j => j.status === 'SUCCESS').length;
  const failedJobs = last30Jobs.filter(j => j.status === 'FAILED').length;
  const otherJobs = last30Jobs.length - successJobs - failedJobs;
  const successRate = last30Jobs.length > 0 ? Math.round((successJobs / last30Jobs.length) * 100) : 100;

  const now = new Date();
  const dailyCounts: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dailyCounts.push(allModules.filter(m => { const c = new Date(m.createdAt); return c >= dayStart && c < dayEnd; }).length);
  }

  const aiLimit = usage.quotas?.aiRequestsPerMonth ?? 0;
  const pubLimit = usage.quotas?.publishOpsPerMonth ?? 0;

  return json({
    shop: session.shop,
    stats: {
      modules: moduleCount,
      published: publishedCount,
      drafts: draftCount,
      connectors: connectorCount,
      schedules: scheduleCount,
      planName: sub?.planName ?? 'Free',
      successRate,
      totalJobs30d: last30Jobs.length,
      failedJobs30d: failedJobs,
      successJobs30d: successJobs,
      otherJobs30d: otherJobs,
    },
    usage: {
      aiRequests: usage.used?.aiRequests ?? 0,
      aiLimit: aiLimit === -1 ? null : aiLimit,
      publishOps: usage.used?.publishOps ?? 0,
      publishLimit: pubLimit === -1 ? null : pubLimit,
      workflowRuns: usage.used?.workflowRuns ?? 0,
      connectorCalls: usage.used?.connectorCalls ?? 0,
    },
    dailyCounts,
  });
}

function LineChart({ data }: { data: number[]; labels: string[] }) {
  if (data.length === 0) return null;
  const w = 400;
  const h = 100;
  const pad = { t: 8, r: 8, b: 8, l: 8 };
  const max = Math.max(...data, 1);
  const divisor = data.length <= 1 ? 1 : data.length - 1;
  const points = data.map((v, i) => {
    const x = pad.l + (i / divisor) * (w - pad.l - pad.r);
    const y = h - pad.b - (v / max) * (h - pad.t - pad.b);
    return `${x},${y}`;
  });
  const pathD = points.length > 0 ? `M ${points.join(' L ')}` : '';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="Dashboard-analyticsLineSvg" preserveAspectRatio="none" aria-hidden>
      <path d={pathD} fill="none" stroke="var(--p-color-bg-fill-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SuccessGauge({ value }: { value: number }) {
  const r = 36;
  const stroke = 6;
  const circumference = 2 * Math.PI * (r - stroke / 2);
  const offset = circumference - (value / 100) * circumference;
  const tone = value >= 90 ? 'success' : value >= 70 ? 'caution' : 'critical';
  const color = tone === 'success' ? 'var(--p-color-bg-fill-success)' : tone === 'caution' ? 'var(--p-color-bg-fill-caution)' : 'var(--p-color-bg-fill-critical)';
  return (
    <div className="Dashboard-gaugeWrap">
      <svg viewBox="0 0 80 80" className="Dashboard-gaugeSvg">
        <circle cx="40" cy="40" r={r - stroke / 2} fill="none" stroke="var(--p-color-bg-fill-secondary)" strokeWidth={stroke} />
        <circle cx="40" cy="40" r={r - stroke / 2} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 40 40)" />
      </svg>
      <span className="Dashboard-gaugeValue">{value}%</span>
    </div>
  );
}

function loadStoredMetrics(): CustomMetric[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_METRICS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is CustomMetric => typeof m?.id === 'string' && typeof m?.name === 'string' && typeof m?.value === 'number');
  } catch {
    return [];
  }
}

function loadStoredMode(): AnalyticsMode {
  if (typeof window === 'undefined') return 'values';
  const v = localStorage.getItem(STORAGE_KEY_MODE);
  if (v === 'line' || v === 'bar' || v === 'values') return v;
  return 'values';
}

export default function Dashboard() {
  const { shop, stats, usage, dailyCounts } = useLoaderData<typeof loader>();

  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([]);
  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>('values');
  const [addMetricName, setAddMetricName] = useState('');
  const [addMetricValue, setAddMetricValue] = useState('');
  const [showAddMetric, setShowAddMetric] = useState(false);

  useEffect(() => {
    setCustomMetrics(loadStoredMetrics());
    setAnalyticsMode(loadStoredMode());
  }, []);

  const persistCustomMetrics = useCallback((next: CustomMetric[]) => {
    setCustomMetrics(next);
    try {
      localStorage.setItem(STORAGE_KEY_METRICS, JSON.stringify(next));
    } catch { /* ignore */ }
  }, []);

  const persistMode = useCallback((mode: AnalyticsMode) => {
    setAnalyticsMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY_MODE, mode);
    } catch { /* ignore */ }
  }, []);

  const handleAddMetric = useCallback(() => {
    const name = addMetricName.trim();
    const value = Number(addMetricValue);
    if (!name || Number.isNaN(value)) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    persistCustomMetrics([...customMetrics, { id, name, value }]);
    setAddMetricName('');
    setAddMetricValue('');
    setShowAddMetric(false);
  }, [addMetricName, addMetricValue, customMetrics, persistCustomMetrics]);

  const removeCustomMetric = useCallback((id: string) => {
    persistCustomMetrics(customMetrics.filter(m => m.id !== id));
  }, [customMetrics, persistCustomMetrics]);

  const storeName = shop.split('.')[0];
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  });

  const maxDaily = Math.max(...dailyCounts, 1);

  const builtInForCards: { label: string; displayValue: string }[] = [
    { label: 'Modules', displayValue: String(stats.modules) },
    { label: 'Published', displayValue: String(stats.published) },
    { label: 'Drafts', displayValue: String(stats.drafts) },
    { label: 'Connectors', displayValue: String(stats.connectors) },
    { label: 'Schedules', displayValue: String(stats.schedules) },
    { label: 'Jobs (30d)', displayValue: String(stats.totalJobs30d) },
    { label: 'Success rate', displayValue: `${stats.successRate}%` },
    { label: 'AI requests', displayValue: usage.aiLimit != null ? `${usage.aiRequests} / ${usage.aiLimit}` : String(usage.aiRequests) },
    { label: 'Publish ops', displayValue: usage.publishLimit != null ? `${usage.publishOps} / ${usage.publishLimit}` : String(usage.publishOps) },
  ];

  const numericMetrics: { label: string; value: number }[] = [
    { label: 'Modules', value: stats.modules },
    { label: 'Published', value: stats.published },
    { label: 'Drafts', value: stats.drafts },
    { label: 'Connectors', value: stats.connectors },
    { label: 'Schedules', value: stats.schedules },
    { label: 'Jobs (30d)', value: stats.totalJobs30d },
    { label: 'Success rate', value: stats.successRate },
    { label: 'AI requests', value: usage.aiRequests },
    { label: 'Publish ops', value: usage.publishOps },
    ...customMetrics.map(m => ({ label: m.name, value: m.value })),
  ];

  const statusRows = [
    { label: 'Success', value: stats.successJobs30d, tone: 'var(--p-color-bg-fill-success)' },
    { label: 'Failed', value: stats.failedJobs30d, tone: 'var(--p-color-bg-fill-critical)' },
    { label: 'Other', value: stats.otherJobs30d, tone: 'var(--p-color-bg-fill-caution)' },
  ];
  const maxStatus = Math.max(...statusRows.map((r) => r.value), 1);

  const capabilities = [
    { label: 'Popup', desc: 'Discount / exit-intent / newsletter', icon: '🪟' },
    { label: 'Banner', desc: 'Hero banners with CTA', icon: '🖼️' },
    { label: 'Announcement bar', desc: 'Sticky top-of-page notices', icon: '📢' },
    { label: 'Floating widget', desc: 'WhatsApp, chat, scroll-to-top', icon: '💬' },
    { label: 'Seasonal effect', desc: 'Snowfall, confetti overlay', icon: '❄️' },
    { label: 'Checkout upsell', desc: 'Add-on blocks at checkout', icon: '🛒' },
    { label: 'Discount function', desc: 'VIP, tiered, BOGO rules', icon: '🏷️' },
    { label: 'Automation flow', desc: 'Tag orders, send emails', icon: '⚡' },
  ];

  return (
    <Page title="Dashboard" fullWidth>
      <div className="Dashboard-root">
        <style>{`
          .Dashboard-root { --dashboard-gap: 28px; padding-bottom: 50px; }
          .Dashboard-hero {
            padding: 28px 32px;
            background: var(--p-color-bg-surface);
            border: 1px solid var(--p-color-border);
            border-radius: 16px;
            margin-bottom: var(--dashboard-gap);
          }
          .Dashboard-heroTitle { font-size: 1.375rem; font-weight: 700; letter-spacing: 0.02em; margin: 0 0 8px 0; color: var(--p-color-text); }
          .Dashboard-heroSub { font-size: 0.9375rem; color: var(--p-color-text-subdued); margin: 0; line-height: 1.4; }
          .Dashboard-sectionTitle {
            font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
            color: var(--p-color-text-subdued); margin: 0 0 14px 0; line-height: 1.2;
          }
          .Dashboard-kpiSection {
            margin-bottom: var(--dashboard-gap);
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
          .Dashboard-kpiSection .Dashboard-sectionTitle { margin-bottom: 4px; }
          .Dashboard-kpiGrid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 10px;
            width: 100%;
          }
          @media (min-width: 480px) {
            .Dashboard-kpiGrid { grid-template-columns: repeat(3, 1fr); }
          }
          @media (min-width: 720px) {
            .Dashboard-kpiGrid { grid-template-columns: repeat(4, 1fr); }
          }
          @media (min-width: 960px) {
            .Dashboard-kpiGrid { grid-template-columns: repeat(5, 1fr); }
          }
          .Dashboard-kpiCard {
            padding: 10px 12px;
            background: var(--p-color-bg-surface);
            border: 1px solid var(--p-color-border);
            border-radius: 10px;
          }
          .Dashboard-kpiLabel { font-size: 0.625rem; color: var(--p-color-text-subdued); margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; line-height: 1.2; }
          .Dashboard-kpiValue { font-size: 1.125rem; font-weight: 700; margin: 0; line-height: 1.2; letter-spacing: -0.02em; }
          .Dashboard-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--dashboard-gap); }
          @media (max-width: 768px) { .Dashboard-grid2 { grid-template-columns: 1fr; } }
          .Dashboard-panel {
            padding: 24px 26px;
            background: var(--p-color-bg-surface);
            border: 1px solid var(--p-color-border);
            border-radius: 12px;
          }
          .Dashboard-panelTitle { font-size: 1rem; font-weight: 600; margin: 0 0 16px 0; color: var(--p-color-text); }
          .Dashboard-panelFooter { margin-top: 18px; }
          .Dashboard-barChart { display: flex; align-items: flex-end; gap: 10px; height: 72px; margin-top: 12px; }
          .Dashboard-bar { flex: 1; min-width: 0; background: linear-gradient(180deg, var(--p-color-bg-fill-info) 0%, var(--p-color-bg-fill-info-secondary) 100%); border-radius: 6px 6px 0 0; transition: height 0.2s; }
          .Dashboard-bar:last-child { background: linear-gradient(180deg, var(--p-color-bg-fill-success) 0%, #b3e0d0 100%); }
          .Dashboard-barLabels { display: flex; gap: 10px; margin-top: 6px; }
          .Dashboard-barLabelCell { flex: 1; min-width: 0; text-align: center; }
          .Dashboard-gaugeWrap { position: relative; width: 80px; height: 80px; margin: 12px auto 0; }
          .Dashboard-gaugeSvg { width: 100%; height: 100%; }
          .Dashboard-gaugeValue { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 700; color: var(--p-color-text); }
          .Dashboard-statusRow { margin-top: 8px; display: grid; gap: 8px; }
          .Dashboard-statusItem { display: grid; grid-template-columns: 90px 1fr 40px; gap: 8px; align-items: center; font-size: 0.75rem; color: var(--p-color-text-subdued); }
          .Dashboard-statusTrack { background: var(--p-color-bg-fill-secondary); border-radius: 999px; height: 8px; overflow: hidden; }
          .Dashboard-statusFill { display: block; height: 100%; border-radius: 999px; }
          .Dashboard-capSection { display: flex; flex-direction: column; gap: 16px; }
          .Dashboard-capGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 18px; }
          .Dashboard-capCard {
            padding: 20px 22px;
            background: var(--p-color-bg-surface-secondary);
            border: 1px solid var(--p-color-border);
            border-radius: 12px;
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            gap: 16px;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          .Dashboard-capCard:hover { border-color: var(--p-color-border-hover); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
          .Dashboard-capIcon {
            flex-shrink: 0;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--p-color-bg-surface);
            border: 1px solid var(--p-color-border-subdued);
            border-radius: 12px;
            font-size: 1.375rem;
            line-height: 1;
          }
          .Dashboard-capText { flex: 1; min-width: 0; }
          .Dashboard-capLabel { font-size: 0.9375rem; font-weight: 600; margin: 0 0 6px 0; color: var(--p-color-text); }
          .Dashboard-capDesc { font-size: 0.8125rem; color: var(--p-color-text-subdued); margin: 0; line-height: 1.4; }
          .Dashboard-quickGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; align-items: stretch; }
          .Dashboard-quickCard {
            padding: 20px;
            background: var(--p-color-bg-surface);
            border: 1px solid var(--p-color-border);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 100%;
          }
          .Dashboard-quickCardContent { flex: 1; min-height: 0; }
          .Dashboard-quickCard h3 { font-size: 0.9375rem; font-weight: 600; margin: 0 0 6px 0; color: var(--p-color-text); }
          .Dashboard-quickCard p { font-size: 0.8125rem; color: var(--p-color-text-subdued); margin: 0; line-height: 1.4; }
          .Dashboard-analyticsLine { height: 120px; margin-top: 8px; }
          .Dashboard-analyticsLineSvg { width: 100%; height: 100%; display: block; }
          .Dashboard-analyticsBarChart { display: flex; align-items: flex-end; gap: 8px; height: 100px; margin-top: 12px; }
          .Dashboard-analyticsBar { flex: 1; min-width: 0; background: var(--p-color-bg-fill-info); border-radius: 6px 6px 0 0; }
          .Dashboard-analyticsBarLabelsRow { display: flex; gap: 8px; margin-top: 6px; }
          .Dashboard-analyticsBarLabel { flex: 1; min-width: 0; text-align: center; font-size: 0.6875rem; color: var(--p-color-text-subdued); overflow: hidden; text-overflow: ellipsis; }
        `}</style>

        {/* Hero */}
        <div className="Dashboard-hero">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="100">
              <h1 className="Dashboard-heroTitle">Control center · {storeName}</h1>
              <p className="Dashboard-heroSub">
                {stats.modules === 0
                  ? 'Create your first AI module or pick a template to get started.'
                  : `${stats.modules} module${stats.modules !== 1 ? 's' : ''} · ${stats.published} live on your store`}
              </p>
            </BlockStack>
            <InlineStack gap="200">
              <Badge tone={stats.planName === 'Free' ? 'attention' : 'success'}>{stats.planName}</Badge>
              <Button url="/modules" variant="primary" size="slim">Create module</Button>
            </InlineStack>
          </InlineStack>
        </div>

        {/* Key metrics / KPIs – customizable: title first, then controls, then content */}
        <div className="Dashboard-kpiSection">
          <p className="Dashboard-sectionTitle">Key metrics</p>
          <InlineStack gap="200" blockAlign="center" wrap>
            <Box minWidth="140px">
              <Select
                label="Display"
                labelHidden
                options={[
                  { label: 'Values only', value: 'values' },
                  { label: 'Line', value: 'line' },
                  { label: 'Bar', value: 'bar' },
                ]}
                value={analyticsMode}
                onChange={(v) => {
                  const mode = v === 'line' || v === 'bar' ? v : 'values';
                  persistMode(mode);
                }}
              />
            </Box>
            <Button size="slim" variant="secondary" onClick={() => setShowAddMetric((s) => !s)}>
              {showAddMetric ? 'Cancel' : 'Add metric'}
            </Button>
          </InlineStack>

          {showAddMetric && (
            <InlineStack gap="200" blockAlign="end" wrap>
              <TextField label="Metric name" value={addMetricName} onChange={setAddMetricName} autoComplete="off" placeholder="My metric" />
              <TextField label="Value" type="number" value={addMetricValue} onChange={setAddMetricValue} autoComplete="off" placeholder="42" />
              <Button variant="primary" size="slim" onClick={handleAddMetric} disabled={!addMetricName.trim() || addMetricValue === '' || Number.isNaN(Number(addMetricValue))}>
                Add
              </Button>
            </InlineStack>
          )}

          {analyticsMode === 'values' && (
            <div className="Dashboard-kpiGrid">
              {builtInForCards.map(({ label, displayValue }) => (
                <div key={label} className="Dashboard-kpiCard">
                  <p className="Dashboard-kpiLabel">{label}</p>
                  <p className="Dashboard-kpiValue" style={label === 'Published' ? { color: 'var(--p-color-text-success)' } : undefined}>{displayValue}</p>
                </div>
              ))}
              {customMetrics.map((m) => (
                <div key={m.id} className="Dashboard-kpiCard">
                  <InlineStack align="space-between" blockAlign="center" gap="100">
                    <p className="Dashboard-kpiLabel" style={{ marginBottom: 0 }}>{m.name}</p>
                    <Button size="slim" variant="plain" tone="critical" onClick={() => removeCustomMetric(m.id)} accessibilityLabel={`Remove ${m.name}`}>×</Button>
                  </InlineStack>
                  <p className="Dashboard-kpiValue" style={{ marginTop: 4 }}>{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {analyticsMode === 'line' && numericMetrics.length > 0 && (
            <div className="Dashboard-analyticsLine">
              <LineChart data={numericMetrics.map((m) => m.value)} labels={numericMetrics.map((m) => m.label)} />
            </div>
          )}

          {analyticsMode === 'bar' && numericMetrics.length > 0 && (
            <div>
              <div className="Dashboard-analyticsBarChart">
                {numericMetrics.map((m, i) => {
                  const maxVal = Math.max(...numericMetrics.map((x) => x.value), 1);
                  const pct = (m.value / maxVal) * 100;
                  return <div key={i} className="Dashboard-analyticsBar" style={{ height: `${Math.max(4, pct)}%` }} title={`${m.label}: ${m.value}`} />;
                })}
              </div>
              <div className="Dashboard-analyticsBarLabelsRow">
                {numericMetrics.map((m, i) => (
                  <div key={i} className="Dashboard-analyticsBarLabel">{m.label}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity + Success gauge + Pie */}
        <div className="Dashboard-grid2">
          <div className="Dashboard-panel">
            <p className="Dashboard-sectionTitle">Activity</p>
            <h3 className="Dashboard-panelTitle">Modules created (7 days)</h3>
            <div className="Dashboard-barChart">
              {dailyCounts.map((v, i) => (
                <div
                  key={i}
                  className="Dashboard-bar"
                  style={{ height: `${Math.max(4, (v / maxDaily) * 100)}%` }}
                  title={`${dayLabels[i]}: ${v}`}
                />
              ))}
            </div>
            <div className="Dashboard-barLabels" role="presentation">
              {dayLabels.map((l, i) => (
                <div key={i} className="Dashboard-barLabelCell">
                  <Text as="span" variant="bodySm" tone="subdued">{l}</Text>
                </div>
              ))}
            </div>
          </div>

          <div className="Dashboard-panel">
            <p className="Dashboard-sectionTitle">Performance</p>
            <h3 className="Dashboard-panelTitle">Job success (30d)</h3>
            <InlineStack gap="400" blockAlign="start" wrap>
              <SuccessGauge value={stats.successRate} />
              <div style={{ minWidth: 260, flex: 1 }}>
                <div className="Dashboard-statusRow">
                  {statusRows.map((row) => (
                    <div className="Dashboard-statusItem" key={row.label}>
                      <span>{row.label}</span>
                      <span className="Dashboard-statusTrack">
                        <span
                          className="Dashboard-statusFill"
                          style={{ width: `${Math.max(4, (row.value / maxStatus) * 100)}%`, background: row.tone }}
                        />
                      </span>
                      <span style={{ textAlign: 'right' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <Box paddingBlockStart="200">
                  <DataTable
                    columnContentTypes={['text', 'numeric']}
                    headings={['Status', 'Count']}
                    rows={statusRows.map((row) => [row.label, row.value])}
                    hideScrollIndicator
                  />
                </Box>
              </div>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center" wrap {...{ className: 'Dashboard-panelFooter' } as any}>
              <Text as="p" variant="bodySm" tone="subdued">{stats.totalJobs30d} total · {stats.failedJobs30d} failed</Text>
              <Button url="/logs" variant="plain" size="slim">View logs</Button>
            </InlineStack>
          </div>
        </div>

        {/* What you can build */}
        <div className="Dashboard-panel" style={{ marginTop: 'var(--dashboard-gap)' }}>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center" wrap>
              <p className="Dashboard-sectionTitle" style={{ marginBottom: 0 }}>What you can build</p>
              <Badge tone="magic">AI-powered</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued" {...{ style: { margin: 0 } } as any}>
              Describe what you want in plain English — the AI generates ready-to-publish Shopify modules.
            </Text>
            <div className="Dashboard-capGrid">
              {capabilities.map(({ label, desc, icon }) => (
                <div key={label} className="Dashboard-capCard">
                  <span className="Dashboard-capIcon" aria-hidden>{icon}</span>
                  <div className="Dashboard-capText">
                    <h3 className="Dashboard-capLabel">{label}</h3>
                    <p className="Dashboard-capDesc">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <InlineStack gap="300">
              <Button url="/modules" variant="primary">Create a module</Button>
              <Button url="https://shopify.dev/docs/apps/build" variant="plain" external>Shopify docs</Button>
            </InlineStack>
          </BlockStack>
        </div>

        {/* Quick links */}
        <div style={{ marginTop: 'var(--dashboard-gap)' }}>
          <p className="Dashboard-sectionTitle">Quick links</p>
          <div className="Dashboard-quickGrid">
            <div className="Dashboard-quickCard">
              <div className="Dashboard-quickCardContent">
                <h3>Modules</h3>
                <p>Create and manage AI modules.</p>
              </div>
              <Button url="/modules" variant="primary" size="slim">Go to modules</Button>
            </div>
            <div className="Dashboard-quickCard">
              <div className="Dashboard-quickCardContent">
                <h3>Connectors</h3>
                <p>External API integrations.</p>
              </div>
              <Button url="/connectors" variant="secondary" size="slim">Manage connectors</Button>
            </div>
            <div className="Dashboard-quickCard">
              <div className="Dashboard-quickCardContent">
                <h3>Flows</h3>
                <p>Automation schedules.</p>
              </div>
              <Button url="/flows" variant="secondary" size="slim">Manage flows</Button>
            </div>
            <div className="Dashboard-quickCard">
              <div className="Dashboard-quickCardContent">
                <h3>Logs &amp; usage</h3>
                <p>Activity, limits, success rates.</p>
              </div>
              <Button url="/logs" variant="secondary" size="slim">View logs</Button>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
