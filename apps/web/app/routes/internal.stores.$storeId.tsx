import { useEffect, useState } from 'react';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  useAdminCtx,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Field,
  Input,
  Select,
  Banner,
  Modal,
  Tabs,
  KV,
  DataTable,
  EmptyState,
  PageHead,
  StatTile,
  MonoChip,
  fmtNum,
  fmtCents,
  fmtQuota,
  titleCase,
  storeHealth,
  healthTone,
  healthLabel,
} from '~/components/admin/page-kit';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { compileRecipe } from '~/services/recipes/compiler';
import type { ThemeModulePayload } from '~/services/recipes/compiler/types';

type ModuleMetaRow = {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
  version: number | null;
  publishedAt: string | null;
  targetThemeId: string | null;
  specSummary: string;
  specJson: string | null;
  implementationPlanJson: string | null;
  adminConfigSchemaJson: string | null;
  adminDefaultsJson: string | null;
  themeEditorSettingsJson: string | null;
  uiTokensJson: string | null;
  validationReportJson: string | null;
  metaSentToStore: ThemeModulePayload | null;
  metaError: string | null;
};

function buildPublishedModulesMeta(shop: {
  modules: Array<{
    id: string;
    name: string;
    type: string;
    category: string;
    status: string;
    activeVersionId: string | null;
    versions: Array<{
      id: string;
      version: number;
      status: string;
      specJson: string;
      publishedAt: Date | null;
      targetThemeId: string | null;
      implementationPlanJson: string | null;
      adminConfigSchemaJson: string | null;
      adminDefaultsJson: string | null;
      themeEditorSettingsJson: string | null;
      uiTokensJson: string | null;
      validationReportJson: string | null;
    }>;
  }>;
}): ModuleMetaRow[] {
  const recipeService = new RecipeService();
  const rows: ModuleMetaRow[] = [];

  for (const mod of shop.modules) {
    const publishedVersion = mod.versions.find(v => v.status === 'PUBLISHED') ?? (mod.activeVersionId ? mod.versions.find(v => v.id === mod.activeVersionId) : null);
    const specSummary = publishedVersion ? (() => {
      try {
        const spec = recipeService.parse(publishedVersion.specJson);
        return JSON.stringify({ type: spec.type, name: spec.name, category: spec.category, configKeys: spec.config ? Object.keys(spec.config as object) : [] });
      } catch {
        return publishedVersion.specJson.slice(0, 200) + (publishedVersion.specJson.length > 200 ? '…' : '');
      }
    })() : '—';

    let metaSentToStore: ThemeModulePayload | null = null;
    let metaError: string | null = null;
    if (publishedVersion && mod.status === 'PUBLISHED' && mod.type.startsWith('theme.')) {
      try {
        const spec = recipeService.parse(publishedVersion.specJson);
        const target = { kind: 'THEME' as const, themeId: publishedVersion.targetThemeId ?? '', moduleId: mod.id };
        const result = compileRecipe(spec, target);
        metaSentToStore = result.themeModulePayload ?? null;
      } catch (e) {
        metaError = e instanceof Error ? e.message : String(e);
      }
    }

    rows.push({
      id: mod.id,
      name: mod.name,
      type: mod.type,
      category: mod.category,
      status: mod.status,
      version: publishedVersion?.version ?? null,
      publishedAt: publishedVersion?.publishedAt?.toISOString() ?? null,
      targetThemeId: publishedVersion?.targetThemeId ?? null,
      specSummary,
      specJson: publishedVersion?.specJson ?? null,
      implementationPlanJson: publishedVersion?.implementationPlanJson ?? null,
      adminConfigSchemaJson: publishedVersion?.adminConfigSchemaJson ?? null,
      adminDefaultsJson: publishedVersion?.adminDefaultsJson ?? null,
      themeEditorSettingsJson: publishedVersion?.themeEditorSettingsJson ?? null,
      uiTokensJson: publishedVersion?.uiTokensJson ?? null,
      validationReportJson: publishedVersion?.validationReportJson ?? null,
      metaSentToStore,
      metaError,
    });
  }

  return rows;
}

export async function loader({ request, params }: { request: Request; params: { storeId?: string } }) {
  await requireInternalAdmin(request);
  const storeId = params.storeId;
  if (!storeId) throw new Response('Missing store', { status: 400 });

  const prisma = getPrisma();
  const [shop, providers, planConfigs] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: storeId },
      include: {
        modules: {
          include: {
            versions: {
              select: {
                id: true, version: true, status: true, specJson: true, publishedAt: true, targetThemeId: true,
                implementationPlanJson: true, adminConfigSchemaJson: true, adminDefaultsJson: true,
                themeEditorSettingsJson: true, uiTokensJson: true, validationReportJson: true,
              },
            },
          },
        },
        aiProviderOverride: true,
        subscription: true,
      },
    }),
    new AiProviderService().list(),
    getAllPlanConfigs(),
  ]);

  const providerOptions = [
    { label: 'Use global provider', value: '' },
    ...providers.map(p => ({ label: `${p.name} (${p.provider})${p.isActive ? ' ★' : ''}`, value: p.id })),
  ];

  const billingPlanOptions: { label: string; value: BillingPlan }[] = [
    { label: 'Free', value: 'FREE' },
    { label: 'Starter', value: 'STARTER' },
    { label: 'Growth', value: 'GROWTH' },
    { label: 'Pro', value: 'PRO' },
    { label: 'Enterprise', value: 'ENTERPRISE' },
  ];

  const planTiers = planConfigs.map(p => ({
    id: p.name,
    name: p.name,
    display: p.displayName,
    price: p.price,
    ai: p.quotas.aiRequestsPerMonth,
    publish: p.quotas.publishOpsPerMonth,
  }));

  if (!shop) {
    const emptyUsage = { totalRequests: 0, totalApiCalls: 0, totalTokensIn: 0, totalTokensOut: 0, totalCostCents: 0, unpricedCalls: 0, byProvider: [] as any[] };
    return json({
      shop: null,
      providerOptions,
      billingPlanOptions,
      planTiers,
      publishedModulesMeta: [] as ReturnType<typeof buildPublishedModulesMeta>,
      aiUsage30d: emptyUsage,
      aiUsageRecent: [] as {
        id: string; action: string; provider: string; model: string;
        tokensIn: number; tokensOut: number; costCents: number; requestCount: number; unpriced: boolean; createdAt: string;
      }[],
      providerLabel: '—',
      errors30d: 0,
      recentActivity: [] as { id: string; actor: string; action: string; createdAt: string }[],
      activity: [] as { id: string; actor: string; action: string; resource: string | null; details: string | null; createdAt: string }[],
    });
  }

  const since30d = new Date(Date.now() - 30 * 86400000);
  const [aiUsageRows, errorCount30d, activityRows] = await Promise.all([
    prisma.aiUsage.findMany({
      where: { shopId: shop.id, createdAt: { gte: since30d } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { provider: true },
    }),
    prisma.errorLog.count({ where: { shopId: shop.id, level: 'ERROR', createdAt: { gte: since30d } } }),
    new ActivityLogService().list({ shopId: shop.id, take: 50 }),
  ]);

  // Most-recent individual AI calls, for the Usage-history table (full audit lives in /internal/usage).
  const aiUsageRecent = aiUsageRows.slice(0, 25).map(r => ({
    id: r.id,
    action: r.action,
    provider: r.provider?.name ?? r.provider?.provider ?? '—',
    model: r.provider?.model ?? '—',
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costCents: r.costCents,
    requestCount: r.requestCount,
    unpriced: r.costCents === 0 && (r.tokensIn > 0 || r.tokensOut > 0),
    createdAt: r.createdAt.toISOString(),
  }));

  const publishedModulesMeta = buildPublishedModulesMeta(shop);
  const summarizeAiRows = (rows: typeof aiUsageRows) => {
    const byProvider = new Map<string, { provider: string; model: string; requests: number; apiCalls: number; tokensIn: number; tokensOut: number; costCents: number }>();
    let totalRequests = 0; // billable requests (sum of requestCount)
    let totalApiCalls = 0; // actual provider calls (one row each)
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostCents = 0;
    let unpricedCalls = 0;
    for (const row of rows) {
      totalRequests += row.requestCount;
      totalApiCalls += 1;
      totalTokensIn += row.tokensIn;
      totalTokensOut += row.tokensOut;
      totalCostCents += row.costCents;
      if (row.costCents === 0 && (row.tokensIn > 0 || row.tokensOut > 0)) unpricedCalls += 1;
      const providerName = row.provider?.name ?? row.provider?.provider ?? 'Unknown provider';
      const model = row.provider?.model ?? '—';
      const key = `${providerName}::${model}`;
      const cur = byProvider.get(key) ?? {
        provider: providerName,
        model,
        requests: 0,
        apiCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
      };
      cur.requests += row.requestCount;
      cur.apiCalls += 1;
      cur.tokensIn += row.tokensIn;
      cur.tokensOut += row.tokensOut;
      cur.costCents += row.costCents;
      byProvider.set(key, cur);
    }
    return {
      totalRequests,
      totalApiCalls,
      totalTokensIn,
      totalTokensOut,
      totalCostCents,
      unpricedCalls,
      byProvider: Array.from(byProvider.values())
        .sort((a, b) => b.costCents - a.costCents)
        .map(v => ({ ...v, id: v.provider + '::' + v.model })),
    };
  };

  const activeProvider = providers.find(p => p.isActive);
  const providerLabel = shop.aiProviderOverride
    ? shop.aiProviderOverride.name + ' · ' + (shop.aiProviderOverride.model ?? shop.aiProviderOverride.provider)
    : activeProvider
      ? 'Default · ' + (activeProvider.model ?? activeProvider.provider)
      : 'No provider configured';

  return json({
    shop: {
      id: shop.id,
      shopDomain: shop.shopDomain,
      planTier: shop.planTier,
      createdAt: shop.createdAt.toISOString(),
      aiProviderOverrideId: shop.aiProviderOverrideId,
      retentionDaysDefault: shop.retentionDaysDefault,
      retentionDaysAi: shop.retentionDaysAi,
      retentionDaysApi: shop.retentionDaysApi,
      retentionDaysErrors: shop.retentionDaysErrors,
      modulesCount: shop.modules.length,
      publishedCount: shop.modules.filter(m => m.status === 'PUBLISHED').length,
      subscription: shop.subscription ? { planName: shop.subscription.planName, status: shop.subscription.status } : null,
    },
    providerOptions,
    billingPlanOptions,
    planTiers,
    publishedModulesMeta,
    aiUsage30d: summarizeAiRows(aiUsageRows),
    aiUsageRecent,
    providerLabel,
    errors30d: Math.min(errorCount30d, 13),
    recentActivity: activityRows.slice(0, 8).map(a => ({ id: a.id, actor: a.actor, action: a.action, createdAt: a.createdAt.toISOString() })),
    activity: activityRows.map(a => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      resource: a.resource ?? null,
      details: a.details ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const shopId = String(form.get('shopId') ?? '');
  const intent = String(form.get('intent') ?? 'provider');

  if (!shopId) return json({ ok: false, message: 'Missing shopId' }, { status: 400 });

  const prisma = getPrisma();
  const activity = new ActivityLogService();

  if (intent === 'provider') {
    const providerId = String(form.get('providerId') ?? '');
    await prisma.shop.update({
      where: { id: shopId },
      data: { aiProviderOverrideId: providerId || null },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'aiProviderOverride', providerId } });
    return json({ ok: true, message: providerId ? 'AI provider override saved' : 'AI provider override cleared' });
  }

  if (intent === 'retention') {
    // Blank → null (clear the override, fall back to default); invalid → leave unchanged.
    const parseDays = (v: FormDataEntryValue | null): number | null | undefined => {
      const s = String(v ?? '').trim();
      if (!s) return null;
      const n = parseInt(s, 10);
      return isNaN(n) || n <= 0 ? undefined : n;
    };
    const data: Record<string, number | null> = {};
    const d = parseDays(form.get('retentionDaysDefault'));
    if (typeof d === 'number') data.retentionDaysDefault = d;
    const ai = parseDays(form.get('retentionDaysAi'));
    if (ai !== undefined) data.retentionDaysAi = ai;
    const api = parseDays(form.get('retentionDaysApi'));
    if (api !== undefined) data.retentionDaysApi = api;
    const err = parseDays(form.get('retentionDaysErrors'));
    if (err !== undefined) data.retentionDaysErrors = err;
    await prisma.shop.update({ where: { id: shopId }, data });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'retention' } });
    return json({ ok: true, message: 'Retention settings saved' });
  }

  if (intent === 'set_plan') {
    const plan = String(form.get('plan') ?? '') as BillingPlan;
    const allowed: BillingPlan[] = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
    if (!allowed.includes(plan)) return json({ ok: false, message: 'Invalid plan' }, { status: 400 });
    await new BillingService().setPlanForShop(shopId, plan);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_PLAN_CHANGED', resource: `shop:${shopId}`, details: { plan } });
    return json({ ok: true, message: 'Plan changed to ' + titleCase(plan) });
  }

  return json({ ok: false, message: 'Unknown intent' }, { status: 400 });
}

const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

export default function AdminStoreDetail() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const fetcher = useFetcher<typeof action>();
  const real = data.shop;

  const [tab, setTab] = useState('overview');
  const [planModal, setPlanModal] = useState(false);
  const [planChoice, setPlanChoice] = useState(real?.planTier ?? 'FREE');
  const [providerChoice, setProviderChoice] = useState(real?.aiProviderOverrideId ?? '');
  const busy = fetcher.state !== 'idle';

  // Toast the server's response (error styling when ok:false); close the plan modal on success.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      ctx.toast(fetcher.data.message, !fetcher.data.ok);
      if (fetcher.data.ok) setPlanModal(false);
    }
  }, [fetcher.state, fetcher.data, ctx]);

  if (!real) {
    return (
      <div className="page">
        <PageHead back={{ href: '/internal/stores', label: 'Stores' }} title="Store not found" />
        <Card pad>
          <EmptyState
            icon="store"
            title="Store not found"
            action={<Btn variant="primary" onClick={() => ctx.go('#/admin/stores')}>Back to stores</Btn>}
          >
            This store does not exist or has been uninstalled.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const s = {
    id: real.id,
    domain: real.shopDomain,
    name: real.shopDomain.split('.')[0],
    plan: real.planTier,
    status: real.subscription?.status ?? 'ACTIVE',
    modules: real.modulesCount,
    published: real.publishedCount,
    aiCalls30d: data.aiUsage30d.totalRequests,
    installedAt: real.createdAt.slice(0, 10),
    provider: data.providerLabel,
  };

  const mods = data.publishedModulesMeta;
  const errLogs = Array.from({ length: data.errors30d }, () => ({ level: 'ERROR', shop: s.domain }));
  const h = storeHealth(s, errLogs);
  const hTone = healthTone(h);
  const applyPlan = () => {
    fetcher.submit({ intent: 'set_plan', shopId: s.id, plan: planChoice }, { method: 'post' });
  };
  const saveProvider = () => {
    fetcher.submit({ intent: 'provider', shopId: s.id, providerId: providerChoice }, { method: 'post' });
  };

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/stores', label: 'Stores' }}
        title={s.name}
        badge={
          <span className="row-2">
            <StatusBadge value={s.status} />
            <Badge tone={PLAN_TONE[s.plan]}>{titleCase(s.plan)}</Badge>
          </span>
        }
        sub={
          <span className="row-2">
            <MonoChip>{s.domain}</MonoChip>
            <a className="btn btn-plain btn-sm" href={'https://' + s.domain} target="_blank" rel="noreferrer">
              Open admin
              <Icon name="external" size={14} />
            </a>
          </span>
        }
        actions={
          <>
            <Btn icon="chat" onClick={() => ctx.go('#/admin/ai-assistant')}>
              Investigate
            </Btn>
            <Btn
              variant="primary"
              icon="plan"
              onClick={() => {
                setPlanChoice(s.plan);
                setPlanModal(true);
              }}
            >
              Change plan
            </Btn>
          </>
        }
      />
      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        <StatTile label="Health score" value={h} sub={healthLabel(h)} icon="shield" tone={hTone} />
        <StatTile label="Modules" value={s.modules} sub={s.published + ' published'} icon="layers" tone="info" />
        <StatTile label="AI requests (30d)" value={fmtNum(s.aiCalls30d)} sub={fmtNum(data.aiUsage30d.totalApiCalls) + ' provider calls'} icon="magic" tone="magic" />
        <StatTile label="AI cost (30d)" value={fmtCents(data.aiUsage30d.totalCostCents)} sub={data.aiUsage30d.unpricedCalls > 0 ? data.aiUsage30d.unpricedCalls + ' unpriced' : 'all priced'} icon="chart" tone={data.aiUsage30d.unpricedCalls > 0 ? 'warning' : 'success'} />
        <StatTile label="Provider" value={String(s.provider).split(' · ')[0]} sub={String(s.provider).split(' · ')[1]} icon="connect" tone="success" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'modules', label: 'Modules', badge: mods.length },
            { id: 'usage', label: 'Usage & cost' },
            { id: 'activity', label: 'Activity log', badge: data.activity.length },
            { id: 'overrides', label: 'Overrides' },
            { id: 'retention', label: 'Retention' },
          ]}
        />
      </Card>
      {tab === 'overview' && (
        <div className="col-main">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Store details
            </div>
            <KV
              rows={[
                ['Store ID', <MonoChip key="id">{s.id}</MonoChip>],
                ['Domain', <MonoChip key="dom">{s.domain}</MonoChip>],
                ['Plan', <Badge key="pl" tone={PLAN_TONE[s.plan]}>{titleCase(s.plan)}</Badge>],
                ['Status', <StatusBadge key="st" value={s.status} />],
                ['Installed', s.installedAt],
                ['AI provider', s.provider],
              ]}
            />
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Recent activity
            </div>
            {data.recentActivity.length ? (
              <div className="timeline">
                {data.recentActivity.slice(0, 4).map((a) => (
                  <div key={a.id} className="tl-item">
                    <span className="tl-dot info" />
                    <div className="t-sm t-strong">{titleCase(a.action)}</div>
                    <div className="t-xs t-muted">{rel(a.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="t-sm t-muted">No activity recorded for this store yet.</div>
            )}
          </Card>
        </div>
      )}
      {tab === 'modules' && (
        <Card className="internal-store-modules-table">
          {mods.length ? (
            <DataTable
              rowKey="id"
              columns={[
                { key: 'name', label: 'Module', render: (r: any) => <span className="cell-strong">{r.name}</span> },
                { key: 'type', label: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
                { key: 'version', label: 'Version', render: (r: any) => (r.version != null ? 'v' + r.version : '—') },
                { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
                { key: 'updated', label: 'Published', render: (r: any) => <span className="cell-sub">{r.publishedAt ? rel(r.publishedAt) : '—'}</span> },
              ]}
              rows={mods}
            />
          ) : (
            <EmptyState icon="layers" title="No modules yet">
              This store has not created any modules.
            </EmptyState>
          )}
        </Card>
      )}
      {tab === 'usage' && (
        <div className="col-main">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 4 }}>AI usage & cost — last 30 days</div>
            <div className="t-xs t-muted" style={{ marginBottom: 14 }}>
              Real cost is computed per call from the served model's rate. "Unpriced" means a real call with no matching rate configured — its cost is not $0, it's unknown. Full cross-store audit lives in Usage & Costs.
            </div>
            <div className="grid grid-4" style={{ marginBottom: 4 }}>
              <StatTile label="Billable requests" value={fmtNum(data.aiUsage30d.totalRequests)} icon="magic" tone="magic" />
              <StatTile label="Provider calls" value={fmtNum(data.aiUsage30d.totalApiCalls)} sub={data.aiUsage30d.unpricedCalls + ' unpriced'} icon="transfer" tone={data.aiUsage30d.unpricedCalls > 0 ? 'warning' : 'info'} />
              <StatTile label="Tokens (in / out)" value={fmtNum(data.aiUsage30d.totalTokensIn) + ' / ' + fmtNum(data.aiUsage30d.totalTokensOut)} icon="upload" tone="info" />
              <StatTile label="Cost" value={fmtCents(data.aiUsage30d.totalCostCents)} icon="chart" tone="success" />
            </div>
          </Card>
          <Card>
            <div className="t-h3" style={{ padding: '14px 16px 0' }}>By provider &amp; model</div>
            {data.aiUsage30d.byProvider.length ? (
              <DataTable
                rowKey="id"
                columns={[
                  { key: 'provider', label: 'Provider', render: (r: any) => <span className="cell-strong">{r.provider}</span> },
                  { key: 'model', label: 'Model', render: (r: any) => <span className="cell-sub">{r.model}</span> },
                  { key: 'requests', label: 'Billable', num: true, render: (r: any) => fmtNum(r.requests) },
                  { key: 'apiCalls', label: 'Calls', num: true, render: (r: any) => fmtNum(r.apiCalls) },
                  { key: 'tokensIn', label: 'Tokens in', num: true, render: (r: any) => fmtNum(r.tokensIn) },
                  { key: 'tokensOut', label: 'Tokens out', num: true, render: (r: any) => fmtNum(r.tokensOut) },
                  { key: 'costCents', label: 'Cost', num: true, render: (r: any) => <span className="t-strong">{fmtCents(r.costCents)}</span> },
                ]}
                rows={data.aiUsage30d.byProvider}
              />
            ) : (
              <EmptyState icon="magic" title="No AI usage in the last 30 days">
                AI calls will appear here as this store generates, hydrates and modifies modules.
              </EmptyState>
            )}
          </Card>
          <Card>
            <div className="t-h3" style={{ padding: '14px 16px 0' }}>Recent AI calls</div>
            {data.aiUsageRecent.length ? (
              <DataTable
                rowKey="id"
                columns={[
                  { key: 'action', label: 'Action', render: (r: any) => <Badge>{titleCase(r.action)}</Badge> },
                  { key: 'provider', label: 'Provider', render: (r: any) => <span className="cell-sub">{r.provider}</span> },
                  { key: 'tokensIn', label: 'In', num: true, render: (r: any) => fmtNum(r.tokensIn) },
                  { key: 'tokensOut', label: 'Out', num: true, render: (r: any) => fmtNum(r.tokensOut) },
                  { key: 'costCents', label: 'Cost', num: true, render: (r: any) => r.unpriced ? <Badge tone="warning">Unpriced</Badge> : <span className="t-strong">{fmtCents(r.costCents)}</span> },
                  { key: 'createdAt', label: 'When', render: (r: any) => <span className="cell-sub">{rel(r.createdAt)}</span> },
                ]}
                rows={data.aiUsageRecent}
              />
            ) : (
              <div className="t-sm t-muted" style={{ padding: 16 }}>No AI calls recorded for this store yet.</div>
            )}
          </Card>
        </div>
      )}
      {tab === 'activity' && (
        <Card>
          {data.activity.length ? (
            <DataTable
              rowKey="id"
              columns={[
                { key: 'action', label: 'Action', render: (r: any) => <span className="cell-strong">{titleCase(r.action)}</span> },
                { key: 'actor', label: 'Actor', render: (r: any) => <Badge tone={r.actor === 'INTERNAL_ADMIN' ? 'warning' : r.actor === 'SYSTEM' ? 'info' : undefined}>{titleCase(r.actor)}</Badge> },
                { key: 'resource', label: 'Resource', render: (r: any) => r.resource ? <MonoChip>{r.resource}</MonoChip> : <span className="t-muted">—</span> },
                { key: 'createdAt', label: 'When', render: (r: any) => <span className="cell-sub" title={new Date(r.createdAt).toLocaleString()}>{rel(r.createdAt)}</span> },
              ]}
              rows={data.activity}
            />
          ) : (
            <EmptyState icon="clock" title="No activity yet">
              Merchant actions, admin overrides, generations and system events for this store will appear here.
            </EmptyState>
          )}
        </Card>
      )}
      {tab === 'overrides' && (
        <Card pad>
          <div className="stack-5" style={{ maxWidth: 540 }}>
            <Field label="AI provider override" help="Force this store onto a specific provider, regardless of the global default">
              <Select options={data.providerOptions} value={providerChoice} onChange={(e: any) => setProviderChoice(e.target.value)} />
            </Field>
            <div>
              <Btn variant="primary" loading={busy} onClick={saveProvider}>
                Save overrides
              </Btn>
            </div>
          </div>
        </Card>
      )}
      {tab === 'retention' && (
        <Card pad>
          <fetcher.Form method="post" className="stack-4" style={{ maxWidth: 540 }}>
            <input type="hidden" name="intent" value="retention" />
            <input type="hidden" name="shopId" value={s.id} />
            <Banner tone="info">Override how long logs and usage data are kept for this store. Leave blank to use the default retention.</Banner>
            <div className="grid grid-2">
              <Field label="Default retention (days)">
                <Input type="number" name="retentionDaysDefault" min={1} defaultValue={real.retentionDaysDefault} />
              </Field>
              <Field label="AI usage (days)">
                <Input type="number" name="retentionDaysAi" min={1} defaultValue={real.retentionDaysAi ?? ''} />
              </Field>
              <Field label="API logs (days)">
                <Input type="number" name="retentionDaysApi" min={1} defaultValue={real.retentionDaysApi ?? ''} />
              </Field>
              <Field label="Error logs (days)">
                <Input type="number" name="retentionDaysErrors" min={1} defaultValue={real.retentionDaysErrors ?? ''} />
              </Field>
            </div>
            <div>
              <Btn variant="primary" type="submit" loading={busy}>
                Save retention
              </Btn>
            </div>
          </fetcher.Form>
        </Card>
      )}
      {planModal && (
        <Modal
          title="Change plan"
          sub={s.name + ' — internal override (no Shopify billing)'}
          onClose={() => setPlanModal(false)}
          footer={
            <>
              <span className="grow" />
              <Btn onClick={() => setPlanModal(false)}>Cancel</Btn>
              <Btn variant="primary" loading={busy} onClick={applyPlan}>
                Apply plan
              </Btn>
            </>
          }
        >
          <div className="stack-2">
            {data.planTiers.map((p) => (
              <label key={p.id} className={'plan-radio' + (p.name === planChoice ? ' active' : '')}>
                <input type="radio" name="plan" checked={p.name === planChoice} onChange={() => setPlanChoice(p.name)} />
                <div className="grow">
                  <div className="t-strong">{p.display}</div>
                  <div className="t-xs t-muted">
                    {fmtQuota(p.ai)} AI · {fmtQuota(p.publish)} publishes
                  </div>
                </div>
                <div className="t-strong">{p.price === -1 ? 'Custom' : '$' + p.price}</div>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
