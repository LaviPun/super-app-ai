import { json, redirect } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
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

export default function AdminTemplateDetail() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const t = data.template;
  const spec = data.templateSpec;

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
            <Btn variant="primary" icon="code" onClick={() => ctx.go('#/admin/recipe-edit')}>
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
            Internal blueprint that defines how this template is generated. Hidden from the merchant.
          </p>
          <pre className="code-block">{JSON.stringify(spec, null, 2)}</pre>
          <div style={{ marginTop: 12 }}>
            <a href={data.previewUrl} className="related-link" target="_blank" rel="noreferrer">
              <Icon name="eye" size={16} />
              <span className="grow">Open rendered preview</span>
              <Icon name="external" size={15} className="t-muted" />
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
