/**
 * Deterministic "Recommended" option ranking (Phase 2c).
 *
 * The create routes fan out into up to 3 candidate options. This module ranks
 * them with a ZERO-LATENCY, side-effect-free composite score built ENTIRELY from
 * signals that are already available by the time an option exists — no extra LLM
 * calls, no network, no DB. It just tells the UI which option to preselect and
 * why (merchant-facing badges).
 *
 * Composite score (higher = better):
 *
 *   score = BASE
 *         - FAIL_WEIGHT  * qaSummary.fails      (blocking design/render/richness QA fails)
 *         - WARN_WEIGHT  * qaSummary.warns      (non-blocking QA warnings)
 *         - VERIFY_WEIGHT * verifyPenalty(...)  (tournament deterministic gates: schema,
 *                                                compiler, non-destructive, design-QA, richness)
 *         + DELTA_BONUS  when generationMode === 'delta'  (template-grounded = structurally proven)
 *
 * Ties break toward the lower option index (option 0 first).
 *
 * `qaSummary` is the per-option QA outcome recorded by `applyDesignQaWithRetry`
 * in `llm.server.ts`. When absent (legacy paths), the QA terms are treated as 0
 * and the ranking still works off the always-available `verifyPenalty`.
 *
 * `verifyRecipe`/`verifyPenalty` are pure + synchronous (they run the same
 * deterministic gates the tournament uses), so running them per option is cheap.
 */
import type { RecipeSpec } from '@superapp/core';
import { verifyRecipe, verifyPenalty } from '~/services/tournament/verify';

/** Per-option design/render/richness QA outcome, recorded at generation time. */
export type OptionQaSummary = { fails: number; warns: number; autofixes: number };

/**
 * Structural subset of `RecipeOption` this ranker needs. `RecipeOption` from
 * `llm.server.ts` satisfies it, but keeping it structural avoids an import cycle
 * (llm.server → routes → option-ranking).
 */
export type RankableOption = {
  recipe: RecipeSpec;
  generationMode?: 'delta' | 'freeform';
  qaSummary?: OptionQaSummary;
};

export type OptionScore = { index: number; score: number; badges: string[] };
export type RankingResult = { recommendedIndex: number; scores: OptionScore[] };

// Weights are calibrated so a blocking QA fail (heaviest signal) always outranks
// warnings and the delta bonus, while verify-gate failures (schema/compiler/
// non-destructive) remain decisive via verifyPenalty's own 0..10 scale.
const BASE_SCORE = 100;
const FAIL_WEIGHT = 12;
const WARN_WEIGHT = 1.5;
const VERIFY_WEIGHT = 2;
const DELTA_BONUS = 4;

/**
 * Rough, deterministic content-depth proxy used ONLY to award the comparative
 * 'Richest content' badge — it never feeds the score (richness already enters
 * the score via `qaSummary`). Counts authored blocks plus populated scalar
 * config fields.
 */
export function contentDepth(recipe: RecipeSpec): number {
  const config = ((recipe as { config?: unknown }).config ?? {}) as Record<string, unknown>;
  let depth = 0;
  if (Array.isArray(config.blocks)) depth += config.blocks.length * 2;
  const fieldsHost =
    config.fields && typeof config.fields === 'object' && !Array.isArray(config.fields)
      ? (config.fields as Record<string, unknown>)
      : config;
  for (const value of Object.values(fieldsHost)) {
    if (value == null) continue;
    if (typeof value === 'string') {
      if (value.trim().length > 0) depth += 1;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      depth += 1;
    } else if (Array.isArray(value)) {
      depth += value.length;
    }
  }
  return depth;
}

/**
 * Rank the candidate options and pick the recommended one. Pure: no I/O, no
 * mutation of the inputs. Returns a stable `recommendedIndex` (lowest index on a
 * tie) plus a per-option score + human-readable badges the UI can surface.
 */
export function rankOptions(options: RankableOption[]): RankingResult {
  if (options.length === 0) return { recommendedIndex: 0, scores: [] };

  const depths = options.map((o) => contentDepth(o.recipe));
  const maxDepth = Math.max(...depths);
  // Only a UNIQUE deepest option earns the 'Richest content' badge, and only when
  // there's something to compare it against.
  const uniqueRichest = options.length >= 2 && depths.filter((d) => d === maxDepth).length === 1 && maxDepth > 0;

  const scores: OptionScore[] = options.map((o, index) => {
    const fails = o.qaSummary?.fails ?? 0;
    const warns = o.qaSummary?.warns ?? 0;

    let penalty = 0;
    try {
      penalty = verifyPenalty(verifyRecipe(`opt-${index}`, o.recipe));
    } catch {
      // A verify throw shouldn't sink ranking — treat as no penalty.
      penalty = 0;
    }

    const deltaBonus = o.generationMode === 'delta' ? DELTA_BONUS : 0;
    const raw =
      BASE_SCORE - FAIL_WEIGHT * fails - WARN_WEIGHT * warns - VERIFY_WEIGHT * penalty + deltaBonus;
    const score = Math.round(raw * 100) / 100;

    const badges: string[] = [];
    // Only claim "passes all design QA" when we actually ran QA for this option.
    if (o.qaSummary && fails === 0) badges.push('Passes all design QA');
    if (o.generationMode === 'delta') badges.push('Template-grounded');
    if (uniqueRichest && depths[index] === maxDepth) badges.push('Richest content');

    return { index, score, badges };
  });

  let recommendedIndex = 0;
  for (let i = 1; i < scores.length; i++) {
    // Strict `>` keeps the earliest (lowest-index) option on a tie.
    if (scores[i]!.score > scores[recommendedIndex]!.score) recommendedIndex = i;
  }

  return { recommendedIndex, scores };
}
