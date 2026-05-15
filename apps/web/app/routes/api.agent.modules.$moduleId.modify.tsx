import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { modifyRecipeSpecOptions, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';

/**
 * Agent API: Propose 3 AI modification options for a module.
 *
 * POST /api/agent/modules/:moduleId/modify
 * Body: { instruction: string }
 *
 * Returns 3 recipe options. Use /modify-confirm to save one.
 * Does NOT persist anything — read-like AI generation.
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

  await enforceRateLimit(`ai:${session.shop}`);

  const contentType = request.headers.get('Content-Type') ?? '';
  let instruction = '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as { instruction?: string };
    instruction = String(body.instruction ?? '').trim();
  } else {
    const form = await request.formData().catch(() => null);
    instruction = String(form?.get('instruction') ?? '').trim();
  }
  if (!instruction) return json({ error: 'Missing instruction' }, { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
    update: {},
  });

  const quotaService = new QuotaService();
  await quotaService.enforce(shopRow.id, 'aiRequest');

  const caps = new CapabilityService();
  let planTier = shopRow.planTier ?? 'UNKNOWN';
  if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);
  const [totalModules, publishedModules] = await Promise.all([
    prisma.module.count({ where: { shopId: shopRow.id } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
  ]);
  const workspaceContext = planTier !== 'UNKNOWN'
    ? `Plan tier: ${planTier}. Workspace: ${totalModules} module(s) (${publishedModules} published). Keep module type unchanged.`
    : `Workspace: ${totalModules} module(s) (${publishedModules} published). Keep module type unchanged.`;

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  if (!draft) return json({ error: 'No version found' }, { status: 400 });

  const currentSpec = new RecipeService().parse(draft.specJson);

  const jobs = new JobService();
  const job = await jobs.create({ shopId: shopRow.id, type: 'AI_MODIFY', payload: { moduleId, instructionLen: instruction.length, source: 'agent_api' } });
  await jobs.start(job.id);

  try {
    const recipeOptions = await modifyRecipeSpecOptions(currentSpec, `${workspaceContext}\n\nInstruction: ${instruction}`, {
      shopId: shopRow.id,
      maxAttempts: 2,
    });
    await jobs.succeed(job.id, { moduleId, optionCount: recipeOptions.length });

    return json({
      ok: true,
      moduleId,
      currentVersion: draft.version,
      options: recipeOptions.map((opt, i) => ({
        index: i,
        explanation: opt.explanation,
        recipe: opt.recipe,
      })),
      hint: 'Call POST /api/agent/modules/:id/modify-confirm with { spec: <selected recipe> } to save.',
    });
  } catch (e) {
    await jobs.fail(job.id, e);
    if (e instanceof AiProviderNotConfiguredError) {
      return json({ error: e.code, message: e.message, setupUrl: '/internal/ai-providers' }, { status: 503 });
    }
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
