/**
 * Build IntentPacket from raw user input and classification result.
 * Single contract between local classification and heavy AI (doc 15.5, 15.13).
 */

import type { IntentPacket } from '@superapp/core';
import { IntentPacketSchema, resolveRouting, MODULE_TYPE_TO_INTENT } from '@superapp/core';
import type { ClassifyResult } from './classify.server';

export interface BuildIntentPacketOptions {
  requestId?: string;
  storeContext?: {
    shop_domain?: string;
    currency?: string;
    primary_language?: string;
    theme_os2?: boolean;
  };
  /** Numeric confidence 0-1 (from Phase 2 classifier). */
  confidenceScore?: number;
  /** Alternative intents with confidence (from Phase 2). */
  alternatives?: Array<{ intent: string; confidence: number }>;
}

/**
 * Build a valid IntentPacket from user text and classification.
 * Fills routing from intent or module type via routing table.
 */
export function buildIntentPacket(
  text: string,
  classification: ClassifyResult,
  options: BuildIntentPacketOptions = {},
): IntentPacket {
  const intent =
    classification.intent ??
    MODULE_TYPE_TO_INTENT[classification.moduleType] ??
    'promo.popup';
  const routing = resolveRouting(intent);
  const confidenceScore =
    options.confidenceScore ??
    ('confidenceScore' in classification ? (classification as { confidenceScore: number }).confidenceScore : undefined) ??
    (classification.confidence === 'high' ? 0.85 : classification.confidence === 'medium' ? 0.65 : 0.45);
  const alternatives =
    options.alternatives ??
    ('alternatives' in classification ? (classification as { alternatives: Array<{ intent: string; confidence: number }> }).alternatives : undefined) ??
    [];

  const packet: IntentPacket = {
    schema_version: '1.0',
    request_id: options.requestId,
    timestamp: new Date().toISOString(),
    input: {
      text,
      language_hint: 'auto',
      store_context: options.storeContext,
    },
    classification: {
      intent,
      surface: mapSurface(classification.surface),
      module_archetype: mapArchetype(classification.moduleType),
      mode: 'create',
      confidence: confidenceScore,
      alternatives,
      reasons: 'reasons' in classification ? (classification as { reasons: string[] }).reasons : [],
    },
    routing: {
      prompt_scaffold_id: routing.prompt_scaffold_id,
      prompt_profile: routing.prompt_profile,
      output_schema: routing.output_schema,
      model_tier: routing.model_tier,
    },
  };

  return IntentPacketSchema.parse(packet);
}

function mapSurface(surface?: string): string {
  if (!surface) return 'storefront_theme';
  const m: Record<string, string> = {
    home: 'storefront_theme',
    product: 'storefront_theme',
    collection: 'storefront_theme',
    cart: 'checkout',
    account: 'accounts',
  };
  return m[surface] ?? 'storefront_theme';
}

function mapArchetype(moduleType: string): string {
  if (moduleType === 'theme.popup') return 'modal';
  if (moduleType === 'theme.banner') return 'banner';
  if (moduleType === 'theme.notificationBar') return 'banner';
  if (moduleType === 'admin.block') return 'admin_card';
  if (moduleType === 'pos.extension') return 'pos_tile';
  return 'inline_block';
}
