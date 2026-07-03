import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  findTemplate,
  getTemplateInstallability,
  getTemplateReadiness,
  RecipeSpecSchema,
  type TemplateEntry,
} from '@superapp/core';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  Field,
  Select,
  KV,
  Icon,
  PageHead,
  StatTile,
  MonoChip,
  titleCase,
} from '~/components/admin/page-kit';
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
    fullSpec: resolvedSpec,
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

    return json({ toast: { message: 'Template override saved' } });
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

  return json({
    toast: { message: `Sandbox module created on ${store.shopDomain}` },
    moduleId: sandboxModule.id,
    storeId: store.id,
  });
}

type TemplateActionData = { toast?: { message: string }; error?: string; moduleId?: string; storeId?: string };

export default function AdminTemplateDetail() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const navigate = useNavigate();
  const t = data.template;

  const saveFetcher = useFetcher<TemplateActionData>();
  const sandboxFetcher = useFetcher<TemplateActionData>();

  const [specText, setSpecText] = useState<string>(() => JSON.stringify(data.fullSpec, null, 2));
  const [storeId, setStoreId] = useState('');

  // Re-seed the editor when the resolved spec changes (e.g. after a save revalidates).
  useEffect(() => {
    setSpecText(JSON.stringify(data.fullSpec, null, 2));
  }, [data.fullSpec]);

  // Server-driven toasts (error styling on ok:false) for both mutations.
  useEffect(() => {
    if (saveFetcher.state === 'idle' && saveFetcher.data) {
      if (saveFetcher.data.error) ctx.toast(saveFetcher.data.error, true);
      else if (saveFetcher.data.toast?.message) ctx.toast(saveFetcher.data.toast.message);
    }
  }, [saveFetcher.state, saveFetcher.data, ctx]);
  useEffect(() => {
    if (sandboxFetcher.state === 'idle' && sandboxFetcher.data) {
      if (sandboxFetcher.data.error) ctx.toast(sandboxFetcher.data.error, true);
      else if (sandboxFetcher.data.toast?.message) ctx.toast(sandboxFetcher.data.toast.message);
    }
  }, [sandboxFetcher.state, sandboxFetcher.data, ctx]);

  const saveOverride = () =>
    saveFetcher.submit({ intent: 'saveTemplateOverride', specJson: specText }, { method: 'post' });
  const createSandbox = () => {
    if (!storeId) return;
    sandboxFetcher.submit({ intent: 'createSandbox', storeId }, { method: 'post' });
  };

  const storeOptions = [
    { value: '', label: data.stores.length ? 'Select a store…' : 'No stores installed' },
    ...data.stores.map((s) => ({ value: s.id, label: s.shopDomain })),
  ];

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/templates', label: 'Templates' }}
        title={t.name}
        badge={
          <span className="row-2">
            <Badge tone="warning">Staff only</Badge>
            <Badge>{t.category}</Badge>
          </span>
        }
        sub={
          <span className="row-2">
            <MonoChip>{t.id}</MonoChip>
            <span className="t-muted">·</span>
            <span className="t-sm">{titleCase(t.type)}</span>
          </span>
        }
        actions={
          <>
            <Btn icon="eye" onClick={() => window.open(data.previewUrl, '_blank')}>
              Preview
            </Btn>
            <Btn
              variant="primary"
              icon="code"
              onClick={() =>
                navigate('/internal/recipe-edit?shopId=' + encodeURIComponent('__templates__') + '&moduleId=' + encodeURIComponent(t.id))
              }
            >
              Edit recipe
            </Btn>
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Category" value={t.category} icon="categories" tone="info" />
        <StatTile label="Type" value={titleCase(t.type)} icon="template" tone="info" />
        <StatTile label="Readiness" value={titleCase(String(data.readiness))} icon="check" tone="success" />
        <StatTile label="Tags" value={(t.tags || []).length} sub="associated" icon="layers" tone="magic" />
      </div>
      <div className="col-main">
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Template details
          </div>
          <KV
            rows={[
              ['Template ID', <MonoChip key="id">{t.id}</MonoChip>],
              ['Name', t.name],
              ['Category', <Badge key="c">{t.category}</Badge>],
              ['Type', titleCase(t.type)],
              [
                'Tags',
                <div key="tg" className="row-1 row-wrap">
                  {(t.tags || []).map((tag: string) => (
                    <span key={tag} className="tag" style={{ height: 22 }}>
                      {tag}
                    </span>
                  ))}
                </div>,
              ],
            ]}
          />
          {t.description && (
            <>
              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="t-h3" style={{ marginBottom: 8 }}>
                Summary
              </div>
              <p className="t-sm" style={{ color: 'var(--p-text-secondary)' }}>
                {t.description}
              </p>
            </>
          )}
        </Card>
        <Card pad>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <div className="t-h3">RecipeSpec</div>
            <Badge tone="warning">Staff only</Badge>
          </div>
          <p className="t-xs t-muted" style={{ marginBottom: 12 }}>
            Internal blueprint that defines how this template is generated. Hidden from the merchant. Edits are validated with
            the Zod schema and saved as a template override.
          </p>
          <pre
            key={t.id}
            className="code-block"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setSpecText(e.currentTarget.textContent ?? '')}
          >
            {JSON.stringify(data.fullSpec, null, 2)}
          </pre>
          <div className="row spread" style={{ marginTop: 12, gap: 10 }}>
            <a href={data.previewUrl} className="related-link" target="_blank" rel="noreferrer" style={{ flex: 1 }}>
              <Icon name="eye" size={16} />
              <span className="grow">Open rendered preview</span>
              <Icon name="external" size={15} className="t-muted" />
            </a>
            <Btn variant="primary" icon="download" onClick={saveOverride} loading={saveFetcher.state !== 'idle'}>
              Save override
            </Btn>
          </div>
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 8 }}>
            Create sandbox
          </div>
          <p className="t-xs t-muted" style={{ marginBottom: 12 }}>
            Spin up a DRAFT module from this template on a store to test it. Merchants are not affected until it is published.
          </p>
          <div className="row-3" style={{ alignItems: 'flex-end' }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <Field label="Store">
                <Select
                  options={storeOptions}
                  value={storeId}
                  onChange={(e: any) => setStoreId(e.target.value)}
                  disabled={data.stores.length === 0}
                />
              </Field>
            </div>
            <Btn
              variant="primary"
              icon="plus"
              onClick={createSandbox}
              disabled={!storeId}
              loading={sandboxFetcher.state !== 'idle'}
            >
              Create sandbox
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
