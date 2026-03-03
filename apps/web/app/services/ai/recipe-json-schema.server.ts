import { RecipeSpecSchema } from '@superapp/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * OpenAI structured outputs require root `type: "object"`. The RecipeSpecSchema
 * is a discriminated union which produces root `oneOf` / `$ref`. We wrap it in
 * a single-property root object `{ recipe: <union> }` and unwrap after parsing.
 */
export function getRecipeJsonSchema() {
  const inner = zodToJsonSchema(RecipeSpecSchema, { $refStrategy: 'none' });
  return {
    type: 'object' as const,
    properties: { recipe: inner },
    required: ['recipe'],
    additionalProperties: false,
  };
}

/** Schema for the 3-option proposal response. */
export function getProposalSetSchema() {
  const inner = zodToJsonSchema(RecipeSpecSchema, { $refStrategy: 'none' });
  return {
    type: 'object' as const,
    properties: {
      options: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            explanation: { type: 'string' as const },
            recipe: inner,
          },
          required: ['explanation', 'recipe'],
          additionalProperties: false,
        },
        minItems: 3,
        maxItems: 3,
      },
    },
    required: ['options'],
    additionalProperties: false,
  };
}
