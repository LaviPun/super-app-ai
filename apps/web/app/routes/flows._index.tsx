import { json, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, useNavigate, useRevalidator, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { ScheduleService } from '~/services/flows/schedule.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  StatTile, StatusBadge, EmptyState, ConfirmModal, MonoChip, LearnMore, fmtNum,
} from '~/components/merchant/polaris';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Human trigger chip for a legacy flow.automation trigger enum. */
const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: 'manual',
  SHOPIFY_WEBHOOK_ORDER_CREATED: 'shopify/orders.create',
  SHOPIFY_WEBHOOK_PRODUCT_UPDATED: 'shopify/products.update',
  SHOPIFY_WEBHOOK_CUSTOMER_CREATED: 'shopify/customers.create',
  SHOPIFY_WEBHOOK_FULFILLMENT_CREATED: 'shopify/fulfillments.create',
  SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED: 'shopify/draft_orders.create',
  SHOPIFY_WEBHOOK_COLLECTION_CREATED: 'shopify/collections.create',
  SCHEDULED: 'schedule/cron',
  SUPERAPP_MODULE_PUBLISHED: 'superapp/module.published',
  SUPERAPP_CONNECTOR_SYNCED: 'superapp/connector.synced',
  SUPERAPP_DATA_RECORD_CREATED: 'superapp/data.record_created',
  SUPERAPP_WORKFLOW_COMPLETED: 'superapp/workflow.completed',
  SUPERAPP_WORKFLOW_FAILED: 'superapp/workflow.failed',
};

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    return json({ flows: [], stats: { active: 0, drafts: 0, runs7d: 0, successRate: null as number | null } });
  }

  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  const [schedules, flowModules, workflowDefs, flowRunJobs, workflowRuns] = await Promise.all([
    new ScheduleService().list(shop.id),
    prisma.module.findMany({
      where: { shopId: shop.id, type: 'flow.automation' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        activeVersion: true,
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    }),
    prisma.workflowDef.findMany({
      where: { tenantId: shop.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    // FLOW_RUN jobs are the run log of legacy flow.automation modules (payload carries flowId).
    prisma.job.findMany({
      where: { shopId: shop.id, type: 'FLOW_RUN' },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { status: true, payload: true, createdAt: true },
    }),
    // WorkflowRun rows are the run log of canonical (template-installed) workflows.
    prisma.workflowRun.findMany({
      where: { tenantId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { workflowId: true, status: true, createdAt: true },
    }),
  ]);

  // ─── Aggregate real run counts per flow / per workflow ───
  const runsByFlow = new Map<string, { runs7d: number; lastRun: Date | null }>();
  let ok7d = 0;
  let failed7d = 0;
  let total7d = 0;

  for (const j of flowRunJobs) {
    let flowId: string | undefined;
    try {
      const payload = JSON.parse(j.payload ?? '{}') as { flowId?: string };
      flowId = payload?.flowId;
    } catch { /* unparseable payload → skip attribution */ }

    const in7d = j.createdAt >= since;
    if (in7d) {
      total7d += 1;
      if (j.status === 'SUCCESS') ok7d += 1;
      else if (j.status === 'FAILED') failed7d += 1;
    }
    if (!flowId) continue;
    const agg = runsByFlow.get(flowId) ?? { runs7d: 0, lastRun: null };
    if (in7d) agg.runs7d += 1;
    if (!agg.lastRun || j.createdAt > agg.lastRun) agg.lastRun = j.createdAt;
    runsByFlow.set(flowId, agg);
  }

  const runsByWorkflow = new Map<string, { runs7d: number; lastRun: Date | null }>();
  for (const r of workflowRuns) {
    const in7d = r.createdAt >= since;
    if (in7d) {
      total7d += 1;
      if (r.status === 'SUCCEEDED') ok7d += 1;
      else if (r.status === 'FAILED' || r.status === 'TIMED_OUT') failed7d += 1;
    }
    const agg = runsByWorkflow.get(r.workflowId) ?? { runs7d: 0, lastRun: null };
    if (in7d) agg.runs7d += 1;
    if (!agg.lastRun || r.createdAt > agg.lastRun) agg.lastRun = r.createdAt;
    runsByWorkflow.set(r.workflowId, agg);
  }

  // ─── Compose rows from real specs + real run data ───
  const recipe = new RecipeService();

  const flows = [
    ...flowModules.map((m) => {
      const versionRow = m.activeVersion ?? m.versions[0];
      let trigger = 'manual';
      let steps: number | null = null;
      if (versionRow) {
        try {
          const parsed = recipe.parse(versionRow.specJson);
          if (parsed.type === 'flow.automation') {
            const cfg = parsed.config as { trigger?: string; steps?: unknown[] };
            trigger = TRIGGER_LABELS[String(cfg.trigger)] ?? String(cfg.trigger ?? 'manual').toLowerCase();
            steps = Array.isArray(cfg.steps) ? cfg.steps.length : 0;
          }
        } catch { /* unparseable spec → leave honest defaults */ }
      }
      const agg = runsByFlow.get(m.id);
      return {
        id: m.id,
        name: m.name,
        trigger,
        steps,
        runs7d: agg?.runs7d ?? 0,
        lastRun: agg?.lastRun ? agg.lastRun.toISOString() : null,
        status: m.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT',
        kind: 'module' as const,
        isActive: null as boolean | null,
      };
    }),
    ...workflowDefs.map((w) => {
      let trigger = 'workflow';
      let steps: number | null = null;
      try {
        const spec = JSON.parse(w.specJson) as { trigger?: { provider?: string; event?: string }; nodes?: unknown[] };
        if (spec?.trigger?.provider && spec?.trigger?.event) trigger = `${spec.trigger.provider}/${spec.trigger.event}`;
        if (Array.isArray(spec?.nodes)) steps = spec.nodes.length;
      } catch { /* unparseable spec → leave honest defaults */ }
      const agg = runsByWorkflow.get(w.workflowId);
      return {
        id: w.id,
        name: w.name,
        trigger,
        steps,
        runs7d: agg?.runs7d ?? 0,
        lastRun: agg?.lastRun ? agg.lastRun.toISOString() : null,
        status: w.status.toUpperCase(),
        kind: 'workflow' as const,
        isActive: null as boolean | null,
      };
    }),
    ...schedules.map((s: any) => ({
      id: s.id,
      name: s.name,
      trigger: `schedule/${s.cronExpr}`,
      steps: null as number | null,
      runs7d: null as number | null,
      lastRun: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null,
      status: s.isActive ? 'ACTIVE' : 'PAUSED',
      kind: 'schedule' as const,
      isActive: Boolean(s.isActive),
    })),
  ];

  const active = flows.filter((f) => f.status === 'ACTIVE').length;
  const drafts = flows.filter((f) => f.status === 'DRAFT').length;
  const decided7d = ok7d + failed7d;
  const successRate = decided7d > 0 ? (ok7d / decided7d) * 100 : null;

  return json({ flows, stats: { active, drafts, runs7d: total7d, successRate } });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: 'Shop not found' }, { status: 404 });

  const form = await request.formData();
  const intent = form.get('intent') as string;
  const service = new ScheduleService();
  const activity = new ActivityLogService();

  try {
    if (intent === 'delete') {
      const scheduleId = String(form.get('scheduleId') ?? '');
      if (!scheduleId) return json({ error: 'Missing scheduleId' }, { status: 400 });
      await service.remove(scheduleId, shop.id);
      await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_DELETED', shopId: shop.id, resource: `schedule:${scheduleId}` });
      return json({ ok: true, message: 'Schedule deleted' });
    }

    if (intent === 'toggle') {
      const scheduleId = String(form.get('scheduleId') ?? '');
      if (!scheduleId) return json({ error: 'Missing scheduleId' }, { status: 400 });
      const isActive = form.get('isActive') === 'true';
      await service.toggle(scheduleId, shop.id, isActive);
      await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_TOGGLED', shopId: shop.id, resource: `schedule:${scheduleId}`, details: { isActive } });
      return json({ ok: true, message: isActive ? 'Schedule resumed' : 'Schedule paused' });
    }

    return json({ error: `Unknown intent: ${String(intent)}` }, { status: 400 });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Request failed' }, { status: 500 });
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function FlowsIndex() {
  const { flows, stats } = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <FlowsBody flows={flows} stats={stats} />
    </MerchantShell>
  );
}

function FlowsBody({ flows, stats }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const scheduleFetcher = useFetcher();
  const [search, setSearch] = useState('');
  const [del, setDel] = useState<any>(null);

  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(interval); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  // Toast strictly from the server's action response.
  useEffect(() => {
    const d = scheduleFetcher.data as { ok?: boolean; message?: string; error?: string } | undefined;
    if (!d || scheduleFetcher.state !== 'idle') return;
    if (d.ok) ctx.toast(d.message ?? 'Done');
    else if (d.error) ctx.toast(d.error, { error: true });
  }, [scheduleFetcher.data, scheduleFetcher.state, ctx]);

  const toggleSchedule = (r: any) => {
    scheduleFetcher.submit(
      { intent: 'toggle', scheduleId: r.id, isActive: String(!r.isActive) },
      { method: 'post' },
    );
  };
  const confirmDelete = () => {
    if (!del) return;
    scheduleFetcher.submit({ intent: 'delete', scheduleId: del.id }, { method: 'post' });
    setDel(null);
  };

  const rows = flows.filter((f: any) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <s-page heading="Flows" inlineSize="base">
      <s-button slot="primary-action" variant="primary" icon="plus" onClick={() => navigate('/flows/build/new')}>
        Build a flow
      </s-button>
      <s-button slot="secondary-actions" icon="theme-template" onClick={() => ctx.go('#/app/templates?type=Flow')}>
        Templates
      </s-button>
      <s-paragraph color="subdued">
        Automate work: when something happens in your store, run steps automatically. Build visually, monitor every run.{' '}
        <LearnMore anchor="guide-flows" topic="flows" />
      </s-paragraph>
      <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
        <StatTile label="Active flows" value={stats.active} />
        <StatTile label="Runs (7d)" value={fmtNum(stats.runs7d)} />
        <StatTile label="Drafts" value={stats.drafts} />
        <StatTile
          label="Success rate (7d)"
          value={stats.successRate == null ? '—' : `${stats.successRate.toFixed(1)}%`}
          sub={stats.successRate == null ? 'No runs yet' : undefined}
        />
      </s-grid>
      {flows.length === 0 ? (
        <s-section>
          <EmptyState icon="automation" heading="No flows yet"
            action={<s-button variant="primary" onClick={() => navigate('/flows/build/new')}>Build a flow</s-button>}>
            Build your first automation — run steps automatically when something happens in your store.
          </EmptyState>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-grid slot="filters" gridTemplateColumns="1fr" gap="small-100">
              <s-search-field
                label="Search flows"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search flows…"
                onInput={(e) => setSearch(e.currentTarget.value ?? '')}
              />
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">Flow</s-table-header>
              <s-table-header>Trigger</s-table-header>
              <s-table-header>Steps</s-table-header>
              <s-table-header>Runs (7d)</s-table-header>
              <s-table-header listSlot="kicker">Last run</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r: any) => (
                <s-table-row key={r.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-100" alignItems="center">
                      {r.kind === 'module'
                        ? <s-link href={`/flows/build/${r.id}`}><s-text type="strong">{r.name}</s-text></s-link>
                        : <s-text type="strong">{r.name}</s-text>}
                      {r.kind === 'workflow' && <s-badge tone="info">Template workflow</s-badge>}
                      {r.kind === 'schedule' && <s-badge tone="neutral">Schedule</s-badge>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell><MonoChip>{r.trigger}</MonoChip></s-table-cell>
                  <s-table-cell>{fmtNum(r.steps)}</s-table-cell>
                  <s-table-cell>{fmtNum(r.runs7d)}</s-table-cell>
                  <s-table-cell><s-text tone="neutral" color="subdued">{timeAgo(r.lastRun)}</s-text></s-table-cell>
                  <s-table-cell><StatusBadge status={r.status} /></s-table-cell>
                  <s-table-cell>
                    {r.kind === 'module' && (
                      <s-button
                        variant="tertiary"
                        icon="edit"
                        accessibilityLabel={`Open ${r.name} in builder`}
                        href={`/flows/build/${r.id}`}
                      />
                    )}
                    {r.kind === 'schedule' && (
                      <s-stack direction="inline" gap="small-300">
                        <s-button
                          variant="tertiary"
                          icon={r.isActive ? 'pause-circle' : 'play'}
                          accessibilityLabel={r.isActive ? `Pause ${r.name}` : `Resume ${r.name}`}
                          onClick={() => toggleSchedule(r)}
                        />
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          icon="delete"
                          accessibilityLabel={`Delete ${r.name}`}
                          onClick={() => setDel(r)}
                        />
                      </s-stack>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {rows.length === 0 && (
            <EmptyState heading="Nothing here">No flows match your search.</EmptyState>
          )}
        </s-section>
      )}
      <ConfirmModal
        open={!!del}
        heading="Delete schedule?"
        tone="critical"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDel(null)}
      >
        <s-paragraph>This removes “{del?.name}”. Flows it triggers will no longer run on this schedule.</s-paragraph>
      </ConfirmModal>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
