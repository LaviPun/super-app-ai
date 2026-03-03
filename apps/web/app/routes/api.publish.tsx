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

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'POST', path: '/api/publish' },
    async () => {
      enforceRateLimit(`publish:${session.shop}`);

      const body = await request.json().catch(() => null) as null | { moduleId: string; version?: number; themeId?: string };
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

      const target: DeployTarget =
        spec.type === 'theme.banner'
          ? { kind: 'THEME', themeId: body.themeId ?? '' }
          : { kind: 'PLATFORM' };

      if (target.kind === 'THEME' && !target.themeId) {
        return json({ error: 'themeId is required for theme.banner publish' }, { status: 400 });
      }

      const jobs = new JobService();
      const job = await jobs.create({ shopId: shopRow?.id, type: 'PUBLISH', payload: { moduleId: module.id, target } });
      await jobs.start(job.id);

      try {
        const publisher = new PublishService(admin);
        const result = await publisher.publish(spec, target);

        await moduleService.markPublished(module.id, draft.id, target.kind === 'THEME' ? target.themeId : undefined);
        await jobs.succeed(job.id, { ok: true });

        return json({ ok: true, moduleId: module.id, publishedVersionId: draft.id, compiledJson: result.compiledJson });
      } catch (e) {
        await jobs.fail(job.id, e);
        throw e;
      }
    }
  );
}
