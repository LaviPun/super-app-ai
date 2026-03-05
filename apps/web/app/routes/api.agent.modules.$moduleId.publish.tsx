import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { CapabilityService } from '~/services/shopify/capability.service';
import { isCapabilityAllowed } from '@superapp/core';
import type { DeployTarget } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { JobService } from '~/services/jobs/job.service';

/**
 * Agent API: Publish a module to a theme or platform.
 *
 * POST /api/agent/modules/:moduleId/publish
 * Body: { themeId?: string, version?: number }
 *   - themeId: required for theme.* module types
 *   - version: optional specific version to publish (defaults to latest DRAFT)
 */
export async function action({
  request,
  params,
}: {
  request: Request;
  params: { moduleId?: string };
}) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  const contentType = request.headers.get('Content-Type') ?? '';
  let body: { themeId?: string; version?: number } = {};
  if (contentType.includes('application/json')) {
    body = await request.json().catch(() => ({}));
  }

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  // Resolve the version to publish
  let draft = body.version != null
    ? mod.versions.find(v => v.version === body.version)
    : (mod.versions.find(v => v.status === 'DRAFT') ?? mod.versions[0]);

  if (!draft) return json({ error: 'No version found to publish' }, { status: 400 });

  const spec = new RecipeService().parse(draft.specJson);

  // Plan gate
  const caps = new CapabilityService();
  let tier = await caps.getPlanTier(session.shop);
  if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);
  const blocked = (spec.requires ?? []).filter((c: any) => !isCapabilityAllowed(tier, c));
  if (blocked.length) {
    const reasons = blocked.map((c: any) => caps.explainCapabilityGate(c) ?? String(c));
    return json({ error: 'Plan does not allow this module', blocked, reasons, planTier: tier }, { status: 403 });
  }

  // Build deploy target
  const isThemeModule = spec.type.startsWith('theme.');
  const target: DeployTarget = isThemeModule
    ? { kind: 'THEME', themeId: body.themeId ?? '', moduleId }
    : { kind: 'PLATFORM' };

  if (target.kind === 'THEME' && !target.themeId) {
    return json({ error: 'themeId is required for theme.* module types' }, { status: 400 });
  }

  // Pre-publish validation
  const validationErrors = validateBeforePublish(spec, { planTier: tier });
  if (validationErrors.length > 0) {
    return json({ error: 'Pre-publish validation failed', errors: validationErrors }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const jobs = new JobService();
  const job = await jobs.create({ shopId: shopRow?.id, type: 'PUBLISH', payload: { moduleId, target } });
  await jobs.start(job.id);

  try {
    const publisher = new PublishService(admin);
    await publisher.publish(spec, target);
    await moduleService.markPublished(mod.id, draft.id, target.kind === 'THEME' ? target.themeId : undefined);
    await jobs.succeed(job.id, { ok: true });
    await new ActivityLogService().log({
      actor: 'SYSTEM',
      action: 'MODULE_PUBLISHED',
      resource: `module:${moduleId}`,
      shopId: shopRow?.id,
      details: { target: target.kind, versionId: draft.id, source: 'agent_api' },
    }).catch(() => {/* non-fatal */});

    return json({ ok: true, moduleId, versionId: draft.id, version: draft.version, target: target.kind });
  } catch (e) {
    await jobs.fail(job.id, e);
    const message = e instanceof Error ? e.message : 'Publish failed';
    return json({ error: message }, { status: 500 });
  }
}
