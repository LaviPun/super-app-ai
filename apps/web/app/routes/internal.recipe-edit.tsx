import { json, redirect } from '@remix-run/node';
import { useLoaderData, useSearchParams, useFetcher } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Select, InlineStack, Button, Banner,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { requireInternalAdmin, commitInternal } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeSpecSchema, MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import { getTypeDisplayLabel } from '~/utils/type-label';
import { ActivityLogService } from '~/services/activity/activity.service';
import { SettingsService } from '~/services/settings/settings.service';

const TEMPLATES_SHOP_ID = '__templates__';

function parseTemplateOverrides(raw: string | null): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, val] of Object.entries(o)) {
      if (val && typeof val === 'object') out[id] = JSON.stringify(val);
    }
    return out;
  } catch {
    return {};
  }
}

export async function loader({ request }: { request: Request }) {
  const session = await requireInternalAdmin(request);
  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId') ?? '';
  const moduleId = url.searchParams.get('moduleId') ?? '';
  const toast = session.get('recipeEditToast') as { message: string } | undefined;
  if (toast) {
    session.unset('recipeEditToast');
  }

  const prisma = getPrisma();
  const shops = await prisma.shop.findMany({
    orderBy: { shopDomain: 'asc' },
    take: 500,
    select: { id: true, shopDomain: true },
  });

  let modules: { id: string; name: string; type: string; category: string }[] = [];
  let currentSpec: string | null = null;
  let moduleName: string | null = null;

  if (shopId === TEMPLATES_SHOP_ID) {
    modules = MODULE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      category: t.category,
    }));
    if (moduleId) {
      const tpl = findTemplate(moduleId);
      if (tpl) {
        const settings = await new SettingsService().get();
        const overrides = parseTemplateOverrides(settings.templateSpecOverrides);
        moduleName = tpl.name;
        currentSpec = overrides[moduleId] ?? JSON.stringify(tpl.spec, null, 2);
      }
    }
  } else if (shopId) {
    modules = await prisma.module.findMany({
      where: { shopId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, category: true },
    });
  }

  if (shopId && shopId !== TEMPLATES_SHOP_ID && moduleId) {
    const moduleService = new ModuleService();
    const mod = await moduleService.getModuleByShopId(shopId, moduleId);
    if (mod) {
      moduleName = mod.name;
      const latest = mod.versions[0];
      if (latest) currentSpec = latest.specJson;
    }
  }

  const headers = new Headers();
  if (toast) {
    headers.set('Set-Cookie', await commitInternal(session));
  }
  return json(
    {
      shops,
      modules,
      shopId,
      moduleId,
      currentSpec,
      moduleName,
      toast: toast ?? null,
    },
    headers.get('Set-Cookie') ? { headers } : undefined
  );
}

export async function action({ request }: { request: Request }) {
  const session = await requireInternalAdmin(request);
  const contentType = request.headers.get('content-type') ?? '';

  let intent = 'validate';
  let specJson = '';
  let shopIdField = '';
  let moduleIdField = '';
  let parsedSpecFromBody: unknown = undefined;

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body', validationResult: null }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return json({ error: 'Body must be an object', validationResult: null }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    intent = typeof b.intent === 'string' ? b.intent : 'validate';
    shopIdField = typeof b.shopId === 'string' ? b.shopId : '';
    moduleIdField = typeof b.moduleId === 'string' ? b.moduleId : '';
    if (typeof b.spec === 'string') {
      specJson = b.spec;
    } else if (b.spec && typeof b.spec === 'object') {
      parsedSpecFromBody = b.spec;
      specJson = JSON.stringify(b.spec);
    } else {
      return json({ error: 'Missing spec', validationResult: null }, { status: 400 });
    }
  } else {
    const form = await request.formData();
    intent = String(form.get('intent') ?? 'validate');
    shopIdField = String(form.get('shopId') ?? '');
    moduleIdField = String(form.get('moduleId') ?? '');
    const specRaw = form.get('spec');
    specJson = typeof specRaw === 'string' ? specRaw : specRaw ? String(specRaw) : '';
  }

  if (!specJson.trim() && parsedSpecFromBody === undefined) {
    return json({ error: 'Missing spec', validationResult: null }, { status: 400 });
  }

  let spec: unknown;
  if (parsedSpecFromBody !== undefined) {
    spec = parsedSpecFromBody;
  } else {
    try {
      spec = JSON.parse(specJson);
    } catch {
      return json({
        error: 'Invalid JSON',
        validationResult: { valid: false, errors: { formErrors: ['Invalid JSON'], fieldErrors: {} } },
      });
    }
  }

  const parsed = RecipeSpecSchema.safeParse(spec);
  const validationResult = {
    valid: parsed.success,
    errors: parsed.success ? null : parsed.error.flatten(),
  };

  if (intent === 'validate') {
    return json({ validationResult, error: parsed.success ? null : 'Validation failed' });
  }

  if (intent === 'save') {
    if (!parsed.success) {
      return json({ error: 'Validation failed', validationResult }, { status: 400 });
    }
    const shopId = shopIdField;
    const moduleId = moduleIdField;
    if (!shopId || !moduleId) return json({ error: 'Missing shopId or moduleId' }, { status: 400 });

    if (shopId === TEMPLATES_SHOP_ID) {
      const settingsService = new SettingsService();
      const settings = await settingsService.get();
      const overrides: Record<string, unknown> = {};
      if (settings.templateSpecOverrides?.trim()) {
        try {
          Object.assign(overrides, JSON.parse(settings.templateSpecOverrides));
        } catch {
          /* ignore */
        }
      }
      overrides[moduleId] = parsed.data;
      await settingsService.update({ templateSpecOverrides: JSON.stringify(overrides, null, 2) });
      await new ActivityLogService().log({
        actor: 'INTERNAL_ADMIN',
        action: 'MODULE_SPEC_EDITED',
        resource: `template:${moduleId}`,
        details: { templateId: moduleId, type: parsed.data.type },
      });
      session.set('recipeEditToast', { message: 'Template override saved' });
      const cookie = await commitInternal(session);
      return redirect('/internal/recipe-edit?shopId=' + encodeURIComponent(shopId) + '&moduleId=' + encodeURIComponent(moduleId), {
        headers: { 'Set-Cookie': cookie },
      });
    }

    const moduleService = new ModuleService();
    const mod = await moduleService.getModuleByShopId(shopId, moduleId);
    if (!mod) return json({ error: 'Module not found' }, { status: 404 });
    if (mod.type !== parsed.data.type) {
      return json({ error: 'Cannot change module type' }, { status: 400 });
    }

    await moduleService.createNewVersionByShopId(shopId, moduleId, parsed.data);
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'MODULE_SPEC_EDITED',
      resource: `module:${moduleId}`,
      details: { shopId, moduleId, type: parsed.data.type },
    });
    session.set('recipeEditToast', { message: 'Spec saved as new version' });
    const cookie = await commitInternal(session);
    return redirect('/internal/recipe-edit?shopId=' + encodeURIComponent(shopId) + '&moduleId=' + encodeURIComponent(moduleId), {
      headers: { 'Set-Cookie': cookie },
    });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

export default function InternalRecipeEdit() {
  const { shops, modules, shopId, moduleId, currentSpec, moduleName } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const actionData = fetcher.data;
  const [searchParams, setSearchParams] = useSearchParams();
  const [specText, setSpecText] = useState(currentSpec ?? '');

  useEffect(() => {
    if (currentSpec != null) setSpecText(currentSpec);
  }, [currentSpec]);

  const shopOptions = [
    { label: 'Select a store or templates', value: '' },
    { label: 'All recipes (templates)', value: TEMPLATES_SHOP_ID },
    ...shops.map(s => ({ label: s.shopDomain, value: s.id })),
  ];
  const moduleOptions = [
    { label: 'Select a module', value: '' },
    ...modules.map(m => ({ label: `${m.name} (${getTypeDisplayLabel(m.type)})`, value: m.id })),
  ];

  const onShopChange = useCallback(
    (value: string) => {
      const p = new URLSearchParams(searchParams);
      if (value) p.set('shopId', value);
      else p.delete('shopId');
      p.delete('moduleId');
      setSearchParams(p);
    },
    [searchParams, setSearchParams]
  );
  const onModuleChange = useCallback(
    (value: string) => {
      const p = new URLSearchParams(searchParams);
      if (value) p.set('moduleId', value);
      else p.delete('moduleId');
      setSearchParams(p);
    },
    [searchParams, setSearchParams]
  );

  const submittingIntent =
    fetcher.state !== 'idle' && fetcher.formData
      ? String(fetcher.formData.get('intent') ?? '')
      : null;
  const isSaving = submittingIntent === 'save';
  const isValidating = submittingIntent === 'validate';

  const validationResult = actionData && 'validationResult' in actionData ? actionData.validationResult : null;
  const errors = validationResult && !validationResult.valid && validationResult.errors;

  const submitJson = useCallback(
    (intent: 'validate' | 'save') => {
      fetcher.submit(
        { intent, shopId, moduleId, spec: specText },
        { method: 'post', encType: 'application/json' },
      );
    },
    [fetcher, shopId, moduleId, specText],
  );

  return (
    <Page title="Recipe edit" subtitle="Edit module RecipeSpec JSON (validated on save).">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Select store and module</Text>
            <Text as="p" variant="bodySm" tone="subdued">Choose a store or All recipes (templates), then a module to edit its spec.</Text>
            <InlineStack gap="300" wrap>
              <div style={{ minWidth: 280 }}>
                <Select
                  label="Store"
                  options={shopOptions}
                  value={shopId}
                  onChange={onShopChange}
                />
              </div>
              <div style={{ minWidth: 280 }}>
                <Select
                  label="Module"
                  options={moduleOptions}
                  value={moduleId}
                  onChange={onModuleChange}
                  disabled={!shopId}
                />
              </div>
            </InlineStack>
            {moduleName && (
              <Text as="p" variant="bodySm" tone="subdued">
                Editing: {moduleName}
              </Text>
            )}
          </BlockStack>
        </Card>

        {currentSpec == null && (shopId && moduleId) && shopId !== TEMPLATES_SHOP_ID && (
          <Banner tone="warning">Module not found or has no versions.</Banner>
        )}

        {currentSpec != null && (
          <>
            {errors && (
              <Banner tone="critical" title="Validation failed">
                <BlockStack gap="200">
                  {errors.formErrors?.length ? (
                    <Text as="p" variant="bodySm">{errors.formErrors.join(' ')}</Text>
                  ) : null}
                  {errors.fieldErrors && Object.keys(errors.fieldErrors).length > 0 && (
                    <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 120 }}>
                      {JSON.stringify(errors.fieldErrors, null, 2)}
                    </pre>
                  )}
                </BlockStack>
              </Banner>
            )}
            {validationResult?.valid && actionData && 'validationResult' in actionData && (
              <Banner tone="success">Spec is valid.</Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">RecipeSpec JSON</Text>
                <Text as="p" variant="bodySm" tone="subdued">Edit the JSON below. Validate before saving. Saving creates a new version (store) or updates the template override (templates).</Text>
                <textarea
                  aria-label="RecipeSpec JSON"
                  value={specText}
                  onChange={(e) => setSpecText(e.target.value)}
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
                <InlineStack gap="200" blockAlign="start">
                  <Button
                    variant="secondary"
                    loading={isValidating}
                    disabled={isSaving || isValidating}
                    onClick={() => submitJson('validate')}
                  >
                    Validate
                  </Button>
                  <Button
                    variant="primary"
                    loading={isSaving}
                    disabled={isSaving || isValidating || !shopId || !moduleId}
                    onClick={() => submitJson('save')}
                  >
                    {shopId === TEMPLATES_SHOP_ID ? 'Save template override' : 'Save as new version'}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </>
        )}

        {!shopId && (
          <Card>
            <Text as="p" tone="subdued">Select &quot;All recipes (templates)&quot; to view and edit default module templates, or select a store to edit that store&apos;s modules.</Text>
          </Card>
        )}
        {shopId && !moduleId && modules.length > 0 && (
          <Card>
            <Text as="p" tone="subdued">
              {shopId === TEMPLATES_SHOP_ID
                ? 'Select a template to view or edit its RecipeSpec. Saving updates the template override (used when creating from template).'
                : 'Select a module to edit its RecipeSpec.'}
            </Text>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
