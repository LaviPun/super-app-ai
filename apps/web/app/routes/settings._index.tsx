import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService, logRequestOutcome } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Tabs } from '~/components/merchant/polaris';

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
    <MerchantShell polaris>
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
  const initials = String(ownerDisplay).split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (retentionFetcher.state === 'idle' && retentionFetcher.data) {
      if (retentionFetcher.data.success) ctx.toast(retentionFetcher.data.message || 'Settings saved');
      else if (retentionFetcher.data.error) ctx.toast(retentionFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retentionFetcher.state, retentionFetcher.data]);

  // Account details are read-only mirrors of Shopify (no app-level user accounts);
  // notifications / storefront / team tabs were removed — nothing real backs them.
  const tabs = [{ id: 'account', label: 'Account' }, { id: 'general', label: 'General' }];

  return (
    <s-page heading="Settings" inlineSize="small">
      <s-paragraph color="subdued">Manage your account details and store defaults.</s-paragraph>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'account' && (
        <s-section heading="Account">
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-avatar initials={initials} alt={ownerDisplay} size="large" />
              <s-stack gap="none">
                <s-text type="strong">{ownerDisplay}</s-text>
                <s-text tone="neutral" color="subdued">Store owner</s-text>
              </s-stack>
            </s-stack>
            <s-text-field label="Store name" value={account.storeName ?? shop.domain} disabled />
            <s-text-field
              label="Owner email"
              value={account.email ?? ''}
              disabled
              details="Account details come from Shopify and are managed in your Shopify admin."
            />
            <s-divider />
            <s-stack direction="inline" gap="small-100">
              <s-button
                href={`https://admin.shopify.com/store/${storeHandle}/settings/general`}
                target="_blank"
                icon="external"
              >
                Manage in Shopify
              </s-button>
              <s-button variant="tertiary" onClick={() => ctx.go('#/app')}>Back to dashboard</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {tab === 'general' && (
        <s-section heading="General">
          <retentionFetcher.Form method="post">
            <input type="hidden" name="intent" value="retention" />
            <s-stack gap="base">
              <s-text-field label="Store domain" defaultValue={shop.domain} disabled />
              <s-divider />
              <s-heading>Data retention</s-heading>
              <s-text tone="neutral" color="subdued">
                How long to keep logs and AI usage records (days). Blank disables auto-cleanup.
              </s-text>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-number-field label="Default retention (days)" name="retentionDefault" defaultValue={String(shop.retentionDaysDefault ?? 30)} min={1} />
                <s-number-field label="AI usage (days)" name="retentionAi" defaultValue={String(shop.retentionDaysAi ?? '')} min={1} />
                <s-number-field label="API logs (days)" name="retentionApi" defaultValue={String(shop.retentionDaysApi ?? '')} min={1} />
                <s-number-field label="Error logs (days)" name="retentionErrors" defaultValue={String(shop.retentionDaysErrors ?? '')} min={1} />
              </s-grid>
              <s-stack direction="inline">
                <s-button variant="primary" type="submit" loading={retentionFetcher.state !== 'idle' || undefined}>
                  Save
                </s-button>
              </s-stack>
              <s-divider />
              <s-text tone="neutral" color="subdued">
                {counts.modules} modules · {counts.connectors} connectors · {counts.schedules} schedules
              </s-text>
            </s-stack>
          </retentionFetcher.Form>
        </s-section>
      )}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
