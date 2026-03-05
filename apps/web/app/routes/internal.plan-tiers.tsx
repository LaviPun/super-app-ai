import { json } from '@remix-run/node';
import { Form, useLoaderData, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, TextField, Button, InlineStack, Banner,
  InlineGrid, Divider,
} from '@shopify/polaris';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  getAllPlanConfigs,
  updatePlanTier,
  seedPlanTiersIfEmpty,
} from '~/services/billing/plan-config.service';
import type { PlanConfig } from '~/services/billing/billing.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  await seedPlanTiersIfEmpty();
  const plans = await getAllPlanConfigs();
  return json({ plans });
}

const QUOTA_LABELS: Record<keyof PlanConfig['quotas'], string> = {
  aiRequestsPerMonth: 'AI requests / month',
  publishOpsPerMonth: 'Publish ops / month',
  workflowRunsPerMonth: 'Workflow runs / month',
  connectorCallsPerMonth: 'Connector calls / month',
  modulesTotal: 'Max published modules',
};

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

export default function InternalPlanTiers() {
  const { plans } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSaving = navigation.state !== 'idle';

  return (
    <Page title="Plan tiers" subtitle="View and edit billing plan definitions (quotas, display name, trial).">
      <BlockStack gap="500">
        {actionData && 'toast' in actionData && (
          <Banner tone="success">{(actionData as { toast: { message: string } }).toast.message}</Banner>
        )}
        {actionData && 'error' in actionData && (
          <Banner tone="critical">{(actionData as { error: string }).error}</Banner>
        )}

        {plans.map((plan: PlanConfig) => (
          <Card key={plan.name}>
            <BlockStack gap="400">
              <InlineStack gap="300" blockAlign="center">
                <Text as="h2" variant="headingMd">{plan.name}</Text>
                {plan.price === -1 && (
                  <span style={{ fontSize: 14, color: 'var(--p-color-text-secondary)' }}>— Contact us</span>
                )}
              </InlineStack>
              <Form method="post">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="name" value={plan.name} />
                <BlockStack gap="300">
                  <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                    <TextField
                      label="Display name"
                      name="displayName"
                      defaultValue={plan.displayName}
                      autoComplete="off"
                    />
                    <TextField
                      label="Price (USD/month)"
                      name="price"
                      type="number"
                      min={-1}
                      defaultValue={String(plan.price)}
                      autoComplete="off"
                      helpText={plan.price === -1 ? '−1 = Contact us (no price shown)' : undefined}
                    />
                    <TextField
                      label="Trial days"
                      name="trialDays"
                      type="number"
                      min={0}
                      defaultValue={String(plan.trialDays)}
                      autoComplete="off"
                    />
                  </InlineGrid>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Quotas (use -1 for unlimited). Edit JSON below.
                  </Text>
                  <textarea
                    name="quotas"
                    rows={6}
                    defaultValue={JSON.stringify(plan.quotas, null, 2)}
                    style={{
                      width: '100%',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 12,
                      padding: 8,
                      border: '1px solid var(--p-color-border)',
                      borderRadius: 6,
                      boxSizing: 'border-box',
                      maxHeight: 240,
                      overflowY: 'auto',
                    }}
                    spellCheck={false}
                    aria-label="Quotas JSON"
                  />
                  <InlineStack gap="200">
                    <Button submit variant="primary" loading={isSaving}>
                      Save {plan.name}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>
              <Divider />
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" fontWeight="semibold">Current quotas</Text>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="200">
                  {(Object.keys(plan.quotas) as (keyof PlanConfig['quotas'])[]).map(key => (
                    <Text key={key} as="p" variant="bodySm" tone="subdued">
                      {QUOTA_LABELS[key]}: {plan.quotas[key] === -1 ? 'Unlimited' : plan.quotas[key]}
                    </Text>
                  ))}
                </InlineGrid>
              </BlockStack>
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
