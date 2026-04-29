import type { ModuleType } from '@superapp/core';
import { RecipeSpecSchema } from '@superapp/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Per-type JSON Schema registry. Built once at module load by extracting the
 * branch from the discriminated union for each type and converting it via
 * zod-to-json-schema. Replaces the prose `getFullRecipeSchemaSpec` for any
 * type we have a schema for and is passed directly to OpenAI Responses
 * `text.format = json_schema` and Anthropic tool_use.
 *
 * Why this matters: structured outputs guarantee the model returns a JSON
 * value that matches the schema, eliminating the entire class of "wrong type
 * field" / "missing required key" / "wrong enum" Zod failures we currently
 * burn 2 repair calls on.
 */

type JsonSchemaObject = Record<string, unknown>;

interface CompiledRecipeSchema {
  /** A JSON Schema for one full recipe (top-level keys: type, name, category, requires, config, ...). */
  recipe: JsonSchemaObject;
  /** A JSON Schema wrapping the recipe inside an `{ options: [{ explanation, recipe }] }` envelope. */
  options: JsonSchemaObject;
  /** A JSON Schema wrapping a single recipe inside `{ recipe }`. */
  single: JsonSchemaObject;
}

const REGISTRY = new Map<ModuleType, CompiledRecipeSchema>();

function buildRegistry() {
  if (REGISTRY.size > 0) return;
  for (const branch of RecipeSpecSchema.options) {
    const typeShape = (branch as unknown as { shape: { type: { _def: { value: ModuleType } } } }).shape.type;
    const moduleType = typeShape._def.value;
    const recipeSchema = zodToJsonSchema(branch, {
      name: `Recipe_${sanitize(moduleType)}`,
      $refStrategy: 'none',
      target: 'jsonSchema7',
    }) as JsonSchemaObject;

    const optionsSchema: JsonSchemaObject = {
      type: 'object',
      additionalProperties: false,
      required: ['options'],
      properties: {
        options: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['recipe'],
            properties: {
              explanation: { type: 'string', maxLength: 500 },
              recipe: stripDefinitionsWrapper(recipeSchema),
            },
          },
        },
      },
    };

    const singleSchema: JsonSchemaObject = {
      type: 'object',
      additionalProperties: false,
      required: ['recipe'],
      properties: {
        explanation: { type: 'string', maxLength: 500 },
        recipe: stripDefinitionsWrapper(recipeSchema),
      },
    };

    REGISTRY.set(moduleType, {
      recipe: stripDefinitionsWrapper(recipeSchema),
      options: optionsSchema,
      single: singleSchema,
    });
  }
}

/**
 * `zodToJsonSchema(s, { name })` returns `{ $ref, definitions: { name: ... } }`.
 * For OpenAI / Anthropic structured output we want the inline schema, not a
 * `$ref` pointer — so unwrap the definition.
 */
function stripDefinitionsWrapper(schema: JsonSchemaObject): JsonSchemaObject {
  const ref = schema.$ref as string | undefined;
  const defs = schema.definitions as Record<string, JsonSchemaObject> | undefined;
  if (ref && defs) {
    const m = /^#\/definitions\/(.+)$/.exec(ref);
    const key = m?.[1];
    if (key) {
      const target = defs[key];
      if (target) return target;
    }
  }
  return schema;
}

function sanitize(t: string): string {
  return t.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Returns a JSON Schema for a single recipe of the given type, or undefined
 * if we don't have a per-type schema (caller should fall back to the prose
 * `getFullRecipeSchemaSpec`).
 */
export function getRecipeJsonSchemaForType(moduleType: ModuleType): JsonSchemaObject | undefined {
  buildRegistry();
  return REGISTRY.get(moduleType)?.recipe;
}

/**
 * Returns a JSON Schema for the `{ options: [...] }` envelope used by the
 * "3 options" generation path.
 */
export function getRecipeOptionsJsonSchemaForType(moduleType: ModuleType): JsonSchemaObject | undefined {
  buildRegistry();
  return REGISTRY.get(moduleType)?.options;
}

/**
 * Returns a JSON Schema for the `{ recipe }` envelope used by the single-
 * recipe streaming and repair paths.
 */
export function getRecipeSingleJsonSchemaForType(moduleType: ModuleType): JsonSchemaObject | undefined {
  buildRegistry();
  return REGISTRY.get(moduleType)?.single;
}

/**
 * Test/debug helper.
 */
export function listSupportedModuleTypes(): ModuleType[] {
  buildRegistry();
  return [...REGISTRY.keys()];
}

/**
 * Backward-compatible: returns the legacy "any RecipeSpec" envelope schema
 * (`{ recipe: <union> }`). New callers should prefer
 * `getRecipeSingleJsonSchemaForType` because that yields a per-type schema
 * which structured outputs can enforce strictly.
 */
export function getRecipeJsonSchema(): JsonSchemaObject {
  const inner = zodToJsonSchema(RecipeSpecSchema, { $refStrategy: 'none' }) as JsonSchemaObject;
  return {
    type: 'object',
    properties: { recipe: inner },
    required: ['recipe'],
    additionalProperties: false,
  };
}

/**
 * Backward-compatible: returns the legacy "3 options of any type" envelope
 * schema. New callers should prefer `getRecipeOptionsJsonSchemaForType` for
 * tighter per-type enforcement.
 */
export function getProposalSetSchema(): JsonSchemaObject {
  const inner = zodToJsonSchema(RecipeSpecSchema, { $refStrategy: 'none' }) as JsonSchemaObject;
  return {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            explanation: { type: 'string' },
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
