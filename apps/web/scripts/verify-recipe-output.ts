/**
 * Verify an AI create-module output the SAME way the server does before it would
 * be accepted: unwrap the { recipe } wrapper → repairRecipeForValidation (the
 * pre-Zod coercion pass) → RecipeSpecSchema.safeParse (strict Zod).
 *
 * This reuses the real exported helpers from llm.server, so a PASS here means the
 * server's parallel single-recipe path would accept the recipe without a repair
 * round-trip (or with the deterministic repair pass only — reported separately).
 *
 * Usage:
 *   pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json \
 *     scripts/verify-recipe-output.ts path/to/ai-output.json
 *   # or pipe:  cat ai-output.json | tsx ... scripts/verify-recipe-output.ts -
 */

import { readFileSync } from 'node:fs';
import { RecipeSpecSchema } from '@superapp/core';
import { unwrapRecipe, repairRecipeForValidation } from '~/services/ai/llm.server';

function readInput(pathArg: string | undefined): string {
  if (!pathArg || pathArg === '-') return readFileSync(0, 'utf8');
  return readFileSync(pathArg, 'utf8');
}

function main() {
  const raw = readInput(process.argv[2]);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: false, stage: 'json_parse', error: String(e) }, null, 2));
    process.exit(1);
  }

  // The single-recipe path expects { explanation, recipe }. unwrapRecipe also
  // tolerates a bare recipe object for backward compatibility.
  const explanation = (parsedJson as { explanation?: unknown })?.explanation;
  const recipeRaw = unwrapRecipe(parsedJson);

  // Strict parse on the RAW model output (no repair) — strongest signal.
  const strict = RecipeSpecSchema.safeParse(recipeRaw);

  // Server path: repair coercion pass, then strict parse.
  const repaired = repairRecipeForValidation(recipeRaw);
  const afterRepair = RecipeSpecSchema.safeParse(repaired);
  const repairChangedShape = JSON.stringify(recipeRaw) !== JSON.stringify(repaired);

  const ok = afterRepair.success;
  const result = {
    ok,
    explanation: typeof explanation === 'string' ? explanation : null,
    strictParse: {
      success: strict.success,
      error: strict.success ? null : strict.error.issues.slice(0, 12),
    },
    repairPass: {
      changedShape: repairChangedShape,
      success: afterRepair.success,
      error: afterRepair.success ? null : afterRepair.error.issues.slice(0, 12),
    },
    validatedRecipe: afterRepair.success ? afterRepair.data : null,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
