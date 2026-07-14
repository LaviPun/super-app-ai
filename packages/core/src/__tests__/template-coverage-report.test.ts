import { describe, it, expect } from 'vitest';
import { MODULE_TEMPLATES } from '../templates.js';
import { RECIPE_SPEC_TYPES } from '../allowed-values.js';

/**
 * Template coverage report (Phase 6 vocab-hardening).
 *
 * Two contracts, deliberately at different strengths:
 *
 *  1. ENFORCED — every RecipeSpec type must have ≥ 1 template. This is the same
 *     floor the `covers all RecipeSpec type variants` gate in templates.test.ts
 *     guarantees; re-asserted here so the coverage report and the gate can never
 *     drift apart.
 *
 *  2. ASPIRATIONAL (non-failing report) — every type SHOULD have ≥ 3 non-floor
 *     (exemplar/standard) templates so retrieval has real breadth to rank, not just
 *     a single hand-authored coverage stub. Floors (see templates/coverage.ts) do
 *     NOT count toward this depth target. This is reported via `it.todo` + a
 *     console table so a thin family is visible without turning the build red — the
 *     depth backfill is an ongoing program, not a merge gate.
 */

type Depth = { type: string; total: number; nonFloor: number; floor: number };

function computeDepth(): Depth[] {
  return RECIPE_SPEC_TYPES.map((type) => {
    const forType = MODULE_TEMPLATES.filter((t) => t.type === type);
    const floor = forType.filter((t) => t.tier === 'floor').length;
    return {
      type,
      total: forType.length,
      nonFloor: forType.length - floor,
      floor,
    };
  });
}

describe('template coverage report', () => {
  // ── (1) ENFORCED: every type has ≥ 1 template ────────────────────────────────
  it('every RECIPE_SPEC_TYPE has at least one template', () => {
    const missing = computeDepth()
      .filter((d) => d.total === 0)
      .map((d) => d.type);
    expect(missing, `types with zero templates: ${missing.join(', ')}`).toEqual([]);
  });

  // ── (2) ASPIRATIONAL: report (do not fail on) types below the depth target ────
  const DEPTH_TARGET = 3;

  it('reports non-floor template depth per type (informational, never fails)', () => {
    const depth = computeDepth().sort((a, b) => a.nonFloor - b.nonFloor);
    const thin = depth.filter((d) => d.nonFloor < DEPTH_TARGET);

    // Surface the thin families so they are visible in CI output without gating.
    // eslint-disable-next-line no-console
    console.table(
      thin.map((d) => ({ type: d.type, nonFloor: d.nonFloor, floor: d.floor, total: d.total })),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[coverage] ${thin.length}/${depth.length} types have < ${DEPTH_TARGET} non-floor templates`,
    );

    // Report only — the shape is always valid, the count is never asserted against.
    expect(Array.isArray(thin)).toBe(true);
  });

  // The depth target is an aspirational goal tracked as a todo, not a passing gate:
  // it stays visible in the runner summary until every family clears the target.
  it.todo(`every RECIPE_SPEC_TYPE reaches ≥ ${DEPTH_TARGET} non-floor templates`);
});
