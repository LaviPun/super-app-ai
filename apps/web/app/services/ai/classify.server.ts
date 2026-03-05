import type { ModuleType, ClassificationRule } from '@superapp/core';
import { CLASSIFICATION_RULES, INTENT_KEYWORDS, SURFACE_KEYWORDS, MODULE_TYPE_TO_INTENT } from '@superapp/core';

/** Confidence bands for UI (doc 15.14). */
export const CONFIDENCE_THRESHOLDS = {
  DIRECT: 0.8,       // ≥ 0.80 route directly
  WITH_ALTERNATIVES: 0.55, // 0.55–0.79 include alternatives
  // < 0.55 fallback / clarifying question
} as const;

export interface ClassifyResult {
  moduleType: ModuleType;
  /** Clean intent ID for routing (from MODULE_TYPE_TO_INTENT or CLEAN_INTENTS). */
  intent?: string;
  /** Keyword-bucket result for analytics/UI only; not used for routing. */
  intentGroup?: string;
  surface?: string;
  confidence: 'high' | 'medium' | 'low';
  /** Numeric confidence 0–1 (doc 15.14). Used for routing and UI. */
  confidenceScore: number;
  /** Alternative intents with scores (e.g. for 0.55–0.79 band). */
  alternatives: Array<{ intent: string; confidence: number }>;
  /** Short reasons for debugging/UI (e.g. "keyword: popup"). */
  reasons: string[];
}

/** Valid module types from Allowed Values Manifest (classification rules). */
const VALID_CLASSIFICATION_TYPES = CLASSIFICATION_RULES.map((r) => r.type) as string[];

/**
 * Weighted confidence 0–1 (doc 15.14). S1 keyword, S2 embedding placeholder, S3 entity, S4 surface, S5 penalty.
 */
function computeConfidenceScore(params: {
  s1KeywordHit: number; // 0–1 normalized
  s2Embedding?: number; // 0–1, optional
  s3EntityCoverage?: number; // 0–1
  s4SurfaceConsistency?: number; // 0–1
  s5Penalty?: number; // 0 to -0.25
}): number {
  const s1 = Math.min(1, Math.max(0, params.s1KeywordHit));
  const s2 = params.s2Embedding ?? 0;
  const s3 = params.s3EntityCoverage ?? 0;
  const s4 = params.s4SurfaceConsistency ?? 0;
  const penalty = params.s5Penalty ?? 0;
  return Math.min(1, Math.max(0, 0.3 * s1 + 0.4 * s2 + 0.15 * s3 + 0.1 * s4 + penalty));
}

/**
 * Classify user intent using keyword matching (zero LLM cost).
 * If preferredType is already set by the user, use that directly.
 * Returns numeric confidence and alternatives for UI (Phase 2).
 */
export function classifyUserIntent(
  prompt: string,
  preferredType?: string,
): ClassifyResult {
  if (preferredType && preferredType !== 'Auto') {
    if (VALID_CLASSIFICATION_TYPES.includes(preferredType)) {
      const intentGroup = matchKeywords(prompt, INTENT_KEYWORDS);
      const surface = matchKeywords(prompt, SURFACE_KEYWORDS);
      const intent = MODULE_TYPE_TO_INTENT[preferredType] ?? preferredType;
      const reasons = ['preferred_type_set'];
      const confidenceScore = 0.9;
      return {
        moduleType: preferredType as ModuleType,
        intent,
        intentGroup,
        surface,
        confidence: 'high',
        confidenceScore,
        alternatives: [],
        reasons,
      };
    }
  }

  const lower = prompt.toLowerCase();
  const scored: Array<{ rule: ClassificationRule; score: number; reasons: string[] }> = [];

  for (const rule of CLASSIFICATION_RULES) {
    let score = 0;
    const reasons: string[] = [];
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        score += kw.split(' ').length;
        reasons.push(`keyword: ${kw}`);
      }
    }
    if (score > 0) scored.push({ rule, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const bestMatch = best?.rule ?? null;
  const bestScore = best?.score ?? 0;

  const intentGroup = matchKeywords(prompt, INTENT_KEYWORDS);
  const surface = matchKeywords(prompt, SURFACE_KEYWORDS);
  const intentId = bestMatch ? (MODULE_TYPE_TO_INTENT[bestMatch.type] ?? bestMatch.type) : 'promo.popup';

  const s1Norm = bestScore >= 3 ? 1 : bestScore >= 2 ? 0.85 : bestScore >= 1 ? 0.5 : 0;
  const s3Entity = /\d+%|percent|discount|₹|\$|bogo|free shipping|collection|product/i.test(prompt) ? 1 : 0;
  const s4Surface = surfaceAndIntentConsistent(bestMatch?.type, surface) ? 1 : 0;
  const confidenceScore = computeConfidenceScore({
    s1KeywordHit: s1Norm,
    s3EntityCoverage: s3Entity * 0.5,
    s4SurfaceConsistency: s4Surface,
  });

  const alternatives = scored.slice(1, 4).map(({ rule, score }) => ({
    intent: MODULE_TYPE_TO_INTENT[rule.type] ?? rule.type,
    confidence: computeConfidenceScore({
      s1KeywordHit: score >= 2 ? 0.6 : score >= 1 ? 0.3 : 0.1,
    }),
  }));

  return {
    moduleType: (bestMatch?.type ?? 'theme.banner') as ModuleType,
    intent: intentId,
    intentGroup,
    surface,
    confidence: bestScore >= 2 ? 'high' : bestScore >= 1 ? 'medium' : 'low',
    confidenceScore,
    alternatives,
    reasons: best?.reasons ?? [],
  };
}

function surfaceAndIntentConsistent(moduleType?: string, surface?: string): boolean {
  if (!moduleType || !surface) return true;
  if (moduleType.startsWith('admin.') && surface === 'account') return false;
  if (moduleType.startsWith('theme.') && (surface === 'home' || surface === 'product' || surface === 'collection')) return true;
  return true;
}

function matchKeywords(prompt: string, map: Record<string, string[]>): string | undefined {
  const lower = prompt.toLowerCase();
  let best: string | undefined;
  let bestScore = 0;
  for (const [key, keywords] of Object.entries(map)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}
