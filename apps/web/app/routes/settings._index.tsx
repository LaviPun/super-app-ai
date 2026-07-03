import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService, logRequestOutcome } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Btn, Card, PageHead, Tabs, Field, Input, Avatar, Icon,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

type ShopInfo = { storeName: string | null; ownerName: string | null; email: string | null };

export async function loader({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
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

  // Real account details straight from Shopify — this app has no user accounts of its own.
  const fetchShopInfo = async (): Promise<ShopInfo> => {
    try {
      const res = await admin.graphql(`#graphql
        query SettingsShopInfo { shop { name email shopOwnerName } }`);
      const data = (await res.json()) as { data?: { shop?: { name?: string; email?: string; shopOwnerName?: string } } };
      return {
        storeName: data?.data?.shop?.name ?? null,
        ownerName: data?.data?.shop?.shopOwnerName ?? null,
        email: data?.data?.shop?.email ?? null,
      };
    } catch {
      return { storeName: null, ownerName: null, email: null };
    }
  };

  const [moduleCount, connectorCount, scheduleCount, account] = await Promise.all([
    prisma.module.count({ where: { shopId: shopRow.id } }),
    prisma.connector.count({ where: { shopId: shopRow.id } }),
    prisma.flowSchedule.count({ where: { shopId: shopRow.id } }),
    fetchShopInfo(),
  ]);

  return json({
    account,
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
  const { shop, counts, account } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <SettingsBody shop={shop} counts={counts} account={account} />
    </MerchantShell>
  );
}

function SettingsBody({ shop, counts, account }: any) {
  const ctx = useMerchantCtx();
  const retentionFetcher = useFetcher<{ success?: boolean; message?: string; error?: string }>();
  const [tab, setTab] = useState('account');
  const storeHandle = encodeURIComponent(shop.domain.replace('.myshopify.com', ''));
  const ownerDisplay = account.ownerName ?? account.storeName ?? shop.domain;

  const [retDefault, setRetDefault] = useState(String(shop.retentionDaysDefault ?? 30));
  const [retAi, setRetAi] = useState(String(shop.retentionDaysAi ?? ''));
  const [retApi, setRetApi] = useState(String(shop.retentionDaysApi ?? ''));
  const [retErrors, setRetErrors] = useState(String(shop.retentionDaysErrors ?? ''));

  useEffect(() => {
    if (retentionFetcher.state === 'idle' && retentionFetcher.data) {
      if (retentionFetcher.data.success) ctx.toast(retentionFetcher.data.message || 'Settings saved');
      else if (retentionFetcher.data.error) ctx.toast(retentionFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retentionFetcher.state, retentionFetcher.data]);

  const saveRetention = () => {
    retentionFetcher.submit(
      { intent: 'retention', retentionDefault: retDefault, retentionAi: retAi, retentionApi: retApi, retentionErrors: retErrors },
      { method: 'post' },
    );
  };

  // Account details are read-only mirrors of Shopify (no app-level user accounts);
  // notifications / storefront / team tabs were removed — nothing real backs them.
  const tabs = [{ id: 'account', label: 'Account' }, { id: 'general', label: 'General' }];

  return (
    <div className="page page-narrow">
      <PageHead title="Settings" sub="Manage your account details and store defaults." />
      <Card style={{ marginBottom: 18 }}><Tabs active={tab} onChange={setTab} tabs={tabs} /></Card>

      {tab === 'account' && (
        <Card pad>
          <div className="stack-5">
            <div className="row-3">
              <Avatar name={ownerDisplay} size={48} />
              <div className="stack" style={{ gap: 0 }}>
                <span className="t-strong">{ownerDisplay}</span>
                <span className="t-xs t-muted">Store owner</span>
              </div>
            </div>
            <Field label="Store name"><Input defaultValue={account.storeName ?? shop.domain} disabled /></Field>
            <Field label="Owner email" help="Account details come from Shopify and are managed in your Shopify admin."><Input type="email" defaultValue={account.email ?? ''} disabled /></Field>
            <div className="divider" />
            <div className="row-2">
              <a className="btn" href={`https://admin.shopify.com/store/${storeHandle}/settings/general`} target="_blank" rel="noreferrer"><Icon name="external" size={16} /><span>Manage in Shopify</span></a>
              <Btn className="btn-plain-subdued" onClick={() => ctx.go('#/app')}>Back to dashboard</Btn>
            </div>
          </div>
        </Card>
      )}

      {tab === 'general' && (
        <Card pad>
          <div className="stack-5">
            <Field label="Store domain"><Input defaultValue={shop.domain} disabled /></Field>
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
    </div>
  );
}
