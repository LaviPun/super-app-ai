import type { RecipeSpec } from '@superapp/core';

/**
 * Deterministic composition guardrails (docs/design-system/composition-rules.md §6).
 *
 * Runs after generation (alongside applyStorePalette/applyStylePackTokens) so a
 * generated module CANNOT ship a broken composition even when the model ignores
 * the prompt's §04 rules. Conservative by design: it only clamps/repairs what is
 * provably wrong — it never invents content.
 *
 * Rules enforced:
 *  1. Grid columns ↔ content: columns clamped to [1..4] and to the block count;
 *     a single-orphan grid (blocks % columns === 1 with ≥3 columns) drops one
 *     column so no lone item dangles in the last row (§6.1).
 *  2. Centered-measure law: a centered section whose body copy exceeds a short
 *     measure (~280 chars) is switched to left alignment — never center a
 *     paragraph (§04 alignment law / §6.2).
 */
const MAX_COLUMNS = 4;
const CENTERED_BODY_MAX_CHARS = 280;

export function applyCompositionRules<T extends RecipeSpec>(recipe: T): T {
  if (recipe.type !== 'theme.section') return recipe;

  const spec = recipe as unknown as {
    config?: { layout?: { layout?: string; columns?: number }; blocks?: unknown[]; body?: string };
    style?: { typography?: { align?: string } };
  };
  const config = spec.config;
  if (!config) return recipe;

  // ── 1. Columns ↔ content (§6.1) ──
  const layout = config.layout;
  if (layout && typeof layout.columns === 'number') {
    let cols = Math.max(1, Math.min(MAX_COLUMNS, Math.round(layout.columns)));
    const blockCount = Array.isArray(config.blocks) ? config.blocks.length : 0;
    if (blockCount > 0) {
      if (cols > blockCount) cols = blockCount;
      // Lone trailing item in a ≥3-col grid → drop a column (4→3 leaves 13%4=1
      // becoming 13%3=1? recheck: repair once more if still a single orphan).
      while (cols >= 3 && blockCount % cols === 1) cols -= 1;
    }
    if (cols !== layout.columns) layout.columns = cols;
  }

  // ── 2. Centered-measure law (§6.2) ──
  const align = spec.style?.typography?.align;
  const body = typeof config.body === 'string' ? config.body : '';
  if (align === 'center' && body.length > CENTERED_BODY_MAX_CHARS && spec.style?.typography) {
    spec.style.typography.align = 'left';
  }

  return recipe;
}
