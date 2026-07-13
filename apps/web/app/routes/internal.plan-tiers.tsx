import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  getAllPlanConfigs,
  updatePlanTier,
  seedPlanTiersIfEmpty,
} from '~/services/billing/plan-config.service';
import type { PlanConfig } from '~/services/billing/billing.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  Btn,
  Badge,
  Icon,
  Field,
  Input,
  Modal,
  PageHead,
  fmtQuota,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  await seedPlanTiersIfEmpty();
  const plans = await getAllPlanConfigs();
  return json({ plans });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (intent !== 'update') return json({ error: 'Unknown intent' }, { status: 400 });

  const name = String(form.get('name') ?? '').trim();
  if (!name) return json({ error: 'Missing plan name' }, { status: 400 });

  const displayName = String(form.get('displayName') ?? '').trim();
  const price = parseFloat(String(form.get('price') ?? '0'));
  const trialDays = parseInt(String(form.get('trialDays') ?? '0'), 10);
  const quotasJson = form.get('quotas');
  let quotas: PlanConfig['quotas'];
  try {
    quotas = JSON.parse(typeof quotasJson === 'string' ? quotasJson : '{}') as PlanConfig['quotas'];
  } catch {
    return json({ error: 'Invalid quotas JSON' }, { status: 400 });
  }
  const allowedKeys: (keyof PlanConfig['quotas'])[] = [
    'aiRequestsPerMonth',
    'publishOpsPerMonth',
    'workflowRunsPerMonth',
    'connectorCallsPerMonth',
    'modulesTotal',
  ];
  const normalized: PlanConfig['quotas'] = {
    aiRequestsPerMonth: 0,
    publishOpsPerMonth: 0,
    workflowRunsPerMonth: 0,
    connectorCallsPerMonth: 0,
    modulesTotal: 0,
  };
  for (const key of allowedKeys) {
    const v = quotas[key];
    if (typeof v === 'number' && v >= -1) normalized[key] = v;
  }

  const finalPrice = price === -1 ? -1 : Math.max(0, price);
  await updatePlanTier(name, {
    displayName: displayName || name,
    price: finalPrice,
    trialDays: Math.max(0, trialDays),
    quotas: normalized,
  });
  await new ActivityLogService().log({
    actor: 'INTERNAL_ADMIN',
    action: 'STORE_SETTINGS_UPDATED',
    details: { section: 'planTier', planName: name },
  });
  return json({ toast: { message: `Plan ${name} updated` } });
}

const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };

export default function AdminPlanTiers() {
  const data = useLoaderData<typeof loader>();
  const [edit, setEdit] = useState<any>(null);

  const TIERS: any[] = data.plans.map((p: any) => ({
    id: p.name,
    name: p.name,
    display: p.displayName ?? p.name,
    price: p.price,
    trialDays: p.trialDays ?? 0,
    ai: p.quotas?.aiRequestsPerMonth ?? 0,
    publish: p.quotas?.publishOpsPerMonth ?? 0,
    workflows: p.quotas?.workflowRunsPerMonth ?? 0,
    connectors: p.quotas?.connectorCallsPerMonth ?? 0,
    modules: p.quotas?.modulesTotal ?? 0,
  }));

  return (
    <div className="page">
      <PageHead
        title="Plan Tiers"
        sub="Define quotas, pricing and trial length for each plan. -1 means unlimited / “Contact us”."
      />
      <div className="grid grid-5 plan-tier-grid">
        {TIERS.map((p) => (
          <div key={p.id} className="card card-pad plan-tier-card">
            <div className="row spread" style={{ marginBottom: 4 }}>
              <Badge tone={PLAN_TONE[p.name]}>{p.name}</Badge>
              <button className="btn btn-icon btn-sm btn-plain" onClick={() => setEdit(p)}>
                <Icon name="edit" size={15} />
              </button>
            </div>
            <div className="t-h2" style={{ marginTop: 6 }}>
              {p.display}
            </div>
            <div className="row-1" style={{ alignItems: 'baseline', margin: '4px 0 14px' }}>
              {p.price === -1 ? (
                <span className="t-h3">Contact us</span>
              ) : (
                <>
                  <span className="t-h1" style={{ fontSize: 24 }}>
                    ${p.price}
                  </span>
                  <span className="t-muted t-xs">/mo</span>
                </>
              )}
            </div>
            <div className="divider" style={{ marginBottom: 12 }} />
            <dl className="kv" style={{ gridTemplateColumns: '1fr auto', gap: '7px 8px' }}>
              {([
                ['AI / mo', fmtQuota(p.ai)],
                ['Publishes', fmtQuota(p.publish)],
                ['Workflows', fmtQuota(p.workflows)],
                ['Connectors', fmtQuota(p.connectors)],
                ['Trial', p.trialDays + 'd'],
              ] as any[]).map((r, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  <dt className="t-xs">{r[0]}</dt>
                  <dd className="t-xs t-strong t-num" style={{ textAlign: 'right' }}>
                    {r[1]}
                  </dd>
                </span>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {edit && <PlanModal tier={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

type PlanActionData = { toast?: { message: string }; error?: string };

function PlanModal({ tier, onClose }: { tier: any; onClose: () => void }) {
  const ctx = useAdminCtx();
  const fetcher = useFetcher<PlanActionData>();
  const [f, setF] = useState({ name: '', display: '', price: 0, trialDays: 0, ai: 0, publish: 0, workflows: 0, connectors: 0, modules: 0, ...tier });
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }));

  // Toast the server response; close the modal only after a successful persist.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) ctx.toast(fetcher.data.error, true);
      else if (fetcher.data.toast?.message) {
        ctx.toast(fetcher.data.toast.message);
        onClose();
      }
    }
  }, [fetcher.state, fetcher.data, ctx, onClose]);

  const save = () => {
    const quotas = JSON.stringify({
      aiRequestsPerMonth: Number(f.ai) || 0,
      publishOpsPerMonth: Number(f.publish) || 0,
      workflowRunsPerMonth: Number(f.workflows) || 0,
      connectorCallsPerMonth: Number(f.connectors) || 0,
      modulesTotal: Number(f.modules) || 0,
    });
    fetcher.submit(
      {
        intent: 'update',
        name: f.name,
        displayName: f.display,
        price: String(f.price),
        trialDays: String(f.trialDays),
        quotas,
      },
      { method: 'post' },
    );
  };
  return (
    <Modal
      title={'Edit ' + f.display + ' plan'}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} loading={fetcher.state !== 'idle'}>
            Save plan
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Internal name" help="Fixed identifier — not editable">
            <Input value={f.name} readOnly disabled placeholder="GROWTH" />
          </Field>
          <Field label="Display name">
            <Input value={f.display} onChange={(e: any) => set('display', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-2">
          <Field label="Price (USD/mo)" help="-1 = Contact us">
            <Input type="number" value={f.price} onChange={(e: any) => set('price', e.target.value)} />
          </Field>
          <Field label="Trial days">
            <Input type="number" value={f.trialDays} onChange={(e: any) => set('trialDays', e.target.value)} />
          </Field>
        </div>
        <div className="t-h3">
          Quotas <span className="t-xs t-muted">(-1 = unlimited)</span>
        </div>
        <div className="grid grid-2">
          <Field label="AI requests / mo">
            <Input type="number" value={f.ai} onChange={(e: any) => set('ai', e.target.value)} />
          </Field>
          <Field label="Publish ops / mo">
            <Input type="number" value={f.publish} onChange={(e: any) => set('publish', e.target.value)} />
          </Field>
          <Field label="Workflow runs / mo">
            <Input type="number" value={f.workflows} onChange={(e: any) => set('workflows', e.target.value)} />
          </Field>
          <Field label="Connectors">
            <Input type="number" value={f.connectors} onChange={(e: any) => set('connectors', e.target.value)} />
          </Field>
          <Field label="Modules total">
            <Input type="number" value={f.modules} onChange={(e: any) => set('modules', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
