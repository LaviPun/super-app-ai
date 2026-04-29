import { json, redirect } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, TextField, Button, Select, Checkbox,
  Banner, InlineStack, InlineGrid, Divider, Badge, SkeletonBodyText,
} from '@shopify/polaris';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService, logRequestOutcome } from '~/services/activity/activity.service';

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
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  const [retDefault, setRetDefault] = useState(String(shop.retentionDaysDefault ?? 30));
  const [retAi, setRetAi] = useState(String(shop.retentionDaysAi ?? ''));
  const [retApi, setRetApi] = useState(String(shop.retentionDaysApi ?? ''));
  const [retErrors, setRetErrors] = useState(String(shop.retentionDaysErrors ?? ''));

  return (
    <Page title="Settings" backAction={{ content: 'Home', url: '/' }}>
      <BlockStack gap="500">
        {'success' in (actionData ?? {}) && (actionData as { success: boolean; message: string } | undefined)?.success && (
          <Banner tone="success" title="Saved">
            <Text as="p">{(actionData as { success: boolean; message: string }).message}</Text>
          </Banner>
        )}

        {/* ─── Account overview ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Account overview</Text>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Store</Text>
                <Text as="p" variant="headingSm">{shop.domain}</Text>
              </BlockStack>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Current plan</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={shop.subscription ? 'success' : 'attention'}>
                    {shop.subscription?.planName ?? 'Free'}
                  </Badge>
                  {shop.subscription && (
                    <Text as="span" tone="subdued" variant="bodySm">{shop.subscription.status}</Text>
                  )}
                </InlineStack>
              </BlockStack>
            </InlineGrid>
            <Divider />
            <InlineGrid columns={{ xs: 3 }} gap="400">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Modules</Text>
                <Text as="p" variant="headingSm">{counts.modules}</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Connectors</Text>
                <Text as="p" variant="headingSm">{counts.connectors}</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Schedules</Text>
                <Text as="p" variant="headingSm">{counts.schedules}</Text>
              </BlockStack>
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* ─── Data retention ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Data retention</Text>
            <Text as="p" tone="subdued">
              Control how long different data types are kept. Set to blank to inherit the default.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="retention" />
              <BlockStack gap="300">
                <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                  <TextField label="Default (days)" name="retentionDefault" type="number" value={retDefault} onChange={setRetDefault} autoComplete="off" helpText="Fallback for all data types." />
                  <TextField label="AI usage (days)" name="retentionAi" type="number" value={retAi} onChange={setRetAi} autoComplete="off" placeholder="inherit" helpText="AI generation logs." />
                  <TextField label="API logs (days)" name="retentionApi" type="number" value={retApi} onChange={setRetApi} autoComplete="off" placeholder="inherit" helpText="API request logs." />
                  <TextField label="Error logs (days)" name="retentionErrors" type="number" value={retErrors} onChange={setRetErrors} autoComplete="off" placeholder="inherit" helpText="Error / debug logs." />
                </InlineGrid>
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save retention settings</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        {/* ─── Defaults & preferences (extensible) ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Preferences</Text>
            <Text as="p" tone="subdued">
              Default preferences for new modules and AI generation. More options will be added here as new features ship.
            </Text>
            <Banner tone="info">
              <Text as="p">
                Default module type, default AI model, notification preferences, and more settings coming soon.
                For now you can manage your plan on the <Link to="/billing">Billing</Link> page.
              </Text>
            </Banner>
          </BlockStack>
        </Card>

        {/* ─── Danger zone ─── */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd" tone="critical">Danger zone</Text>
            <Text as="p" tone="subdued">
              These actions are destructive and cannot be undone.
            </Text>
            <InlineStack gap="300">
              <Button tone="critical" variant="secondary" disabled>Delete all modules</Button>
              <Button tone="critical" variant="secondary" disabled>Purge logs</Button>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Destructive actions are disabled in this version. Contact support to request bulk operations.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return <a href={to} style={{ color: '#2C6ECB' }}>{children}</a>;
}
