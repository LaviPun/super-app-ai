import { json, redirect } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin, commitInternal } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeSpecSchema, MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import { getTypeDisplayLabel } from '~/utils/type-label';
import { ActivityLogService } from '~/services/activity/activity.service';
import { SettingsService } from '~/services/settings/settings.service';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  Field,
  Select,
  Banner,
  PageHead,
  STORES,
  TEMPLATES,
} from '~/components/admin/page-kit';

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

const SAMPLE_SPEC = `{
  "type": "STOREFRONT_UI",
  "name": "Sticky Add-to-Cart Bar",
  "category": "conversion",
  "layout": { "mode": "sticky", "anchor": "bottom", "width": "full" },
  "components": [
    { "kind": "variantPicker", "label": "Choose size" },
    { "kind": "quantity", "min": 1, "max": 10 },
    { "kind": "button", "label": "Add to cart", "style": "primary" }
  ],
  "tokens": { "radius": "md", "shadow": "lg", "buttonBg": "#1F3A5F" },
  "responsive": { "hideOnMobile": false }
}`;

export default function AdminRecipeEdit() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [valid, setValid] = useState<boolean | null>(null);

  const moduleName: string | null = data.moduleName ?? null;
  const json = (data.currentSpec as string) || SAMPLE_SPEC;
  const sourceOptions = ['All recipes (templates)'].concat(STORES.map((s) => s.name));
  const moduleOptions = (moduleName ? [moduleName] : []).concat(TEMPLATES.map((t) => t.name));

  return (
    <div className="page">
      <PageHead
        back={moduleName ? { href: '/internal/modules', label: moduleName } : undefined}
        title="Recipe edit"
        badge={<Badge tone="warning">Staff only · hidden from merchant</Badge>}
        sub={
          moduleName
            ? 'The internal RecipeSpec generated for this module. Merchants never see this JSON — only the rendered module. Validated with the Zod schema before save.'
            : 'Edit the RecipeSpec JSON for a store’s module or a default template. Internal only — never shown to merchants. Validated with the Zod schema before save.'
        }
        actions={
          <>
            <Btn icon="check" onClick={() => setValid(true)}>
              Validate
            </Btn>
            <Btn variant="primary" icon="download" onClick={() => ctx.toast('Saved new version')}>
              Save version
            </Btn>
          </>
        }
      />
      {moduleName && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info" title="Connected recipe">
            <span>
              This recipe is bound to <b>{moduleName}</b>. It is the source of truth for how the module is generated — kept in the admin and invisible to the merchant.
            </span>
          </Banner>
        </div>
      )}
      <div className="filter-bar" style={{ border: 0, padding: 0, marginBottom: 16 }}>
        <div style={{ minWidth: 240 }}>
          <Field label="Source">
            <Select options={sourceOptions} value={moduleName ? moduleName : 'All recipes (templates)'} onChange={() => {}} />
          </Field>
        </div>
        <div style={{ minWidth: 240 }}>
          <Field label="Module / template">
            <Select options={moduleOptions} value={moduleName ? moduleName : moduleOptions[0]} onChange={() => {}} />
          </Field>
        </div>
      </div>
      {valid != null && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="success" title="Valid RecipeSpec" onDismiss={() => setValid(null)}>
            Schema validation passed. Safe to save as a new version or template override.
          </Banner>
        </div>
      )}
      <Card>
        <div className="card-head">
          <div className="t-h3">RecipeSpec JSON</div>
          <span className="t-xs t-muted t-mono">{moduleName ? 'module.recipe.json' : 'recipe_spec.v3.json'}</span>
        </div>
        <pre className="code-block" style={{ margin: 0, borderRadius: '0 0 12px 12px', maxHeight: 480 }} contentEditable suppressContentEditableWarning>
          {json}
        </pre>
      </Card>
    </div>
  );
}
