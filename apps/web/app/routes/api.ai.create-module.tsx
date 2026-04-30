import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { generateValidatedRecipeOptions, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { classifyUserIntent, CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';
import { augmentWithCheapClassifier } from '~/services/ai/cheap-classifier.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt } from '~/services/ai/token-budget.server';
import { buildPromptRouterDecision } from '~/services/ai/prompt-router.server';

/** POST only; GET (e.g. prefetch or redirect) returns 405. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/ai/create-module', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      let prompt = String(form.get('prompt') ?? '').trim();
      if (!prompt) return json({ error: 'Missing prompt' }, { status: 400 });

      const preferredType = String(form.get('preferredType') ?? 'Auto').trim();
      const preferredCategory = String(form.get('preferredCategory') ?? 'Auto').trim();
      const preferredBlockType = String(form.get('preferredBlockType') ?? 'Auto').trim();

      const constraints: string[] = [];
      if (preferredType && preferredType !== 'Auto') {
        constraints.push(`Module type must be exactly: ${preferredType}.`);
      }
      if (preferredCategory && preferredCategory !== 'Auto') {
        constraints.push(`Category must be: ${preferredCategory}.`);
      }
      if (preferredBlockType && preferredBlockType !== 'Auto') {
        constraints.push(`For customer account blocks, target must be: ${preferredBlockType}.`);
      }

      const prisma = getPrisma();
      const shopRow = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
        update: {},
      });

      const quotaService = new QuotaService();
      await quotaService.enforce(shopRow.id, 'aiRequest');

      // Resolve plan tier so AI only proposes publishable module types
      const caps = new CapabilityService();
      let planTier = shopRow.planTier ?? 'UNKNOWN';
      if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);
      if (planTier && planTier !== 'UNKNOWN') {
        constraints.push(`Merchant plan tier: ${planTier}. Only suggest module types the merchant can publish on this plan. For FREE tier, avoid types that require premium capabilities (e.g. checkout.upsell, checkout.block, postPurchase.offer, proxy.widget, customerAccount.blocks).`);
      }

      // Inject workspace context so AI can avoid name clashes and be aware of existing work
      const [totalModules, publishedModules] = await Promise.all([
        prisma.module.count({ where: { shopId: shopRow.id } }),
        prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
      ]);
      const drafts = totalModules - publishedModules;
      constraints.push(`Workspace: ${totalModules} module(s) total (${publishedModules} published, ${drafts} draft). Avoid names that are likely already in use.`);

      if (constraints.length > 0) {
        prompt = `Constraints: ${constraints.join(' ')}\n\nUser request: ${prompt}`;
      }

      // Tier A + B: keyword + embedding classifier
      let classification = await classifyUserIntent(prompt, preferredType);
      // Tier C: cheap LLM classifier for very low confidence prompts (< 0.55)
      // Augments the keyword result with a structured intent before building the IntentPacket.
      classification = await augmentWithCheapClassifier(classification, prompt, shopRow.id);
      const intentPacket = buildIntentPacket(prompt, classification, {
        storeContext: { shop_domain: session.shop, theme_os2: true },
      });
      const routerDecision = await buildPromptRouterDecision({
        prompt,
        classification,
        intentPacket,
        shopDomain: session.shop,
        operationClass: 'P0_CREATE',
      });

      const jobs = new JobService();
      const job = await jobs.create({
        shopId: shopRow.id,
        type: 'AI_GENERATE',
        payload: { promptLen: prompt.length, classifiedType: classification.moduleType, intent: intentPacket.classification.intent },
      });
      await jobs.start(job.id);

      try {
        const recipeOptions = await generateValidatedRecipeOptions(prompt, classification, {
          shopId: shopRow.id,
          // Parallel single-recipe path manages its own per-call repair; we only
          // need ONE outer attempt of the legacy path as a safety net for types
          // that don't yet have a per-type JSON Schema.
          maxAttempts: 2,
          intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
          confidenceScore: intentPacket.classification.confidence,
          promptProfile: intentPacket.routing.prompt_profile,
          routerDecision,
        });

        await jobs.succeed(job.id, { optionCount: recipeOptions.length, type: classification.moduleType });

        const confidence = intentPacket.classification.confidence;
        const band =
          confidence >= CONFIDENCE_THRESHOLDS.DIRECT
            ? 'direct'
            : confidence >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES
              ? 'with_alternatives'
              : 'fallback';

        return json({
          intentPacket: {
            intent: intentPacket.classification.intent,
            surface: intentPacket.classification.surface,
            confidence,
            confidenceBand: band,
            alternatives: intentPacket.classification.alternatives ?? [],
            reasons: intentPacket.classification.reasons ?? [],
            routing: intentPacket.routing,
          },
          routerDecision,
          options: recipeOptions.map((opt, i) => ({
            index: i,
            explanation: opt.explanation,
            recipe: opt.recipe,
          })),
        });
      } catch (e: any) {
        await jobs.fail(job.id, e);
        if (e instanceof AiProviderNotConfiguredError) {
          return json(
            {
              error: e.code,
              message: e.message,
              setupUrl: '/internal/ai-providers',
            },
            { status: 503 }
          );
        }
        // Surface rate limit errors with a 429 so the client can show a retry message
        if (e?.statusCode === 429 || (e instanceof Error && e.message.includes('rate_limit'))) {
          return json(
            {
              error: 'RATE_LIMITED',
              message: 'AI providers are currently busy. Please wait a moment and try again.',
            },
            { status: 429 }
          );
        }
        return json(
          { error: e instanceof Error ? e.message : String(e) },
          { status: 500 }
        );
      }
    },
  );
}
