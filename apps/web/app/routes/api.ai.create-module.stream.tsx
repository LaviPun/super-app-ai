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
  enforceRateLimit(`ai:${session.shop}`);

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

  const confidence = intentPacket.classification.confidence;
  const band =
    confidence >= CONFIDENCE_THRESHOLDS.DIRECT
      ? 'direct'
      : confidence >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES
        ? 'with_alternatives'
        : 'fallback';

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
      });

      let validCount = 0;
      try {
        for await (const event of generateValidatedRecipeOptionsStream(finalPrompt, classification, {
          shopId: shopRow.id,
          intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
          confidenceScore: confidence,
          promptProfile: intentPacket.routing.prompt_profile,
          optionCount: 3,
        })) {
          if (event.kind === 'option') validCount++;
          send(event.kind, event);
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
