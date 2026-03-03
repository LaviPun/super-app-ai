import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { generateValidatedRecipe } from '~/services/ai/llm.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { QuotaService } from '~/services/billing/quota.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'POST', path: '/api/ai/create-module' },
    async () => {
      enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      const prompt = String(form.get('prompt') ?? '').trim();
      if (!prompt) return json({ error: 'Missing prompt' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
        update: {},
      });

      await new QuotaService().enforce(shopRow.id, 'aiRequest');

      const jobs = new JobService();
      const job = await jobs.create({ shopId: shopRow.id, type: 'AI_GENERATE', payload: { promptLen: prompt.length } });
      await jobs.start(job.id);

      try {
        const spec = await generateValidatedRecipe(prompt, { shopId: shopRow.id, action: 'RECIPE_GENERATION', maxAttempts: 4 });
        const moduleService = new ModuleService();
        const mod = await moduleService.createDraft(session.shop, spec);
        await jobs.succeed(job.id, { moduleId: mod.id, type: spec.type });
        return json({ moduleId: mod.id, type: spec.type, name: spec.name });
      } catch (e) {
        await jobs.fail(job.id, e);
        throw e;
      }
    }
  );
}
