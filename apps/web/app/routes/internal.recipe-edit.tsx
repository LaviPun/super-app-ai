import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useSearchParams, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Select, InlineStack, Button, Banner,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { requireInternalAdmin, commitInternal } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeSpecSchema, MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import { getTypeShortLabel } from '~/utils/type-label';
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
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'validate');

  const specRaw = form.get('spec');
  const specJson = typeof specRaw === 'string' ? specRaw : specRaw ? String(specRaw) : '';
  if (!specJson.trim()) return json({ error: 'Missing spec', validationResult: null }, { status: 400 });

  let spec: unknown;
  try {
    spec = JSON.parse(specJson);
  } catch {
    return json({
      error: 'Invalid JSON',
      validationResult: { valid: false, errors: { formErrors: ['Invalid JSON'], fieldErrors: {} } },
    });
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
    const shopId = String(form.get('shopId') ?? '');
    const moduleId = String(form.get('moduleId') ?? '');
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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
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

  const isSaving = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'save';
  const isValidating = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'validate';

  const validationResult = actionData && 'validationResult' in actionData ? actionData.validationResult : null;
  const errors = validationResult && !validationResult.valid && validationResult.errors;

  return (
    <Page title="Recipe edit" subtitle="Edit module RecipeSpec JSON (validated on save)">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Select store and module</Text>
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
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">RecipeSpec JSON</Text>
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
                  }}
                  spellCheck={false}
                />
                <InlineStack gap="200" blockAlign="start">
                  <Form method="post">
                    <input type="hidden" name="intent" value="validate" />
                    <input type="hidden" name="shopId" value={shopId} />
                    <input type="hidden" name="moduleId" value={moduleId} />
                    <input type="hidden" name="spec" value={specText} />
                    <Button submit loading={isValidating}>
                      Validate
                    </Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="save" />
                    <input type="hidden" name="shopId" value={shopId} />
                    <input type="hidden" name="moduleId" value={moduleId} />
                    <input type="hidden" name="spec" value={specText} />
                    <Button submit variant="primary" loading={isSaving}>
                      {shopId === TEMPLATES_SHOP_ID ? 'Save template override' : 'Save as new version'}
                    </Button>
                  </Form>
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
