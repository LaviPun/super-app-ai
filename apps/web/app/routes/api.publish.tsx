import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import type { DeployTarget } from '@superapp/core';
import { isCapabilityAllowed } from '@superapp/core';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'POST', path: '/api/publish' },
    async () => {
      enforceRateLimit(`publish:${session.shop}`);

      let body: { moduleId?: string; version?: number; themeId?: string } | null = null;
      const contentType = request.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        body = await request.json().catch(() => null);
      } else {
        const formData = await request.formData().catch(() => null);
        if (formData) {
          body = {
            moduleId: (formData.get('moduleId') as string) ?? undefined,
            themeId: (formData.get('themeId') as string) || undefined,
            version: formData.has('version') ? Number(formData.get('version')) : undefined,
          };
        }
      }
      if (!body?.moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

      const moduleService = new ModuleService();
      const module = await moduleService.getModule(session.shop, body.moduleId);
      if (!module) return json({ error: 'Module not found' }, { status: 404 });

      const draft = module.versions.find(v => v.status === 'DRAFT') ?? module.versions[0];
      if (!draft) return json({ error: 'No version found' }, { status: 400 });

      const spec = new RecipeService().parse(draft.specJson);

      const caps = new CapabilityService();
      let tier = await caps.getPlanTier(session.shop);
      if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);

      const blocked = (spec.requires ?? []).filter((c: any) => !isCapabilityAllowed(tier, c));
      if (blocked.length) {
        const reasons = blocked.map((c: any) => caps.explainCapabilityGate(c) ?? String(c));
        return json({ error: 'Plan does not allow this module', blocked, reasons, planTier: tier }, { status: 403 });
      }

      const isThemeModule = spec.type.startsWith('theme.');
      const target: DeployTarget = isThemeModule
        ? { kind: 'THEME', themeId: body.themeId ?? '' }
        : { kind: 'PLATFORM' };

      if (target.kind === 'THEME' && !target.themeId) {
        return json({ error: 'themeId is required for theme module publish' }, { status: 400 });
      }

      const jobs = new JobService();
      const job = await jobs.create({ shopId: shopRow?.id, type: 'PUBLISH', payload: { moduleId: module.id, target } });
      await jobs.start(job.id);

      try {
        const publisher = new PublishService(admin);
        const result = await publisher.publish(spec, target);

        await moduleService.markPublished(module.id, draft.id, target.kind === 'THEME' ? target.themeId : undefined);
        await jobs.succeed(job.id, { ok: true });
        await new ActivityLogService().log({ actor: 'MERCHANT', action: 'MODULE_PUBLISHED', resource: `module:${module.id}`, shopId: shopRow?.id, details: { target: target.kind, versionId: draft.id } });

        return json({ ok: true, moduleId: module.id, publishedVersionId: draft.id, compiledJson: result.compiledJson });
      } catch (e) {
        await jobs.fail(job.id, e);
        throw e;
      }
    }
  );
}
