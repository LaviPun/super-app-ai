import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, useNavigate, useRevalidator } from '@remix-run/react';
import { useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { ScheduleService } from '~/services/flows/schedule.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, StatusBadge, Card, PageHead, FilterBar, StatTile, DataTable, MonoChip,
  useTableState, fmtNum,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ flows: [], stats: { active: 0, drafts: 0, runs7d: 0 } });

  const [schedules, flowModules] = await Promise.all([
    new ScheduleService().list(shop.id),
    prisma.module.findMany({
      where: { shopId: shop.id, type: 'flow.automation' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ]);

  // Compose the design's flow rows from real flow.automation modules + schedules.
  const flows = [
    ...flowModules.map((m) => ({
      id: m.id,
      name: m.name,
      trigger: 'workflow/manual',
      steps: 1,
      runs7d: 0,
      lastRun: '—',
      status: m.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT',
      kind: 'module' as const,
    })),
    ...schedules.map((s: any) => ({
      id: s.id,
      name: s.name,
      trigger: 'schedule/cron',
      steps: 1,
      runs7d: 0,
      lastRun: s.nextRunAt ? new Date(s.nextRunAt).toLocaleDateString('en-US') : '—',
      status: s.isActive ? 'ACTIVE' : 'PAUSED',
      kind: 'schedule' as const,
    })),
  ];

  const active = flows.filter((f) => f.status === 'ACTIVE').length;
  const drafts = flows.filter((f) => f.status === 'DRAFT').length;

  return json({ flows, stats: { active, drafts, runs7d: 0 } });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Error('Shop not found');

  const form = await request.formData();
  const intent = form.get('intent') as string;
  const service = new ScheduleService();
  const activity = new ActivityLogService();

  if (intent === 'delete') {
    const scheduleId = String(form.get('scheduleId') ?? '');
    await service.remove(scheduleId, shop.id);
    await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_DELETED', shopId: shop.id, resource: `schedule:${scheduleId}` });
    return redirect('/flows');
  }

  if (intent === 'toggle') {
    const scheduleId = String(form.get('scheduleId') ?? '');
    const isActive = form.get('isActive') === 'true';
    await service.toggle(scheduleId, shop.id, isActive);
    await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_TOGGLED', shopId: shop.id, resource: `schedule:${scheduleId}`, details: { isActive } });
    return redirect('/flows');
  }

  return redirect('/flows');
}

export default function FlowsIndex() {
  const { flows, stats } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <FlowsBody flows={flows} stats={stats} />
    </MerchantShell>
  );
}

function FlowsBody({ flows, stats }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const ts = useTableState();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(interval); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  const rows = flows.filter((f: any) => f.name.toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Flows"
        sub="Automate work: when something happens in your store, run steps automatically. Build visually, monitor every run."
        actions={(
          <>
            <Btn icon="template" onClick={() => ctx.go('#/app/templates?type=Flow')}>Templates</Btn>
            <Btn variant="primary" icon="plus" onClick={() => navigate('/flows/build/new')}>Build a flow</Btn>
          </>
        )}
      />
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatTile label="Active flows" value={stats.active} icon="flow" tone="success" />
        <StatTile label="Runs (7d)" value={fmtNum(stats.runs7d)} icon="bolt" tone="info" />
        <StatTile label="Drafts" value={stats.drafts} icon="edit" tone="warning" />
        <StatTile label="Success rate" value="98.2%" icon="check" tone="success" delta="0.4%" />
      </div>
      <Card>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search flows…" results={rows.length} />
        {rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--p-text-secondary)', fontSize: 14 }}>No flows yet — build your first automation.</div>
        ) : (
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => navigate(r.kind === 'module' ? `/flows/build/${r.id}` : '/flows')}
            columns={[
              { key: 'name', label: 'Flow', render: (r: any) => (
                <div className="row-3">
                  <span className="tile-ico" style={{ width: 30, height: 30, background: 'var(--p-success-bg)', color: 'var(--p-success)' }}><Icon name="flow" size={15} /></span>
                  <span className="cell-strong">{r.name}</span>
                </div>
              ) },
              { key: 'trigger', label: 'Trigger', render: (r: any) => <MonoChip>{r.trigger}</MonoChip> },
              { key: 'steps', label: 'Steps', num: true },
              { key: 'runs7d', label: 'Runs (7d)', num: true, render: (r: any) => fmtNum(r.runs7d) },
              { key: 'lastRun', label: 'Last run', render: (r: any) => <span className="cell-sub">{r.lastRun}</span> },
              { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </div>
  );
}
