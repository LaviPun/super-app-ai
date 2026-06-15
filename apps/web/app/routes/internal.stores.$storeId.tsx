import { useState } from 'react';
import { json, redirect } from '@remix-run/node';
import { useLoaderData, useParams } from '@remix-run/react';
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
  Toggle,
  Banner,
  Modal,
  Tabs,
  KV,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
  fmtNum,
  fmtQuota,
  titleCase,
  STORES,
  MODULES,
  PROVIDERS,
  PLAN_TIERS,
  ACTIVITY,
  storeHealth,
  healthTone,
  healthLabel,
} from '~/components/admin/page-kit';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { compileRecipe } from '~/services/recipes/compiler';
import type { ThemeModulePayload } from '~/services/recipes/compiler/types';

type ModuleMetaRow = {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
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
  const shop = await prisma.shop.findUnique({
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
  });
  // A missing shop is NOT a 404 here — the design surface uses placeholder store ids.
  // Compute the shop-independent options below, then (if no real shop) return shop:null
  // so the component renders the placeholder store inside the admin shell.
  const providers = await new AiProviderService().list();
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

  if (!shop) {
    const emptyUsage = { totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, totalCostCents: 0, byProvider: [] as any[] };
    return json({
      shop: null,
      providerOptions,
      billingPlanOptions,
      publishedModulesMeta: [] as ReturnType<typeof buildPublishedModulesMeta>,
      aiUsage30d: emptyUsage,
      aiUsageAllTime: emptyUsage,
    });
  }

  const publishedModulesMeta = buildPublishedModulesMeta(shop);
  const aiUsageRows = await prisma.aiUsage.findMany({
    where: { shopId: shop.id },
    include: { provider: true },
  });
  const since30d = new Date(Date.now() - 30 * 86400000);
  const aiUsageRows30d = aiUsageRows.filter((r) => r.createdAt >= since30d);
  const summarizeAiRows = (rows: typeof aiUsageRows) => {
    const byProvider = new Map<string, { provider: string; model: string; requests: number; tokensIn: number; tokensOut: number; costCents: number }>();
    let totalRequests = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostCents = 0;
    for (const row of rows) {
      totalRequests += row.requestCount;
      totalTokensIn += row.tokensIn;
      totalTokensOut += row.tokensOut;
      totalCostCents += row.costCents;
      const providerName = row.provider?.name ?? row.provider?.provider ?? 'Unknown provider';
      const model = row.provider?.model ?? '—';
      const key = `${providerName}::${model}`;
      const cur = byProvider.get(key) ?? {
        provider: providerName,
        model,
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
      };
      cur.requests += row.requestCount;
      cur.tokensIn += row.tokensIn;
      cur.tokensOut += row.tokensOut;
      cur.costCents += row.costCents;
      byProvider.set(key, cur);
    }
    return {
      totalRequests,
      totalTokensIn,
      totalTokensOut,
      totalCostCents,
      byProvider: Array.from(byProvider.values()).sort((a, b) => b.costCents - a.costCents),
    };
  };

  return json({
    shop: {
      id: shop.id,
      shopDomain: shop.shopDomain,
      planTier: shop.planTier,
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
    publishedModulesMeta,
    aiUsage30d: summarizeAiRows(aiUsageRows30d),
    aiUsageAllTime: summarizeAiRows(aiUsageRows),
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const shopId = String(form.get('shopId') ?? '');
  const intent = String(form.get('intent') ?? 'provider');

  if (!shopId) return json({ error: 'Missing shopId' }, { status: 400 });

  const prisma = getPrisma();
  const activity = new ActivityLogService();

  if (intent === 'provider') {
    const providerId = String(form.get('providerId') ?? '');
    await prisma.shop.update({
      where: { id: shopId },
      data: { aiProviderOverrideId: providerId || null },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'aiProviderOverride', providerId } });
  }

  if (intent === 'retention') {
    const toIntOrUndefined = (v: FormDataEntryValue | null) => {
      const n = parseInt(String(v ?? ''), 10);
      return isNaN(n) || n <= 0 ? undefined : n;
    };
    const data: Record<string, number> = {};
    const d = toIntOrUndefined(form.get('retentionDaysDefault'));
    if (d !== undefined) data.retentionDaysDefault = d;
    const ai = toIntOrUndefined(form.get('retentionDaysAi'));
    if (ai !== undefined) data.retentionDaysAi = ai;
    const api = toIntOrUndefined(form.get('retentionDaysApi'));
    if (api !== undefined) data.retentionDaysApi = api;
    const err = toIntOrUndefined(form.get('retentionDaysErrors'));
    if (err !== undefined) data.retentionDaysErrors = err;
    await prisma.shop.update({ where: { id: shopId }, data });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'retention' } });
  }

  if (intent === 'set_plan') {
    const plan = String(form.get('plan') ?? '') as BillingPlan;
    const allowed: BillingPlan[] = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
    if (!allowed.includes(plan)) return json({ error: 'Invalid plan' }, { status: 400 });
    await new BillingService().setPlanForShop(shopId, plan);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_PLAN_CHANGED', resource: `shop:${shopId}`, details: { plan } });
  }

  return redirect(`/internal/stores/${shopId}`);
}

const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };

export default function AdminStoreDetail() {
  const data = useLoaderData<typeof loader>();
  const params = useParams();
  const ctx = useAdminCtx();
  // Map the real shop onto the design's store shape; fall back to the placeholder set.
  const real = data.shop;
  const placeholder = STORES.find((x) => x.id === params.storeId) || STORES[0];
  const s: any = real
    ? {
        id: real.id,
        domain: real.shopDomain,
        name: real.shopDomain.split('.')[0],
        plan: real.planTier,
        status: real.subscription?.status === 'ACTIVE' ? 'ACTIVE' : (real.subscription?.status ?? 'ACTIVE'),
        modules: real.modulesCount,
        published: real.publishedCount,
        aiCalls30d: (data.aiUsage30d as any)?.count ?? placeholder.aiCalls30d,
        owner: placeholder.owner,
        country: placeholder.country,
        installedAt: placeholder.installedAt,
        provider: placeholder.provider,
      }
    : placeholder;

  const [tab, setTab] = useState('overview');
  const [planModal, setPlanModal] = useState(false);
  const [planChoice, setPlanChoice] = useState(s.plan);
  const mods = MODULES.filter((m) => m.store === s.name);
  const h = storeHealth(s);
  const hTone = healthTone(h);
  const applyPlan = () => {
    setPlanModal(false);
    ctx.toast('Plan changed to ' + titleCase(planChoice));
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
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Health score" value={h} sub={healthLabel(h)} icon="shield" tone={hTone} />
        <StatTile label="Modules" value={s.modules} sub={s.published + ' published'} icon="layers" tone="info" />
        <StatTile label="AI calls (30d)" value={fmtNum(s.aiCalls30d)} icon="magic" tone="magic" />
        <StatTile label="Provider" value={String(s.provider).split(' · ')[0]} sub={String(s.provider).split(' · ')[1]} icon="connect" tone="success" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'modules', label: 'Modules', badge: mods.length },
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
                ['Owner', s.owner],
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
            <div className="timeline">
              {ACTIVITY.slice(0, 4).map((a, i) => (
                <div key={i} className="tl-item">
                  <span className="tl-dot info" />
                  <div className="t-sm t-strong">{titleCase(a.action)}</div>
                  <div className="t-xs t-muted">{a.created}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {tab === 'modules' && (
        <Card className="internal-store-modules-table">
          <DataTable
            rowKey="id"
            columns={[
              { key: 'name', label: 'Module', render: (r: any) => <span className="cell-strong">{r.name}</span> },
              { key: 'type', label: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
              { key: 'version', label: 'Version', render: (r: any) => 'v' + r.version },
              { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
              { key: 'updated', label: 'Updated', render: (r: any) => <span className="cell-sub">{r.updated}</span> },
            ]}
            rows={mods.length ? mods : MODULES.slice(0, 3)}
          />
        </Card>
      )}
      {tab === 'overrides' && (
        <Card pad>
          <div className="stack-5" style={{ maxWidth: 540 }}>
            <Field label="AI provider override" help="Force this store onto a specific provider, regardless of the global default">
              <Select options={['Use global default'].concat(PROVIDERS.map((p) => p.name))} value="Use global default" onChange={() => ctx.toast('Override updated')} />
            </Field>
            <Field label="Feature flags" optional>
              <div className="stack-2">
                {[
                  ['betaImageToModule', 'Beta: image-to-module'],
                  ['betaMultiStep', 'Beta: multi-step flows'],
                  ['allowCustomCss', 'Allow custom CSS'],
                ].map((f, i) => (
                  <label key={i} className="row spread">
                    <span className="t-sm">{f[1]}</span>
                    <Toggle onChange={(e: any) => ctx.toast(f[1] + (e.target.checked ? ' enabled' : ' disabled'))} />
                  </label>
                ))}
              </div>
            </Field>
            <div>
              <Btn variant="primary" onClick={() => ctx.toast('Overrides saved')}>
                Save overrides
              </Btn>
            </div>
          </div>
        </Card>
      )}
      {tab === 'retention' && (
        <Card pad>
          <div className="stack-4" style={{ maxWidth: 540 }}>
            <Banner tone="info">Override how long logs and usage data are kept for this store. Leave blank to use the plan default.</Banner>
            <div className="grid grid-2">
              {[
                ['aiUsage', 'AI usage', '90'],
                ['apiLogs', 'API logs', '30'],
                ['errorLogs', 'Error logs', '30'],
                ['jobs', 'Jobs', '14'],
              ].map((r, i) => (
                <Field key={i} label={r[1] + ' (days)'}>
                  <Input type="number" defaultValue={r[2]} />
                </Field>
              ))}
            </div>
            <div>
              <Btn variant="primary" onClick={() => ctx.toast('Retention updated')}>
                Save retention
              </Btn>
            </div>
          </div>
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
              <Btn variant="primary" onClick={applyPlan}>
                Apply plan
              </Btn>
            </>
          }
        >
          <div className="stack-2">
            {PLAN_TIERS.map((p) => (
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

