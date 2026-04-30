import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import { Badge, Banner, BlockStack, Button, Card, ChoiceList, DataTable, InlineGrid, InlineStack, Page, Select, Text, TextField } from '@shopify/polaris';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  CAPABILITIES,
  findTemplate,
  getTemplateInstallability,
  getTemplateReadiness,
  RecipeSpecSchema,
  type Capability,
  type TemplateEntry,
} from '@superapp/core';
import { getPrisma } from '~/db.server';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { ModuleService } from '~/services/modules/module.service';
import { SettingsService } from '~/services/settings/settings.service';

function getTemplateSpec(templateId: string, overridesJson: string | null) {
  const template = findTemplate(templateId);
  if (!template) return null;
  if (!overridesJson?.trim()) return template.spec;
  try {
    const overrides = JSON.parse(overridesJson) as Record<string, unknown>;
    const override = overrides[templateId];
    if (override && typeof override === 'object') {
      const parsed = RecipeSpecSchema.safeParse(override);
      if (parsed.success) return parsed.data;
    }
  } catch {
    // ignore malformed overrides and fall back to canonical template
  }
  return template.spec;
}

export async function loader({ request, params }: { request: Request; params: { templateId?: string } }) {
  await requireInternalAdmin(request);
  const templateId = String(params.templateId ?? '').trim();
  if (!templateId) throw new Response('Missing template ID', { status: 400 });

  const baseTemplate = findTemplate(templateId);
  if (!baseTemplate) throw new Response('Template not found', { status: 404 });

  const settings = await new SettingsService().get();
  const resolvedSpec = getTemplateSpec(templateId, settings.templateSpecOverrides);
  if (!resolvedSpec) throw new Response('Template spec unavailable', { status: 404 });

  const resolvedTemplate: TemplateEntry = {
    ...baseTemplate,
    spec: resolvedSpec,
  };
  const readiness = getTemplateReadiness(resolvedTemplate);
  const installability = getTemplateInstallability(resolvedTemplate);

  const prisma = getPrisma();
  const stores = await prisma.shop.findMany({
    select: { id: true, shopDomain: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  return json({
    template: {
      id: resolvedTemplate.id,
      name: resolvedTemplate.name,
      description: resolvedTemplate.description,
      category: resolvedTemplate.category,
      type: resolvedTemplate.type,
      tags: resolvedTemplate.tags ?? [],
    },
    readiness,
    installability,
    templateSpec: {
      requires: resolvedSpec.requires,
      config: resolvedSpec.config,
      style: 'style' in resolvedSpec ? resolvedSpec.style ?? null : null,
      placement: 'placement' in resolvedSpec ? resolvedSpec.placement ?? null : null,
    },
    previewUrl: `/internal/templates/${encodeURIComponent(templateId)}/preview`,
    stores,
  });
}

export async function action({ request, params }: { request: Request; params: { templateId?: string } }) {
  await requireInternalAdmin(request);
  const templateId = String(params.templateId ?? '').trim();
  if (!templateId) return json({ error: 'Missing template ID' }, { status: 400 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (intent !== 'createSandbox' && intent !== 'saveTemplateOverride') {
    return json({ error: 'Unsupported action' }, { status: 400 });
  }

  if (intent === 'saveTemplateOverride') {
    const specText = String(form.get('specJson') ?? '').trim();
    if (!specText) return json({ error: 'Template spec JSON is required.' }, { status: 400 });
    let parsedSpec: unknown;
    try {
      parsedSpec = JSON.parse(specText);
    } catch {
      return json({ error: 'Template spec JSON is invalid.' }, { status: 400 });
    }
    const validated = RecipeSpecSchema.safeParse(parsedSpec);
    if (!validated.success) {
      return json({ error: validated.error.flatten().formErrors.join(' ') || 'Template spec failed validation.' }, { status: 400 });
    }

    const settingsService = new SettingsService();
    const settings = await settingsService.get();
    const overrides: Record<string, unknown> = {};
    if (settings.templateSpecOverrides?.trim()) {
      try {
        Object.assign(overrides, JSON.parse(settings.templateSpecOverrides));
      } catch {
        // ignore malformed previous override payload
      }
    }
    overrides[templateId] = validated.data;
    await settingsService.update({ templateSpecOverrides: JSON.stringify(overrides, null, 2) });

    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'TEMPLATE_SETTINGS_UPDATED',
      resource: `template:${templateId}`,
      details: { templateId, type: validated.data.type },
    });

    return redirect(`/internal/templates/${encodeURIComponent(templateId)}?updated=1`);
  }

  const storeId = String(form.get('storeId') ?? '').trim();
  if (!storeId) return json({ error: 'Select a store for sandbox creation.' }, { status: 400 });

  const baseTemplate = findTemplate(templateId);
  if (!baseTemplate) return json({ error: 'Template not found' }, { status: 404 });

  const prisma = getPrisma();
  const store = await prisma.shop.findUnique({ where: { id: storeId }, select: { id: true, shopDomain: true } });
  if (!store) return json({ error: 'Store not found' }, { status: 404 });

  const settings = await new SettingsService().get();
  const spec = getTemplateSpec(templateId, settings.templateSpecOverrides);
  if (!spec) return json({ error: 'Template spec unavailable' }, { status: 404 });

  const moduleService = new ModuleService();
  const sandboxModule = await moduleService.createDraft(store.shopDomain, spec);

  await new ActivityLogService().log({
    actor: 'INTERNAL_ADMIN',
    action: 'TEMPLATE_SANDBOX_CREATED',
    resource: `module:${sandboxModule.id}`,
    shopId: store.id,
    details: { templateId, templateName: baseTemplate.name },
  });

  return redirect(
    `/internal/templates/${encodeURIComponent(templateId)}?created=1&moduleId=${encodeURIComponent(sandboxModule.id)}&storeId=${encodeURIComponent(store.id)}`,
  );
}

export default function InternalTemplateDetailRoute() {
  const { template, readiness, installability, templateSpec, previewUrl, stores } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewMode, setPreviewMode] = useState<'merchant' | 'raw'>('merchant');
  const [previewSurface, setPreviewSurface] = useState<'generic' | 'product' | 'collection' | 'cart' | 'checkout' | 'postPurchase' | 'customer'>('generic');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [specEditorText, setSpecEditorText] = useState('');
  const [editableSpec, setEditableSpec] = useState<Record<string, unknown> | null>(null);

  const storeOptions = useMemo(
    () => stores.map((s) => ({ label: s.shopDomain, value: s.id })),
    [stores],
  );
  const isSubmitting = navigation.state === 'submitting';
  const created = params.get('created') === '1';
  const updated = params.get('updated') === '1';
  const createdModuleId = params.get('moduleId');
  const createdStoreId = params.get('storeId');
  const readinessRows = readiness.checks.map((check) => ({
    ...check,
    statusTone: check.ok ? 'success' as const : 'critical' as const,
    statusLabel: check.ok ? 'Ready' : 'Needs work',
  }));
  const configEntries = Object.entries(templateSpec.config as Record<string, unknown>);
  const configRows = configEntries.map(([key, value]) => {
    const valueType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return [key, valueType, raw.length > 120 ? `${raw.slice(0, 120)}...` : raw];
  });
  const viewportWidth = previewViewport === 'desktop' ? '100%' : previewViewport === 'tablet' ? '820px' : '430px';
  const effectivePreviewUrl = `${previewUrl}?surface=${encodeURIComponent(previewSurface)}${previewMode === 'merchant' ? '&mode=merchant' : ''}`;
  const isSubmittingOverride = navigation.state === 'submitting' && navigation.formData?.get('intent') === 'saveTemplateOverride';
  const previewModeOptions = ['merchant', 'raw'] as const;
  const previewViewportOptions = ['desktop', 'tablet', 'mobile'] as const;
  const capabilityChoices = CAPABILITIES.map((capability) => ({ label: capability, value: capability }));

  const updateEditableSpec = (updater: (current: Record<string, unknown>) => Record<string, unknown>) => {
    setEditableSpec((current) => {
      if (!current) return current;
      return updater(current);
    });
  };

  const updateSpecPath = useCallback((path: Array<string | number>, nextValue: unknown) => {
    const applyPath = (currentValue: unknown, pathIndex: number): unknown => {
      const pathKey = path[pathIndex];
      if (pathKey === undefined) return nextValue;

      if (Array.isArray(currentValue)) {
        const nextArray = [...currentValue];
        const index = Number(pathKey);
        nextArray[index] = applyPath(nextArray[index], pathIndex + 1);
        return nextArray;
      }

      const sourceObj = (currentValue && typeof currentValue === 'object')
        ? (currentValue as Record<string, unknown>)
        : {};
      const nextObj: Record<string, unknown> = { ...sourceObj };
      nextObj[String(pathKey)] = applyPath(sourceObj[String(pathKey)], pathIndex + 1);
      return nextObj;
    };

    updateEditableSpec((current) => applyPath(current, 0) as Record<string, unknown>);
  }, []);

  const renderDynamicField = useCallback((fieldPath: Array<string | number>, value: unknown, depth = 0) => {
    const key = fieldPath.join('.');
    const label = fieldPath[fieldPath.length - 1] ? String(fieldPath[fieldPath.length - 1]) : 'value';
    const spacing = depth > 0 ? { marginLeft: Math.min(depth * 12, 48) } : undefined;

    if (typeof value === 'string') {
      return (
        <div key={key} style={spacing}>
          <TextField
            label={label}
            value={value}
            onChange={(next) => updateSpecPath(fieldPath, next)}
            autoComplete="off"
          />
        </div>
      );
    }

    if (typeof value === 'number') {
      return (
        <div key={key} style={spacing}>
          <TextField
            label={label}
            type="number"
            value={String(value)}
            onChange={(next) => {
              const parsed = Number(next);
              updateSpecPath(fieldPath, Number.isFinite(parsed) ? parsed : 0);
            }}
            autoComplete="off"
          />
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <div key={key} style={spacing}>
          <Select
            label={label}
            options={[
              { label: 'true', value: 'true' },
              { label: 'false', value: 'false' },
            ]}
            value={value ? 'true' : 'false'}
            onChange={(next) => updateSpecPath(fieldPath, next === 'true')}
          />
        </div>
      );
    }

    if (Array.isArray(value)) {
      const scalarArray = value.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item));
      return (
        <BlockStack key={key} gap="100">
          <Text as="p" variant="bodySm" fontWeight="medium" tone="subdued">{label}</Text>
          {scalarArray ? (
            <TextField
              label={`${label} values`}
              value={value.map((item) => String(item ?? '')).join('\n')}
              onChange={(next) => {
                const split = next.split('\n').map((entry) => entry.trim()).filter(Boolean);
                updateSpecPath(fieldPath, split);
              }}
              multiline={4}
              autoComplete="off"
            />
          ) : (
            <textarea
              aria-label={`${label} JSON`}
              value={JSON.stringify(value, null, 2)}
              onChange={(event) => {
                try {
                  updateSpecPath(fieldPath, JSON.parse(event.currentTarget.value));
                } catch {
                  // allow typing incomplete JSON
                }
              }}
              rows={8}
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
                padding: 10,
                border: '1px solid var(--p-color-border)',
                borderRadius: 8,
                boxSizing: 'border-box',
              }}
            />
          )}
        </BlockStack>
      );
    }

    if (value && typeof value === 'object') {
      return (
        <Card key={key}>
          <BlockStack gap="200">
            <Text as="h4" variant="headingSm">{label}</Text>
            <BlockStack gap="200">
              {Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) =>
                renderDynamicField([...fieldPath, childKey], childValue, depth + 1))}
            </BlockStack>
          </BlockStack>
        </Card>
      );
    }

    return (
      <div key={key} style={spacing}>
        <TextField
          label={label}
          value={value == null ? '' : String(value)}
          onChange={(next) => updateSpecPath(fieldPath, next)}
          autoComplete="off"
        />
      </div>
    );
  }, [updateSpecPath]);

  const config = useMemo(
    () => ((editableSpec?.config && typeof editableSpec.config === 'object'
      ? editableSpec.config
      : {}) as Record<string, unknown>),
    [editableSpec],
  );

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: 'merchant' | 'raw') => {
    const currentIndex = previewModeOptions.indexOf(current);
    if (currentIndex < 0) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = previewModeOptions[(currentIndex + 1) % previewModeOptions.length]!;
      setPreviewMode(next);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = previewModeOptions[(currentIndex - 1 + previewModeOptions.length) % previewModeOptions.length]!;
      setPreviewMode(prev);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setPreviewMode(previewModeOptions[0]!);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setPreviewMode(previewModeOptions[previewModeOptions.length - 1]!);
    }
  };

  const handleViewportKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: 'desktop' | 'tablet' | 'mobile') => {
    const currentIndex = previewViewportOptions.indexOf(current);
    if (currentIndex < 0) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = previewViewportOptions[(currentIndex + 1) % previewViewportOptions.length]!;
      setPreviewViewport(next);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = previewViewportOptions[(currentIndex - 1 + previewViewportOptions.length) % previewViewportOptions.length]!;
      setPreviewViewport(prev);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setPreviewViewport(previewViewportOptions[0]!);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setPreviewViewport(previewViewportOptions[previewViewportOptions.length - 1]!);
    }
  };

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    const fullSpec = {
      ...templateSpec,
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      type: template.type,
    };
    setEditableSpec(fullSpec as unknown as Record<string, unknown>);
  }, [template.id, template.name, template.description, template.category, template.type, templateSpec]);

  useEffect(() => {
    if (!editableSpec) return;
    setSpecEditorText(JSON.stringify(editableSpec, null, 2));
  }, [editableSpec]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(specEditorText) as Record<string, unknown>;
      setEditableSpec(parsed);
    } catch {
      // Let users type invalid JSON in advanced mode without crashing form controls.
    }
  }, [specEditorText]);

  return (
    <Page
      title={template.name}
      subtitle="Internal sandbox and merchant-like live preview"
      backAction={{ content: 'Templates', url: '/internal/templates' }}
      secondaryActions={[
        { content: 'Jump to editor', onAction: () => scrollToSection('template-edit-settings') },
        { content: 'Jump to preview', onAction: () => scrollToSection('template-live-preview') },
        { content: 'Open raw preview', url: `${previewUrl}?surface=${encodeURIComponent(previewSurface)}`, external: true },
      ]}
    >
      <BlockStack gap="400">
        {actionData?.error ? (
          <Banner tone="critical" title="Could not create sandbox module">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        ) : null}

        {updated ? (
          <Banner tone="success" title="Template settings updated">
            <Text as="p">Override saved. Live preview and sandbox now use the updated template settings.</Text>
          </Banner>
        ) : null}

        {created && createdModuleId ? (
          <Banner tone="success" title="Sandbox module created">
            <BlockStack gap="200">
              <Text as="p">
                Module ID: <code>{createdModuleId}</code>
                {createdStoreId ? ` for store ${createdStoreId}.` : '.'}
              </Text>
              {createdStoreId ? (
                <InlineStack>
                  <Button url={`/internal/stores/${encodeURIComponent(createdStoreId)}`} variant="secondary" size="slim">
                    Open store details
                  </Button>
                </InlineStack>
              ) : null}
            </BlockStack>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" wrap>
              <Badge>{template.type}</Badge>
              <Badge>{template.category}</Badge>
              {readiness.hasAdvancedSettings ? <Badge tone="success">Advanced-ready</Badge> : <Badge tone="critical">Advanced missing</Badge>}
              {readiness.storageMode === 'NONE' ? <Badge>Data-save optional</Badge> : <Badge tone="attention">Data-save ready</Badge>}
              {installability.ok ? <Badge tone="success">Installable</Badge> : <Badge tone="critical">Blocked</Badge>}
            </InlineStack>
            <Text as="p" variant="bodyMd">{template.description}</Text>
            {template.tags.length > 0 ? (
              <InlineStack gap="200" wrap>
                {template.tags.map((tag) => (
                  <Text key={tag} as="span" variant="bodySm" tone="subdued">#{tag}</Text>
                ))}
              </InlineStack>
            ) : null}
            {readiness.dbModels.length > 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">DB models: {readiness.dbModels.join(', ')}</Text>
            ) : null}
            {!installability.ok && installability.reasons.length > 0 ? (
              <BlockStack gap="100">
                {installability.reasons.map((reason) => (
                  <Text key={reason} as="p" variant="bodySm" tone="critical">{reason}</Text>
                ))}
              </BlockStack>
            ) : null}
          </BlockStack>
        </Card>

        <div id="template-edit-settings" style={{ scrollMarginTop: 80 }}>
          <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Edit template settings</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Edit the full template spec JSON. This updates template overrides used by internal preview and merchant template creation.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="saveTemplateOverride" />
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingSm">Flagship settings (full access)</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Every template field is editable here, including capabilities (`requires`), config, style, and placement.
                    </Text>
                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                      <TextField
                        label="Template name"
                        value={String(editableSpec?.name ?? '')}
                        onChange={(value) => updateEditableSpec((current) => ({ ...current, name: value }))}
                        autoComplete="off"
                      />
                      <TextField
                        label="Description"
                        value={String(editableSpec?.description ?? '')}
                        onChange={(value) => updateEditableSpec((current) => ({ ...current, description: value }))}
                        autoComplete="off"
                      />
                    </InlineGrid>

                    <ChoiceList
                      title="Requires (capability and data-surface flags)"
                      allowMultiple
                      choices={capabilityChoices}
                      selected={Array.isArray(editableSpec?.requires) ? (editableSpec?.requires as string[]) : []}
                      onChange={(selected) => updateSpecPath(['requires'], selected as Capability[])}
                    />

                    <BlockStack gap="300">
                      <Text as="h4" variant="headingSm">Config</Text>
                      <BlockStack gap="200">
                        {Object.entries(config).map(([key, value]) => renderDynamicField(['config', key], value))}
                      </BlockStack>
                    </BlockStack>

                    {editableSpec?.style && typeof editableSpec.style === 'object' ? (
                      <BlockStack gap="300">
                        <Text as="h4" variant="headingSm">Style</Text>
                        <BlockStack gap="200">
                          {Object.entries(editableSpec.style as Record<string, unknown>).map(([key, value]) =>
                            renderDynamicField(['style', key], value))}
                        </BlockStack>
                      </BlockStack>
                    ) : null}

                    {editableSpec?.placement && typeof editableSpec.placement === 'object' ? (
                      <BlockStack gap="300">
                        <Text as="h4" variant="headingSm">Placement</Text>
                        <BlockStack gap="200">
                          {Object.entries(editableSpec.placement as Record<string, unknown>).map(([key, value]) =>
                            renderDynamicField(['placement', key], value))}
                        </BlockStack>
                      </BlockStack>
                    ) : null}
                  </BlockStack>
                </Card>

                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Advanced mode (full JSON)</Text>
                  <Button size="slim" variant="secondary" onClick={() => setShowAdvanced((prev) => !prev)}>
                    {showAdvanced ? 'Hide advanced JSON' : 'Show advanced JSON'}
                  </Button>
                </InlineStack>

                {showAdvanced ? (
                  <textarea
                    aria-label="Template spec JSON editor"
                    name="specJson"
                    value={specEditorText}
                    onChange={(event) => setSpecEditorText(event.currentTarget.value)}
                    rows={18}
                    style={{
                      width: '100%',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 13,
                      padding: 12,
                      border: '1px solid var(--p-color-border)',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                      maxHeight: '60vh',
                      overflowY: 'auto',
                    }}
                    spellCheck={false}
                  />
                ) : (
                  <input type="hidden" name="specJson" value={specEditorText} />
                )}
              </BlockStack>
              <InlineStack align="end">
                <Button submit variant="primary" loading={isSubmittingOverride} disabled={isSubmittingOverride}>
                  Save template settings
                </Button>
              </InlineStack>
            </Form>
          </BlockStack>
          </Card>
        </div>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Readiness checks and available options</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This shows what the template already supports and where it may be blocked before rollout.
            </Text>
            <BlockStack gap="150">
              {readinessRows.map((check) => (
                <InlineStack key={check.id} align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" fontWeight="medium">{check.id}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{check.detail}</Text>
                  </BlockStack>
                  <Badge tone={check.statusTone}>{check.statusLabel}</Badge>
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Template settings (current defaults)</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              These are the exact defaults (including override values, if configured) used for preview and sandbox creation.
            </Text>
            <BlockStack gap="150">
              <Text as="p" variant="bodySm"><strong>Requires:</strong> {templateSpec.requires.join(', ') || '—'}</Text>
              {configRows.length > 0 ? (
                <DataTable
                  columnContentTypes={['text', 'text', 'text']}
                  headings={['Setting', 'Type', 'Value preview']}
                  rows={configRows}
                />
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">No config keys on this template.</Text>
              )}
              <Text as="p" variant="bodySm" tone="subdued">
                Style: {templateSpec.style ? 'Available' : 'Not set'} · Placement: {templateSpec.placement ? 'Available' : 'Not set'}
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <div id="template-live-preview" style={{ scrollMarginTop: 80 }}>
          <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Live preview (merchant-like renderer)</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This uses the same preview rendering pipeline used for merchant modules, including template overrides.
            </Text>
            <div style={{ padding: 12, border: '1px solid var(--p-color-border-secondary)', borderRadius: 10, background: 'var(--p-color-bg-surface-secondary)' }}>
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="300" blockAlign="center" wrap>
                  <Select
                    label="Surface"
                    options={[
                      { label: 'Generic', value: 'generic' },
                      { label: 'Product', value: 'product' },
                      { label: 'Collection', value: 'collection' },
                      { label: 'Cart', value: 'cart' },
                      { label: 'Checkout', value: 'checkout' },
                      { label: 'Post-purchase', value: 'postPurchase' },
                      { label: 'Customer account', value: 'customer' },
                    ]}
                    value={previewSurface}
                    onChange={(value) => setPreviewSurface(value as typeof previewSurface)}
                  />
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    <Text as="p" variant="bodySm" tone="subdued">Preview mode</Text>
                    <div
                      style={{
                        display: 'inline-flex',
                        border: '1px solid var(--p-color-border)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: 'var(--p-color-bg-surface)',
                      }}
                      role="radiogroup"
                      aria-label="Preview mode switcher"
                    >
                      {[
                        { value: 'merchant' as const, label: 'Merchant-like' },
                        { value: 'raw' as const, label: 'Raw' },
                      ].map((option, index) => {
                        const active = previewMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            role="radio"
                            aria-checked={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => setPreviewMode(option.value)}
                            onKeyDown={(event) => handleModeKeyDown(event, option.value)}
                            style={{
                              border: 0,
                              borderLeft: index === 0 ? '0' : '1px solid var(--p-color-border)',
                              background: active ? 'var(--p-color-bg-fill-brand)' : 'transparent',
                              color: active ? 'var(--p-color-text-on-color)' : 'var(--p-color-text)',
                              fontSize: 12,
                              fontWeight: 600,
                              lineHeight: '16px',
                              padding: '8px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </InlineStack>
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    <Text as="p" variant="bodySm" tone="subdued">Viewport</Text>
                    <div
                      style={{
                        display: 'inline-flex',
                        border: '1px solid var(--p-color-border)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: 'var(--p-color-bg-surface)',
                      }}
                      role="radiogroup"
                      aria-label="Viewport switcher"
                    >
                      {[
                        { value: 'desktop' as const, label: 'Desktop' },
                        { value: 'tablet' as const, label: 'Tablet' },
                        { value: 'mobile' as const, label: 'Mobile' },
                      ].map((option, index) => {
                        const active = previewViewport === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            role="radio"
                            aria-checked={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => setPreviewViewport(option.value)}
                            onKeyDown={(event) => handleViewportKeyDown(event, option.value)}
                            style={{
                              border: 0,
                              borderLeft: index === 0 ? '0' : '1px solid var(--p-color-border)',
                              background: active ? 'var(--p-color-bg-fill-brand)' : 'transparent',
                              color: active ? 'var(--p-color-text-on-color)' : 'var(--p-color-text)',
                              fontSize: 12,
                              fontWeight: 600,
                              lineHeight: '16px',
                              padding: '8px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </InlineStack>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {previewMode === 'merchant' ? 'Merchant-like shell' : 'Raw renderer'} · {viewportWidth}
                </Text>
              </InlineStack>
            </div>
            <div
              style={{
                border: '1px solid var(--p-color-border)',
                borderRadius: 8,
                overflow: 'hidden',
                minHeight: 520,
                background: '#f6f8fb',
                display: 'flex',
                justifyContent: 'center',
                padding: 12,
              }}
            >
              <div style={{ width: viewportWidth, maxWidth: '100%', background: '#fff' }}>
                <iframe
                  key={`${previewMode}-${previewViewport}`}
                  title={`${template.name} live preview`}
                  src={effectivePreviewUrl}
                  style={{ width: '100%', height: 500, border: 0, display: 'block', background: '#fff' }}
                />
              </div>
            </div>
          </BlockStack>
          </Card>
        </div>

        <InlineGrid columns={{ xs: 1 }} gap="400">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Sandbox create (real module draft)</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Create a real draft in any store so you can inspect merchant-side behavior and file precise issues.
              </Text>
              {storeOptions.length > 0 ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="createSandbox" />
                  <BlockStack gap="300">
                    <Select
                      label="Target store"
                      options={storeOptions}
                      value={storeId}
                      onChange={(v) => setStoreId(v ?? '')}
                      name="storeId"
                    />
                    <InlineStack>
                      <Button submit variant="primary" loading={isSubmitting} disabled={!storeId || isSubmitting}>
                        Create sandbox module from template
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Form>
              ) : (
                <Text as="p" variant="bodySm" tone="critical">
                  No stores found. Connect at least one merchant store to use sandbox creation.
                </Text>
              )}
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
