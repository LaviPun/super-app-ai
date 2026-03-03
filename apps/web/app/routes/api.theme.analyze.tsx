import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ThemeAnalyzerService } from '~/services/theme/theme-analyzer.service';
import { JobService } from '~/services/jobs/job.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'POST', path: '/api/theme/analyze' },
    async () => {
      const body = await request.json().catch(() => null) as null | { themeId: string };
      if (!body?.themeId) return json({ error: 'Missing themeId' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
      if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

      const jobs = new JobService();
      const job = await jobs.create({ shopId: shopRow.id, type: 'THEME_ANALYZE', payload: { themeId: body.themeId } });
      await jobs.start(job.id);

      try {
        const analyzer = new ThemeAnalyzerService(admin);
        const profile = await analyzer.analyzeAndStore(shopRow.id, body.themeId);
        await jobs.succeed(job.id, { ok: true });
        return json({ ok: true, profile });
      } catch (e) {
        await jobs.fail(job.id, e);
        throw e;
      }
    }
  );
}
