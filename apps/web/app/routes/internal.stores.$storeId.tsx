import { useState } from 'react';
import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Select, InlineStack, Button, TextField, Badge,
  DataTable, Modal, Scrollable, Divider,
} from '@shopify/polaris';
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
  if (!shop) throw new Response('Store not found', { status: 404 });

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

  const publishedModulesMeta = buildPublishedModulesMeta(shop);

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

const codeBlockStyle = { margin: 0, fontSize: 11, overflow: 'auto', maxHeight: 220, padding: 8, background: 'var(--p-color-bg-surface-secondary)', borderRadius: 6, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const };

function JsonSection({ title, json }: { title: string; json: string | null }) {
  if (json == null || json === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return (
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">{title}</Text>
        <pre style={codeBlockStyle}>{json}</pre>
      </BlockStack>
    );
  }
  return (
    <BlockStack gap="100">
      <Text as="h3" variant="headingSm">{title}</Text>
      <pre style={codeBlockStyle}>{JSON.stringify(parsed, null, 2)}</pre>
    </BlockStack>
  );
}

function ModuleDetailsModal({ row, open, onClose }: { row: ModuleMetaRow; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`${row.name} — module details`} size="large">
      <Modal.Section>
        <Scrollable style={{ maxHeight: '70vh' }}>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Overview</Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm"><strong>ID:</strong> {row.id}</Text>
                <Text as="p" variant="bodySm"><strong>Type:</strong> {row.type} · <strong>Category:</strong> {row.category} · <strong>Status:</strong> {row.status}</Text>
                <Text as="p" variant="bodySm"><strong>Published at:</strong> {row.publishedAt ? new Date(row.publishedAt).toLocaleString() : '—'} · <strong>Theme ID:</strong> {row.targetThemeId ?? '—'}</Text>
              </BlockStack>
            </BlockStack>
            <Divider />
            <JsonSection title="Recipe (full spec)" json={row.specJson} />
            <JsonSection title="Implementation plan" json={row.implementationPlanJson} />
            <JsonSection title="Admin config schema (settings UI)" json={row.adminConfigSchemaJson} />
            <JsonSection title="Admin defaults" json={row.adminDefaultsJson} />
            <JsonSection title="Theme editor settings" json={row.themeEditorSettingsJson} />
            <JsonSection title="UI tokens" json={row.uiTokensJson} />
            <JsonSection title="Validation report" json={row.validationReportJson} />
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">Meta sent to store (metafield superapp.theme.modules)</Text>
              <Text as="p" variant="bodySm" tone="subdued">Payload written to the store when this theme module is published. Keyed by module ID.</Text>
              {row.metaError ? (
                <Text as="p" tone="critical">{row.metaError}</Text>
              ) : row.metaSentToStore ? (
                <pre style={codeBlockStyle}>{JSON.stringify(row.metaSentToStore, null, 2)}</pre>
              ) : (
                <Text as="p" tone="subdued">Not a published theme module; no meta sent.</Text>
              )}
            </BlockStack>
          </BlockStack>
        </Scrollable>
      </Modal.Section>
    </Modal>
  );
}

export default function InternalStoreDetail() {
  const { shop, providerOptions, billingPlanOptions, publishedModulesMeta } = useLoaderData<typeof loader>();
  const [modalRow, setModalRow] = useState<ModuleMetaRow | null>(null);
  const [providerId, setProviderId] = useState<string>(shop.aiProviderOverrideId ?? '');
  const [retentionDefault, setRetentionDefault] = useState<string>(String(shop.retentionDaysDefault ?? ''));
  const [retentionAi, setRetentionAi] = useState<string>(String(shop.retentionDaysAi ?? ''));
  const [retentionApi, setRetentionApi] = useState<string>(String(shop.retentionDaysApi ?? ''));
  const [retentionErr, setRetentionErr] = useState<string>(String(shop.retentionDaysErrors ?? ''));

  const moduleTableRows = publishedModulesMeta.map((row) => [
    row.name,
    row.type,
    row.category,
    row.status,
    row.publishedAt ? new Date(row.publishedAt).toLocaleString() : '—',
    row.targetThemeId ?? '—',
    row.metaSentToStore ? 'Yes' : row.metaError ? 'Error' : '—',
    <Button key={row.id} size="slim" onClick={() => setModalRow(row)}>Details</Button>,
  ]);

  return (
    <Page
      title={shop.shopDomain}
      backAction={{ content: 'Stores', url: '/internal/stores' }}
      subtitle={`${shop.modulesCount} modules (${shop.publishedCount} published) · ${shop.planTier}`}
    >
      <BlockStack gap="300">
        <Card>
          <BlockStack gap="200">
            <InlineStack gap="300" blockAlign="center" wrap>
              <Badge tone="info">{shop.planTier}</Badge>
              {shop.subscription && (
                <Badge tone={shop.subscription.status === 'ACTIVE' ? 'success' : 'attention'}>
                  {`${shop.subscription.planName} (${shop.subscription.status})`}
                </Badge>
              )}
            </InlineStack>
            <Form method="post">
              <input type="hidden" name="intent" value="provider" />
              <input type="hidden" name="shopId" value={shop.id} />
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" fontWeight="semibold">AI provider</Text>
                <div style={{ minWidth: 200 }}>
                  <Select
                    label=""
                    name="providerId"
                    options={providerOptions}
                    value={providerId}
                    onChange={setProviderId}
                    labelHidden
                  />
                </div>
                <Button submit size="slim" variant="primary">Save</Button>
              </InlineStack>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="set_plan" />
              <input type="hidden" name="shopId" value={shop.id} />
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" fontWeight="semibold">Plan</Text>
                <select
                  name="plan"
                  defaultValue={shop.planTier ?? 'FREE'}
                  style={{ minWidth: 120, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--p-color-border)' }}
                >
                  {billingPlanOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Button submit size="slim" variant="secondary">Set</Button>
              </InlineStack>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="retention" />
              <input type="hidden" name="shopId" value={shop.id} />
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="span" variant="bodySm" fontWeight="semibold">Retention (days)</Text>
                <TextField
                  label=""
                  name="retentionDaysDefault"
                  type="number"
                  autoComplete="off"
                  value={retentionDefault}
                  onChange={setRetentionDefault}
                  placeholder="Default 30"
                  labelHidden
                />
                <TextField
                  label=""
                  name="retentionDaysAi"
                  type="number"
                  autoComplete="off"
                  value={retentionAi}
                  onChange={setRetentionAi}
                  placeholder="AI"
                  labelHidden
                />
                <TextField
                  label=""
                  name="retentionDaysApi"
                  type="number"
                  autoComplete="off"
                  value={retentionApi}
                  onChange={setRetentionApi}
                  placeholder="API"
                  labelHidden
                />
                <TextField
                  label=""
                  name="retentionDaysErrors"
                  type="number"
                  autoComplete="off"
                  value={retentionErr}
                  onChange={setRetentionErr}
                  placeholder="Err"
                  labelHidden
                />
                <Button submit size="slim" variant="primary">Save</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Store information — modules & meta sent</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Published theme modules: payload written to metafield <code>superapp.theme.modules</code>. Click Details for full module info in a popup.
            </Text>
            {publishedModulesMeta.length === 0 ? (
              <Text as="p" tone="subdued">No modules.</Text>
            ) : (
              <div className="internal-store-modules-table">
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Name', 'Type', 'Category', 'Status', 'Pub. at', 'Theme ID', 'Meta', '']}
                  rows={moduleTableRows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {modalRow && (
        <ModuleDetailsModal row={modalRow} open={!!modalRow} onClose={() => setModalRow(null)} />
      )}
    </Page>
  );
}
