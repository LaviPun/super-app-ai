/**
 * Tier C cheap LLM classifier (Phase 2.2).
 * Called when keyword classifier confidence < 0.55 (FALLBACK band).
 * Uses a minimal LLM prompt to extract intent, moduleType, and surface without generating a full recipe.
 * Result is merged back into ClassifyResult before building the IntentPacket.
 */

import type { ModuleType } from '@superapp/core';
import { RECIPE_SPEC_TYPES, MODULE_TYPE_TO_INTENT } from '@superapp/core';
import { getLlmClient } from '~/services/ai/llm.server';
import type { ClassifyResult } from '~/services/ai/classify.server';
import { CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';

const VALID_TYPES = new Set<string>(RECIPE_SPEC_TYPES);

const CHEAP_CLASSIFIER_PROMPT = `You are a Shopify app intent classifier. Given a merchant's request, output a JSON object with exactly these fields:
{
  "moduleType": "<one of the valid types below>",
  "intent": "<short phrase describing the intent>",
  "surface": "storefront_theme | checkout | admin | pos | flow | accounts",
  "reason": "<one sentence why>"
}

Valid moduleType values:
${RECIPE_SPEC_TYPES.join(', ')}

Rules:
- theme.popup: popups, modals, overlays, lightboxes
- theme.banner: banners, hero banners, image+text blocks
- theme.notificationBar: announcement bars, top bars, info bars
- theme.effect: snow, confetti, seasonal/holiday decorations, visual effects
- theme.floatingWidget: floating buttons, WhatsApp chat, scroll-to-top, chat bubbles
- proxy.widget: server-rendered widgets via app proxy
- functions.*: Shopify Functions (discounts, delivery, payments, validation, cart transforms)
- checkout.*: checkout UI extensions (upsell blocks, informational blocks)
- postPurchase.offer: post-purchase one-click upsell
- admin.block: Shopify admin UI extensions
- analytics.pixel: web pixels, tracking, analytics
- flow.automation: workflows, automations, triggers
- integration.httpSync: HTTP syncs, API connectors
- platform.extensionBlueprint: anything that doesn't fit above

Return ONLY valid JSON, no markdown, no explanation.`;

interface CheapClassifyResult {
  moduleType: ModuleType;
  surface: string;
  reason: string;
}

/**
 * Run a cheap LLM classification pass. Returns null if the LLM call fails
 * (keyword result is used as fallback in that case).
 */
export async function cheapClassify(
  prompt: string,
  shopId?: string | null,
): Promise<CheapClassifyResult | null> {
  try {
    const { client } = await getLlmClient(shopId);
    const fullPrompt = `${CHEAP_CLASSIFIER_PROMPT}\n\nMerchant request: ${prompt}`;
    const { rawJson } = await client.generateRecipe(fullPrompt);

    // Extract JSON from response (model may wrap in markdown)
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const moduleType = parsed?.moduleType;
    if (!moduleType || !VALID_TYPES.has(moduleType)) return null;

    return {
      moduleType: moduleType as ModuleType,
      surface: parsed?.surface ?? 'storefront_theme',
      reason: parsed?.reason ?? 'cheap classifier result',
    };
  } catch {
    // Never throw — keyword result is used as fallback
    return null;
  }
}

/**
 * Runs Tier C cheap classifier and merges the result into the keyword ClassifyResult.
 * Only called when confidenceScore < CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES (< 0.55).
 * Returns an augmented ClassifyResult with improved moduleType, intent, and confidence.
 */
export async function augmentWithCheapClassifier(
  keywordResult: ClassifyResult,
  prompt: string,
  shopId?: string | null,
): Promise<ClassifyResult> {
  if (keywordResult.confidenceScore >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES) {
    return keywordResult; // Only run for very low confidence
  }

  const cheapResult = await cheapClassify(prompt, shopId);
  if (!cheapResult) return keywordResult;

  const intent = MODULE_TYPE_TO_INTENT[cheapResult.moduleType] ?? cheapResult.moduleType;

  return {
    ...keywordResult,
    moduleType: cheapResult.moduleType,
    intent,
    surface: cheapResult.surface,
    // Cheap classifier gives moderate confidence boost (0.6) — not as high as direct keyword match
    confidenceScore: 0.6,
    confidence: 'medium',
    reasons: [...keywordResult.reasons, `tier_c: ${cheapResult.reason}`],
  };
}
