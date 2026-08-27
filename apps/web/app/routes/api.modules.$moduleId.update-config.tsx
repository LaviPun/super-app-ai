import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { ActivityLogService } from '~/services/activity/activity.service';

/** GET not allowed. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST: SchemaForm's save action for the module-detail Settings tab. Replaces
 * the current draft spec's `config` branch wholesale with the merchant-edited
 * value and persists it as a new DRAFT version (ModuleService.createNewVersion
 * already preserves hydration data forward — see module.service.ts — so this
 * save never loses the "Generate full settings" output).
 */
export async function action({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ ok: false, error: 'Missing moduleId' }, { status: 400 });

  const form = await request.formData();
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(String(form.get('configJson') ?? '{}'));
  } catch {
    return json({ ok: false, error: 'Malformed configJson' }, { status: 400 });
  }

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ ok: false, error: 'Module not found' }, { status: 404 });
  const draft = mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.versions[0];
  if (!draft) return json({ ok: false, error: 'No version to edit' }, { status: 400 });

  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(draft.specJson) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Module spec is invalid' }, { status: 422 });
  }
  const nextSpec = { ...spec, config };

  const version = await moduleService.createNewVersion(session.shop, moduleId, nextSpec as never);
  await new ActivityLogService().log({
    actor: 'MERCHANT',
    action: 'MODULE_SPEC_EDITED',
    resource: `module:${moduleId}`,
  }).catch(() => {});

  return json({ ok: true, version: version.version });
}
