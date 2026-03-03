import { RecipeSpecSchema } from '@superapp/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function getRecipeJsonSchema() {
  // JSON Schema used for provider structured outputs.
  // Keep it stable across providers to make evals repeatable.
  return zodToJsonSchema(RecipeSpecSchema, {
    name: 'recipe_spec',
    $refStrategy: 'none',
  });
}
