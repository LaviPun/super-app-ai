/**
 * Verify phase — deterministic gates, no LLM.
 *
 * Reuses the exact gates `evals.server.ts` runs: schema validation, the recipe
 * compiler, the non-destructive invariant check, and the design-QA gate. These
 * fact-check what the audit agents *claimed*: a candidate the model loved still
 * gets penalized if it fails to compile.
 */
import { RecipeSpecSchema, type DeployTarget, type RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { checkNonDestructive } from '~/services/recipes/compiler/non-destructive';
import { runDesignQa, summarizeQa } from '~/services/ai/design-qa.server';
import type { VerifyResult } from '~/services/tournament/types';

/** Deploy target mirrors evals.server.ts: theme types target a theme, everything else the platform. */
function targetForType(type: string): DeployTarget {
  return String(type).startsWith('theme.')
    ? ({ kind: 'THEME', themeId: 'tournament-theme-id', moduleId: 'tournament-module-id' } as DeployTarget)
    : ({ kind: 'PLATFORM' } as DeployTarget);
}

/** Run every deterministic gate against one candidate's recipe. */
export function verifyRecipe(candidateId: string, recipe: unknown): VerifyResult {
  const base: VerifyResult = {
    candidateId,
    schemaValid: false,
    compilerSuccess: false,
    nonDestructive: false,
    nonDestructiveViolations: [],
    designQaPass: false,
    designQaSummary: '',
    gatesRun: 0,
  };

  // Gate 1: schema
  let parsed: RecipeSpec;
  try {
    parsed = RecipeSpecSchema.parse(recipe);
    base.schemaValid = true;
    base.gatesRun++;
  } catch (err) {
    base.error = `Schema: ${String(err)}`;
    return base;
  }

  // Gate 2: compiler + Gate 3: non-destructive invariants
  try {
    const { ops } = compileRecipe(parsed, targetForType(parsed.type));
    base.compilerSuccess = true;
    base.gatesRun++;
    const nd = checkNonDestructive(ops);
    base.nonDestructive = nd.ok;
    base.nonDestructiveViolations = nd.violations;
    base.gatesRun++;
    if (!nd.ok) base.error = `Non-destructive: ${nd.violations.join('; ')}`;
  } catch (err) {
    base.error = `Compiler: ${String(err)}`;
  }

  // Gate 4: design-QA (no-op pass for non-visual recipes)
  try {
    const qa = runDesignQa(parsed);
    base.designQaPass = qa.pass;
    base.designQaSummary = summarizeQa(qa);
    base.gatesRun++;
  } catch (err) {
    base.designQaSummary = `design-qa error: ${String(err)}`;
  }

  return base;
}

/**
 * Penalty (0..10) subtracted from a candidate's judge score for failed gates.
 * Compiler/schema failures are fatal-ish (heavy penalty); QA/non-destructive are lighter.
 */
export function verifyPenalty(v: VerifyResult): number {
  let penalty = 0;
  if (!v.schemaValid) penalty += 6;
  if (!v.compilerSuccess) penalty += 4;
  if (!v.nonDestructive) penalty += 3;
  if (!v.designQaPass) penalty += 1;
  return Math.min(10, penalty);
}
