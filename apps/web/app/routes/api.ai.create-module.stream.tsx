import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import {
  generateValidatedRecipeOptionsStream,
  AiProviderNotConfiguredError,
} from '~/services/ai/llm.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { classifyUserIntent, CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';
import { augmentWithCheapClassifier } from '~/services/ai/cheap-classifier.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt } from '~/services/ai/token-budget.server';
import { buildPromptRouterDecision } from '~/services/ai/prompt-router.server';
import { extractRequirementSpec } from '~/services/ai/requirement-spec.server';
import { searchSolutions } from '~/services/ai/solution-search.server';
import { ensureStoreAesthetic } from '~/services/theme/ensure-aesthetic.server';
import { applyStorePalette } from '~/services/theme/apply-store-palette.server';
import { applyStylePackTokens } from '~/services/ai/apply-style-pack.server';
import { loadStoreAesthetic } from '~/services/ai/design-reference.server';
import { generateValidatedBlueprint } from '~/services/ai/llm.server';
import { planBlueprint } from '~/services/ai/blueprint-planner';
import { isBlueprintsEnabled } from '~/env.server';
import type { RecipeSpec } from '@superapp/core';

/** GET disallowed; this is a streaming POST endpoint. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * Server-Sent Events streaming variant of `/api/ai/create-module`.
 *
 * Returns `text/event-stream` with one event per option as it validates:
 *   event: started     data: { index, approach, total }
 *   event: option      data: { index, approach, explanation, recipe }
 *   event: option_failed data: { index, approach, error }
 *   event: done        data: { valid, total }
 *   event: error       data: { code, message }   (terminal)
 *
 * Use when the merchant UI wants progressive option rendering. The non-streaming
 * `/api/ai/create-module` route still works for clients that prefer batch.
 */
export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  await enforceRateLimit(`ai:${session.shop}`);

  const form = await request.formData();
  const prompt = String(form.get('prompt') ?? '').trim();
  if (!prompt) return json({ error: 'Missing prompt' }, { status: 400 });

  const preferredType = String(form.get('preferredType') ?? 'Auto').trim();
  const preferredCategory = String(form.get('preferredCategory') ?? 'Auto').trim();
  const preferredBlockType = String(form.get('preferredBlockType') ?? 'Auto').trim();

  const constraints: string[] = [];
  if (preferredType && preferredType !== 'Auto') constraints.push(`Module type must be exactly: ${preferredType}.`);
  if (preferredCategory && preferredCategory !== 'Auto') constraints.push(`Category must be: ${preferredCategory}.`);
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

  const caps = new CapabilityService();
  let planTier = shopRow.planTier ?? 'UNKNOWN';
  if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);
  if (planTier && planTier !== 'UNKNOWN') {
    constraints.push(
      `Merchant plan tier: ${planTier}. Only suggest module types the merchant can publish on this plan.`,
    );
  }

  const finalPrompt = constraints.length > 0
    ? `Constraints: ${constraints.join(' ')}\n\nUser request: ${prompt}`
    : prompt;

  let classification = await classifyUserIntent(finalPrompt, preferredType);
  classification = await augmentWithCheapClassifier(classification, finalPrompt, shopRow.id);
  const intentPacket = buildIntentPacket(finalPrompt, classification, {
    storeContext: { shop_domain: session.shop, theme_os2: true },
  });
  const routerDecision = await buildPromptRouterDecision({
    prompt: finalPrompt,
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
        : 'fallback';

  // Parity with the batch route: RAG grounding + live store-palette matching so
  // streamed storefront options look the same as the non-streaming path.
  const requirementSpec = await extractRequirementSpec({ userRequest: finalPrompt, classification, intentPacket });
  const { grounding } = searchSolutions(requirementSpec);
  const isStorefrontType =
    classification.moduleType === 'theme.section' || classification.moduleType === 'proxy.widget';
  const matchStoreColors = String(form.get('matchStoreColors') ?? '') === 'true';
  if (isStorefrontType && matchStoreColors) {
    await ensureStoreAesthetic({ admin, shopId: shopRow.id });
  }
  const aesthetic = isStorefrontType && matchStoreColors ? await loadStoreAesthetic(shopRow.id) : null;

  const jobs = new JobService();
  const job = await jobs.create({
    shopId: shopRow.id,
    type: 'AI_GENERATE',
    payload: {
      promptLen: prompt.length,
      classifiedType: classification.moduleType,
      intent: intentPacket.classification.intent,
      stream: true,
    },
  });
  await jobs.start(job.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('intent', {
        intent: intentPacket.classification.intent,
        surface: intentPacket.classification.surface,
        confidence,
        confidenceBand: band,
        alternatives: intentPacket.classification.alternatives ?? [],
        reasons: intentPacket.classification.reasons ?? [],
        routing: intentPacket.routing,
        moduleType: classification.moduleType,
        routerDecision,
      });

      let validCount = 0;
      try {
        for await (const event of generateValidatedRecipeOptionsStream(finalPrompt, classification, {
          shopId: shopRow.id,
          intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
          confidenceScore: confidence,
          promptProfile: intentPacket.routing.prompt_profile,
          routerDecision,
          optionCount: 3,
          groundingBlock: grounding || undefined,
        })) {
          if (event.kind === 'option') {
            validCount++;
            // Snap storefront options onto the live store palette (parity with batch).
            if (aesthetic && event.option?.recipe) {
              try {
                applyStorePalette(event.option.recipe as RecipeSpec, aesthetic.palette);
                applyStylePackTokens(event.option.recipe as RecipeSpec, aesthetic.palette, aesthetic.typography);
              } catch {
                /* palette match is best-effort */
              }
            }
          }
          send(event.kind, event);
        }

        // Blueprint parity: when the request maps to a coordinated set, generate it
        // and stream a `blueprint` event (best-effort — never blocks the options).
        try {
          const plan = planBlueprint({ moduleType: classification.moduleType, intent: intentPacket.classification.intent });
          if (isBlueprintsEnabled() && plan.kind === 'blueprint') {
            const blueprint = await generateValidatedBlueprint(finalPrompt, plan, {
              shopId: shopRow.id,
              intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
              confidenceScore: confidence,
              promptProfile: intentPacket.routing.prompt_profile,
              routerDecision,
              groundingBlock: grounding || undefined,
            });
            if (blueprint) {
              if (aesthetic) {
                for (const member of blueprint.modules) {
                  if (member.recipe.type === 'theme.section' || member.recipe.type === 'proxy.widget') {
                    try { applyStorePalette(member.recipe as RecipeSpec, aesthetic.palette); applyStylePackTokens(member.recipe as RecipeSpec, aesthetic.palette, aesthetic.typography); } catch { /* best-effort */ }
                  }
                }
              }
              send('blueprint', {
                name: blueprint.name,
                summary: blueprint.summary,
                moduleCount: blueprint.modules.length,
                modules: blueprint.modules.map((m) => ({ role: m.role, type: m.recipe.type, explanation: m.explanation, recipe: m.recipe })),
                links: blueprint.links ?? [],
                // R3.1 — forward the composite manifest so the client can persist it.
                ...(blueprint.sharedRecords?.length ? { sharedRecords: blueprint.sharedRecords, bindings: blueprint.bindings ?? [] } : {}),
              });
            }
          }
        } catch {
          /* blueprint is additive — never fail the stream */
        }

        await jobs.succeed(job.id, { optionCount: validCount, type: classification.moduleType });
      } catch (e: unknown) {
        await jobs.fail(job.id, e);
        if (e instanceof AiProviderNotConfiguredError) {
          send('error', { code: e.code, message: e.message, setupUrl: '/internal/ai-providers' });
        } else {
          send('error', {
            code: 'GENERATION_FAILED',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
