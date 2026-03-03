import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'POST', path: '/api/rollback' },
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
        await jobs.succeed(job.id, { rolledBackTo: version, versionId: mv.id });

        return json({ ok: true, rolledBackToVersion: version, versionId: mv.id });
      } catch (e) {
        await jobs.fail(job.id, e);
        throw e;
      }
    }
  );
}
