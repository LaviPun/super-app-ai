import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { classifyUserIntent, CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';
import { augmentWithCheapClassifier } from '~/services/ai/cheap-classifier.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';

/**
 * Agent API Primitive: Classify a user prompt into a module intent.
 *
 * POST /api/agent/classify
 * Body: { prompt: string }
 *
 * Returns classification result with intent, confidence, alternatives, and
 * the intent packet (store context + catalog). Agents can use this to
 * understand what a user wants before deciding to create, modify, or ask.
 *
 * This is a READ-ONLY primitive — it does not persist anything.
 */
export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  const contentType = request.headers.get('Content-Type') ?? '';
  let prompt = '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as { prompt?: string };
    prompt = String(body.prompt ?? '').trim();
  } else {
    const form = await request.formData().catch(() => null);
    prompt = String(form?.get('prompt') ?? '').trim();
  }

  if (!prompt) return json({ error: 'Missing prompt' }, { status: 400 });

  // Classify intent
  const classifyResult = await classifyUserIntent(prompt);
  const augmented = await augmentWithCheapClassifier(classifyResult, prompt);

  // Build intent packet (store context + catalog metadata)
  const packet = buildIntentPacket(prompt, augmented, {
    storeContext: { shop_domain: session.shop },
  });

  const band =
    augmented.confidenceScore >= CONFIDENCE_THRESHOLDS.DIRECT
      ? 'direct'
      : augmented.confidenceScore >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES
      ? 'with_alternatives'
      : 'low';

  return json({
    ok: true,
    prompt,
    classification: {
      intent: augmented.intent,
      moduleType: augmented.moduleType,
      intentGroup: augmented.intentGroup,
      surface: augmented.surface,
      confidence: augmented.confidence,
      confidenceScore: augmented.confidenceScore,
      confidenceBand: band,
      alternatives: augmented.alternatives,
      reasons: augmented.reasons,
    },
    intentPacket: packet,
    routing: {
      shouldProceed: augmented.confidenceScore >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES,
      needsClarification: augmented.confidenceScore < CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES,
      suggestion: band === 'direct'
        ? `High confidence — proceed to create module with type: ${augmented.moduleType}`
        : band === 'with_alternatives'
        ? `Medium confidence — offer alternatives: ${augmented.alternatives.map(a => a.intent).join(', ')}`
        : 'Low confidence — ask the user to clarify their intent',
    },
  });
}
