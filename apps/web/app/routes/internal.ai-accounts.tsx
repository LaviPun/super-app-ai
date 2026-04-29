import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import { Banner, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Text } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { AiAccountObservabilityService } from '~/services/internal/ai-account-observability.service';

function parseOptionalNumber(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid number: ${text}`);
  return num;
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const service = new AiAccountObservabilityService();
  const providers = await service.listProviderAccountSnapshots();

  const totalSpend24hUsd = providers.reduce((sum, p) => sum + p.spend24hUsd, 0);
  const totalSpend7dUsd = providers.reduce((sum, p) => sum + p.spend7dUsd, 0);
  const coveredDailyLimits = providers.filter((p) => p.dailyLimitUsd != null).length;
  const coveredAccountIds = providers.filter((p) => p.accountId).length;

  return json({
    providers,
    summary: {
      totalProviders: providers.length,
      totalSpend24hUsd,
      totalSpend7dUsd,
      coveredDailyLimits,
      coveredAccountIds,
    },
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  if (intent !== 'save-account') return json({ ok: false, error: 'Unknown intent' }, { status: 400 });

  const providerId = String(formData.get('providerId') ?? '');
  if (!providerId) return json({ ok: false, error: 'Missing providerId' }, { status: 400 });

  try {
    const service = new AiAccountObservabilityService();
    await service.updateProviderAccount(providerId, {
      accountName: String(formData.get('accountName') ?? ''),
      accountEmail: String(formData.get('accountEmail') ?? ''),
      accountId: String(formData.get('accountId') ?? ''),
      dashboardUrl: String(formData.get('dashboardUrl') ?? ''),
      currentBalanceUsd: parseOptionalNumber(formData.get('currentBalanceUsd')),
      dailyLimitUsd: parseOptionalNumber(formData.get('dailyLimitUsd')),
      alertLimitUsd: parseOptionalNumber(formData.get('alertLimitUsd')),
      currency: String(formData.get('currency') ?? 'USD'),
    });
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'PROVIDER_EXTRA_CONFIG_UPDATED',
      resource: `provider:${providerId}`,
    });
    return redirect('/internal/ai-accounts');
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to save provider account info' },
      { status: 400 },
    );
  }
}

export default function InternalAiAccounts() {
  const { providers, summary } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state !== 'idle';

  return (
    <Page title="AI Accounts & Limits" subtitle="Track API account details, limits, and spend usage.">
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Providers</Text>
              <Text as="p" variant="headingLg">{summary.totalProviders}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Spend (24h)</Text>
              <Text as="p" variant="headingLg">${summary.totalSpend24hUsd.toFixed(2)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Spend (7d)</Text>
              <Text as="p" variant="headingLg">${summary.totalSpend7dUsd.toFixed(2)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Coverage</Text>
              <Text as="p" variant="headingLg">
                {summary.coveredDailyLimits}/{summary.totalProviders} limits
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {summary.coveredAccountIds}/{summary.totalProviders} account IDs
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {providers.length === 0 ? (
          <Banner tone="warning" title="No AI providers found">
            <Text as="p" variant="bodySm">Add providers first in `internal/ai-providers`.</Text>
          </Banner>
        ) : null}

        {providers.map((provider) => (
          <Card key={provider.providerId}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">{provider.providerName}</Text>
                  <Text as="span" variant="bodySm" tone="subdued">{provider.providerKind}</Text>
                </InlineStack>
                <Text as="span" variant="bodySm" tone={provider.isActive ? 'success' : 'subdued'}>
                  {provider.isActive ? 'Active' : 'Inactive'}
                </Text>
              </InlineStack>

              <InlineGrid columns={{ xs: 1, md: 3 }} gap="200">
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Daily limit left</Text>
                    <Text as="p" variant="headingMd">
                      {provider.remainingDailyUsd == null ? '—' : `$${provider.remainingDailyUsd.toFixed(2)}`}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">24h spend: ${provider.spend24hUsd.toFixed(2)}</Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Balance left</Text>
                    <Text as="p" variant="headingMd">
                      {provider.remainingBalanceUsd == null ? '—' : `$${provider.remainingBalanceUsd.toFixed(2)}`}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">7d spend: ${provider.spend7dUsd.toFixed(2)}</Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">API requests</Text>
                    <Text as="p" variant="headingMd">{provider.request24h} / 24h</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{provider.request7d} / 7d</Text>
                  </BlockStack>
                </Card>
              </InlineGrid>

              <Form method="post">
                <input type="hidden" name="intent" value="save-account" />
                <input type="hidden" name="providerId" value={provider.providerId} />
                <BlockStack gap="200">
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                    <label>
                      <Text as="span" variant="bodySm">Account name</Text>
                      <input name="accountName" defaultValue={provider.accountName ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Account email</Text>
                      <input name="accountEmail" defaultValue={provider.accountEmail ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Account ID</Text>
                      <input name="accountId" defaultValue={provider.accountId ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Dashboard URL</Text>
                      <input name="dashboardUrl" defaultValue={provider.dashboardUrl ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Current balance (USD)</Text>
                      <input name="currentBalanceUsd" type="number" defaultValue={provider.currentBalanceUsd?.toString() ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Daily limit (USD)</Text>
                      <input name="dailyLimitUsd" type="number" defaultValue={provider.dailyLimitUsd?.toString() ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Alert limit (USD)</Text>
                      <input name="alertLimitUsd" type="number" defaultValue={provider.alertLimitUsd?.toString() ?? ''} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                    <label>
                      <Text as="span" variant="bodySm">Currency</Text>
                      <input name="currency" defaultValue={provider.currency} style={{ width: '100%', marginTop: 4 }} />
                    </label>
                  </InlineGrid>
                  <InlineStack align="end">
                    <Button submit variant="primary" loading={isSaving}>Save account info</Button>
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
