import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService, logRequestOutcome } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Btn, Badge, Card, CardHead, PageHead, Tabs, Field, Input, Select, Toggle, Avatar,
  DataTable, Menu, Modal, Icon, titleCase,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();

  let shopRow = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { subscription: true },
  });

  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
      include: { subscription: true },
    });
  }

  const moduleCount = await prisma.module.count({ where: { shopId: shopRow.id } });
  const connectorCount = await prisma.connector.count({ where: { shopId: shopRow.id } });
  const scheduleCount = await prisma.flowSchedule.count({ where: { shopId: shopRow.id } });

  return json({
    shop: {
      domain: session.shop,
      planTier: shopRow.planTier,
      retentionDaysDefault: shopRow.retentionDaysDefault,
      retentionDaysAi: shopRow.retentionDaysAi,
      retentionDaysApi: shopRow.retentionDaysApi,
      retentionDaysErrors: shopRow.retentionDaysErrors,
      subscription: shopRow.subscription ? {
        planName: shopRow.subscription.planName,
        status: shopRow.subscription.status,
        trialEndsAt: shopRow.subscription.trialEndsAt?.toISOString() ?? null,
      } : null,
    },
    counts: { modules: moduleCount, connectors: connectorCount, schedules: scheduleCount },
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const activity = new ActivityLogService();

  if (intent === 'retention') {
    const parse = (v: FormDataEntryValue | null) => {
      const n = parseInt(String(v ?? ''), 10);
      return isNaN(n) || n <= 0 ? null : n;
    };
    await prisma.shop.update({
      where: { id: shopRow.id },
      data: {
        retentionDaysDefault: parse(form.get('retentionDefault')) ?? 30,
        retentionDaysAi: parse(form.get('retentionAi')),
        retentionDaysApi: parse(form.get('retentionApi')),
        retentionDaysErrors: parse(form.get('retentionErrors')),
      },
    });
    await activity.log({
      actor: 'MERCHANT', action: 'STORE_SETTINGS_UPDATED',
      shopId: shopRow.id, details: { section: 'retention' },
    });
    await logRequestOutcome({ shopId: shopRow.id, pathOrIntent: 'settings/retention', success: true });
    return json({ success: true, message: 'Data retention settings saved.' });
  }

  await logRequestOutcome({ shopId: shopRow.id, pathOrIntent: 'settings/action', success: false, details: { intent } });
  return json({ error: 'Unknown action' }, { status: 400 });
}

export default function SettingsPage() {
  const { shop, counts } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <SettingsBody shop={shop} counts={counts} />
    </MerchantShell>
  );
}

function SettingsBody({ shop, counts }: any) {
  const ctx = useMerchantCtx();
  const retentionFetcher = useFetcher<{ success?: boolean; message?: string; error?: string }>();
  const [tab, setTab] = useState('account');
  const [invite, setInvite] = useState(false);
  const ownerName = titleCase(shop.domain.split('.')[0].replace(/[-_]/g, ' '));

  const [retDefault, setRetDefault] = useState(String(shop.retentionDaysDefault ?? 30));
  const [retAi, setRetAi] = useState(String(shop.retentionDaysAi ?? ''));
  const [retApi, setRetApi] = useState(String(shop.retentionDaysApi ?? ''));
  const [retErrors, setRetErrors] = useState(String(shop.retentionDaysErrors ?? ''));

  useEffect(() => {
    if (retentionFetcher.state === 'idle' && retentionFetcher.data?.success) ctx.toast(retentionFetcher.data.message || 'Settings saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retentionFetcher.state, retentionFetcher.data]);

  const saveRetention = () => {
    retentionFetcher.submit(
      { intent: 'retention', retentionDefault: retDefault, retentionAi: retAi, retentionApi: retApi, retentionErrors: retErrors },
      { method: 'post' },
    );
  };

  const tabs = ['account', 'general', 'storefront', 'notifications', 'team'].map((x) => ({ id: x, label: titleCase(x) }));

  return (
    <div className="page page-narrow">
      <PageHead title="Settings" sub="Manage your account, store defaults, notifications and team." />
      <Card style={{ marginBottom: 18 }}><Tabs active={tab} onChange={setTab} tabs={tabs} /></Card>

      {tab === 'account' && (
        <Card pad>
          <div className="stack-5">
            <div className="row-3"><Avatar name={ownerName} size={48} /><Btn size="sm" onClick={() => ctx.toast('Choose a photo')}>Change photo</Btn></div>
            <Field label="Full name"><Input defaultValue={ownerName} /></Field>
            <Field label="Email"><Input type="email" defaultValue={`owner@${shop.domain.split('.')[0]}.com`} /></Field>
            <Field label="New password" optional help="Leave blank to keep your current password"><Input type="password" placeholder="••••••••" /></Field>
            <label className="checkbox"><Toggle defaultChecked /><span className="t-sm">Two-factor authentication enabled</span></label>
            <div className="divider" />
            <div className="row-2"><Btn variant="primary" onClick={() => ctx.toast('Account saved')}>Save</Btn><Btn className="btn-plain-subdued" onClick={() => ctx.go('#/app')}>Back to dashboard</Btn></div>
          </div>
        </Card>
      )}

      {tab === 'general' && (
        <Card pad>
          <div className="stack-5">
            <Field label="Store domain"><Input defaultValue={shop.domain} disabled /></Field>
            <Field label="Default AI behaviour" help="How adventurous generated modules should be">
              <Select options={['Conservative — safest defaults', 'Balanced', 'Creative']} value="Balanced" onChange={() => {}} />
            </Field>
            <div className="divider" />
            <div className="t-h3">Data retention</div>
            <div className="t-xs t-muted">How long to keep logs and AI usage records (days). Blank disables auto-cleanup.</div>
            <Field label="Default retention (days)"><Input type="number" value={retDefault} onChange={(e: any) => setRetDefault(e.target.value)} /></Field>
            <Field label="AI usage (days)" optional><Input type="number" value={retAi} onChange={(e: any) => setRetAi(e.target.value)} /></Field>
            <Field label="API logs (days)" optional><Input type="number" value={retApi} onChange={(e: any) => setRetApi(e.target.value)} /></Field>
            <Field label="Error logs (days)" optional><Input type="number" value={retErrors} onChange={(e: any) => setRetErrors(e.target.value)} /></Field>
            <div><Btn variant="primary" loading={retentionFetcher.state !== 'idle'} onClick={saveRetention}>Save</Btn></div>
            <div className="divider" />
            <div className="t-xs t-muted">{counts.modules} modules · {counts.connectors} connectors · {counts.schedules} schedules</div>
          </div>
        </Card>
      )}

      {tab === 'storefront' && (
        <Card pad>
          <div className="stack-5">
            <Field label="Brand color" help="Used as the default accent in generated modules"><Input mono defaultValue="#1F3A5F" /></Field>
            <Field label="Default corner radius"><Select options={['None', 'Small', 'Medium', 'Large']} value="Medium" onChange={() => {}} /></Field>
            <label className="checkbox"><Toggle defaultChecked /><span className="t-sm">Respect reduced-motion preferences</span></label>
          </div>
        </Card>
      )}

      {tab === 'notifications' && (
        <Card pad>
          <div className="stack-4">
            {([['Module published', true], ['Flow run failed', true], ['Approaching usage limit', true], ['Weekly summary email', false]] as [string, boolean][]).map((n, i) => (
              <label key={i} className="row spread" style={{ padding: '6px 0' }}><span className="t-sm">{n[0]}</span><Toggle defaultChecked={n[1]} /></label>
            ))}
          </div>
        </Card>
      )}

      {tab === 'team' && (
        <Card>
          <CardHead title="Team members" actions={<Btn size="sm" icon="plus" onClick={() => setInvite(true)}>Invite</Btn>} />
          <DataTable rowKey="email" columns={[
            { key: 'name', label: 'Member', render: (r: any) => (
              <div className="row-3"><Avatar name={r.name} size={28} /><div className="stack" style={{ gap: 0 }}><span className="cell-strong">{r.name}</span><span className="cell-sub">{r.email}</span></div></div>
            ) },
            { key: 'role', label: 'Role', render: (r: any) => <Badge>{r.role}</Badge> },
            { key: 'act', label: '', render: (r: any) => (
              <div className="dt-actions"><Menu trigger={<button className="btn btn-icon btn-sm btn-plain"><Icon name="dotsH" size={16} /></button>} items={[
                { icon: 'edit', label: 'Change role', onClick: () => ctx.toast(`Role updated for ${r.name}`) },
                { icon: 'chat', label: 'Resend invite', onClick: () => ctx.toast('Invite resent') },
                { divider: true },
                { icon: 'trash', label: 'Remove', tone: 'critical', onClick: () => ctx.toast(`Removed ${r.name}`) },
              ]} /></div>
            ) },
          ]} rows={[{ name: ownerName, email: `owner@${shop.domain.split('.')[0]}.com`, role: 'Owner' }]} />
        </Card>
      )}

      {invite && (
        <Modal title="Invite a teammate" sub="They’ll get an email invitation to join your store." onClose={() => setInvite(false)}
          footer={<><span className="grow" /><Btn onClick={() => setInvite(false)}>Cancel</Btn><Btn variant="primary" onClick={() => { setInvite(false); ctx.toast('Invitation sent'); }}>Send invite</Btn></>}>
          <div className="stack-4">
            <Field label="Email"><Input type="email" placeholder="name@company.com" autoFocus /></Field>
            <Field label="Role"><Select options={['Editor', 'Admin', 'Viewer']} value="Editor" onChange={() => {}} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
