import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/rollback', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      enforceRateLimit(`rollback:${session.shop}`);

      const form = await request.formData();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const version = parseInt(String(form.get('version') ?? ''), 10);

      if (!moduleId || isNaN(version)) {
        return json({ error: 'Missing moduleId or version' }, { status: 400 });
      }

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

      const mvPre = await prisma.moduleVersion.findFirst({
        where: { moduleId, version, module: { shop: { shopDomain: session.shop } } },
      });
      if (!mvPre) {
        return json({ error: 'Version not found' }, { status: 404 });
      }

      const spec = new RecipeService().parse(mvPre.specJson);
      if (spec.type.startsWith('theme.') && !mvPre.targetThemeId) {
        return json(
          {
            error:
              'This theme module version has no targetThemeId. Open the module and publish to a theme before rolling back.',
          },
          { status: 400 },
        );
      }

      const jobs = new JobService();
      const job = await jobs.create({
        shopId: shopRow?.id,
        type: 'PUBLISH',
        payload: { intent: 'rollback', moduleId, version },
      });
      await jobs.start(job.id);

      try {
        const ms = new ModuleService();
        const mv = await ms.rollbackToVersion(session.shop, moduleId, version);

        const publisher = new PublishService(admin);
        if (spec.type.startsWith('theme.')) {
          await publisher.publish(spec, { kind: 'THEME', themeId: mvPre.targetThemeId!, moduleId });
        } else {
          await publisher.publish(spec, { kind: 'PLATFORM', moduleId });
        }

        await jobs.succeed(job.id, { rolledBackTo: version, versionId: mv.id, shopifySynced: true });
        await new ActivityLogService().log({ actor: 'MERCHANT', action: 'MODULE_ROLLED_BACK', resource: `module:${moduleId}`, shopId: shopRow?.id, details: { version, versionId: mv.id } });

        return json({ ok: true, rolledBackToVersion: version, versionId: mv.id });
      } catch (e) {
        await jobs.fail(job.id, e);
        throw e;
      }
    }
  );
}
