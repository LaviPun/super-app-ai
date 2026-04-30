import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { generateValidatedRecipeOptions, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { classifyUserIntent, CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';
import { augmentWithCheapClassifier } from '~/services/ai/cheap-classifier.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt } from '~/services/ai/token-budget.server';
import { buildPromptRouterDecision } from '~/services/ai/prompt-router.server';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { JobService } from '~/services/jobs/job.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';

/**
 * Agent API Primitive: Generate 3 RecipeSpec options from a prompt — WITHOUT saving.
 *
 * POST /api/agent/generate-options
 * Body: { prompt: string, preferredType?: string }
 *
 * Wrapped in `withApiLogging` so agent failures hit `ApiLog` + `ErrorLog`
 * exactly like merchant calls (Phase 1.8 of the audit & rebuild plan).
 */
export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    {
      actor: 'INTERNAL',
      method: request.method,
      path: '/api/agent/generate-options',
      request,
      captureRequestBody: true,
      captureResponseBody: true,
    },
    async () => {
      enforceRateLimit(`ai:${session.shop}`);

      const contentType = request.headers.get('Content-Type') ?? '';
      if (!contentType.includes('application/json')) {
        return json({ error: 'Content-Type must be application/json' }, { status: 415 });
      }

      const body = (await request.json().catch(() => null)) as
        | { prompt?: string; preferredType?: string }
        | null;
      const prompt = String(body?.prompt ?? '').trim();
      if (!prompt) return json({ error: 'Missing prompt' }, { status: 400 });
      const preferredType = String(body?.preferredType ?? 'Auto').trim();

      const prisma = getPrisma();
      const shopRow = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
        update: {},
      });

      const quotaService = new QuotaService();
      await quotaService.enforce(shopRow.id, 'aiRequest');

      const constraints: string[] = [];
      if (preferredType && preferredType !== 'Auto') {
        constraints.push(`Module type must be exactly: ${preferredType}.`);
      }

      const caps = new CapabilityService();
      let planTier = shopRow.planTier ?? 'UNKNOWN';
      if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);
      if (planTier && planTier !== 'UNKNOWN') {
        constraints.push(`Merchant plan tier: ${planTier}. Only suggest types the merchant can publish.`);
      }

      const [totalModules, publishedModules] = await Promise.all([
        prisma.module.count({ where: { shopId: shopRow.id } }),
        prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
      ]);
      const drafts = totalModules - publishedModules;
      constraints.push(
        `Workspace: ${totalModules} module(s) (${publishedModules} published, ${drafts} draft). Avoid names already in use.`,
      );

      const augmentedPrompt = constraints.length > 0
        ? `Constraints: ${constraints.join(' ')}\n\nUser request: ${prompt}`
        : prompt;

      let classification = await classifyUserIntent(augmentedPrompt, preferredType);
      classification = await augmentWithCheapClassifier(classification, augmentedPrompt, shopRow.id);
      const intentPacket = buildIntentPacket(augmentedPrompt, classification, {
        storeContext: { shop_domain: session.shop, theme_os2: true },
      });
      const routerDecision = await buildPromptRouterDecision({
        prompt: augmentedPrompt,
        classification,
        intentPacket,
        shopDomain: session.shop,
        operationClass: 'P0_CREATE',
      });

      const confidence = intentPacket.classification.confidence;
      const band =
        confidence >= CONFIDENCE_THRESHOLDS.DIRECT
          ? 'direct'
          : confidence >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES
            ? 'with_alternatives'
            : 'low';

      const jobs = new JobService();
      const job = await jobs.create({
        shopId: shopRow.id,
        type: 'AI_GENERATE',
        payload: {
          promptLen: prompt.length,
          classifiedType: classification.moduleType,
          intent: intentPacket.classification.intent,
          source: 'agent_api',
        },
      });
      await jobs.start(job.id);

      try {
        const recipeOptions = await generateValidatedRecipeOptions(augmentedPrompt, classification, {
          shopId: shopRow.id,
          maxAttempts: 2,
          intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
          confidenceScore: intentPacket.classification.confidence,
          promptProfile: intentPacket.routing.prompt_profile,
          routerDecision,
        });

        await jobs.succeed(job.id, { optionCount: recipeOptions.length, type: classification.moduleType });

        return json({
          ok: true,
          prompt,
          classification: {
            intent: intentPacket.classification.intent,
            moduleType: classification.moduleType,
            confidence,
            confidenceBand: band,
            alternatives: intentPacket.classification.alternatives ?? [],
          },
          routerDecision,
          options: recipeOptions.map((opt, i) => ({
            index: i,
            explanation: opt.explanation,
            recipe: opt.recipe,
          })),
          hint: 'Call POST /api/agent/modules with { spec: <selected recipe> } to save the chosen option.',
        });
      } catch (e) {
        await jobs.fail(job.id, e);
        if (e instanceof AiProviderNotConfiguredError) {
          return json(
            { error: e.code, message: e.message, setupUrl: '/internal/ai-providers' },
            { status: 503 },
          );
        }
        if ((e as { statusCode?: number })?.statusCode === 429 || (e instanceof Error && e.message.includes('rate_limit'))) {
          return json(
            { error: 'RATE_LIMITED', message: 'AI providers are currently busy. Please try again.' },
            { status: 429 },
          );
        }
        return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    },
  );
}
