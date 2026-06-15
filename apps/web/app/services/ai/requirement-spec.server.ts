/**
 * RequirementSpec extraction (WS1 / specs/022-requirement-search-generation).
 *
 * Deterministic-first: derive the structured requirement from the existing
 * classify signals + IntentPacket + the control-pack manifest. Escalate to a
 * single LLM call **only** when classifier confidence is below
 * `CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES`. This keeps the create-module call
 * budget bounded (≤ 1 conditional extraction call).
 */
import type { IntentPacket, ModuleType } from '@superapp/core';
import {
  RECIPE_SPEC_TYPES,
  MODULE_TYPE_TO_SURFACE,
  getManifest,
} from '@superapp/core';
import {
  RequirementSpecSchema,
  type RequirementSpec,
} from '@superapp/platform-contracts';
import type { ClassifyResult } from '~/services/ai/classify.server';
import { CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';

const KNOWN_TYPES = new Set<string>(RECIPE_SPEC_TYPES);

/**
 * Controls a module must expose to satisfy its goal, derived from the v2 control
 * pack manifest. Basic tier = base packs; advanced tier = base + advanced packs.
 * Types without a manifest yet contribute no required controls (coverage is then
 * trivially complete — honest, not silently "passed").
 */
export function mustHaveControlsForType(type: ModuleType, tier: 'basic' | 'advanced'): string[] {
  const manifest = getManifest(type);
  if (!manifest) return [];
  const base = [...manifest.packs];
  if (tier === 'advanced' && manifest.advancedPacks) {
    return [...base, ...manifest.advancedPacks];
  }
  return base;
}

/** Pull behavioural triggers from the IntentPacket, if present. */
function triggersFromPacket(packet?: IntentPacket): string[] {
  const trigger = packet?.entities?.behavior?.trigger;
  if (!trigger) return [];
  return [String(trigger)];
}

function audienceFromPacket(packet?: IntentPacket): string {
  const segment = packet?.entities?.audience?.segment;
  return segment ? String(segment) : '';
}

export interface ExtractRequirementSpecParams {
  userRequest: string;
  classification: ClassifyResult;
  intentPacket?: IntentPacket;
  tier?: 'basic' | 'advanced';
  /**
   * Optional one-shot LLM escalation. Invoked at most once, only when classifier
   * confidence is low. Returns a partial spec merged over the deterministic base.
   * Injected so the call budget stays explicit and unit tests stay deterministic.
   */
  escalate?: (base: RequirementSpec) => Promise<Partial<RequirementSpec>>;
}

/** Pure deterministic builder — no LLM, no I/O. */
export function buildDeterministicRequirementSpec(
  params: Omit<ExtractRequirementSpecParams, 'escalate'>,
): RequirementSpec {
  const moduleType = params.classification.moduleType;
  const tier = params.tier ?? 'basic';
  const surface =
    params.classification.surface ??
    (KNOWN_TYPES.has(moduleType) ? MODULE_TYPE_TO_SURFACE[moduleType] : undefined) ??
    'storefront';

  return RequirementSpecSchema.parse({
    goal: params.userRequest.trim(),
    surface: String(surface),
    moduleType,
    mustHaveControls: mustHaveControlsForType(moduleType, tier),
    dataNeeds: [],
    audience: audienceFromPacket(params.intentPacket),
    triggers: triggersFromPacket(params.intentPacket),
    successCriteria: [],
    tier,
    source: 'deterministic',
  });
}

/**
 * Extract a RequirementSpec. Deterministic unless confidence is low and an
 * `escalate` function is supplied — then a single LLM merge runs and the result
 * is re-validated and marked `llm_escalated`.
 */
export async function extractRequirementSpec(
  params: ExtractRequirementSpecParams,
): Promise<RequirementSpec> {
  const base = buildDeterministicRequirementSpec(params);

  const lowConfidence =
    params.classification.confidenceScore < CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES;
  if (!lowConfidence || !params.escalate) {
    return base;
  }

  const partial = await params.escalate(base);
  return RequirementSpecSchema.parse({
    ...base,
    ...partial,
    // moduleType stays bound to the validated discriminator space.
    moduleType: KNOWN_TYPES.has(String(partial.moduleType)) ? partial.moduleType : base.moduleType,
    source: 'llm_escalated',
  });
}
