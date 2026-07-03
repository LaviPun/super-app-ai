import type { ModuleType } from '@superapp/core';
import { RecipeSpecSchema, resolveTypeEnumsForType } from '@superapp/core';
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

/**
 * Make a JSON-Schema node accept `null` in addition to its declared type, so an
 * OpenAI-strict-`required` property can still be omitted-in-spirit by returning
 * `null`. Idempotent; leaves nodes without a concrete `type` (e.g. `anyOf`/
 * `enum`-only) untouched — for those the caller relies on the value being
 * genuinely optional in Zod, which the union already tolerates.
 */
function makeNullable(node: unknown): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const obj = node as Record<string, unknown>;
  const t = obj.type;
  if (typeof t === 'string') {
    if (t === 'null') return obj;
    return { ...obj, type: [t, 'null'] };
  }
  if (Array.isArray(t)) {
    return t.includes('null') ? obj : { ...obj, type: [...t, 'null'] };
  }
  return obj;
}

function normalizeForStructuredOutput(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      normalizeForStructuredOutput(entry, [...path, String(index)]),
    );
  }
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) {
    normalized[key] = normalizeForStructuredOutput(entry, [...path, key]);
  }
  if (typeof normalized.format === 'string') {
    // Provider structured-output validators reject several JSON Schema formats (e.g. uri).
    delete normalized.format;
  }
  if (
    normalized.type === 'object' &&
    normalized.properties &&
    typeof normalized.properties === 'object' &&
    !Array.isArray(normalized.properties)
  ) {
    const props = normalized.properties as Record<string, unknown>;
    const propertyKeys = Object.keys(props);
    // The keys that were genuinely required in the source (zod-to-json-schema
    // only lists non-optional, non-defaulted keys here). Everything else is a
    // Zod `.optional()` — including the pinned packs (audience/schedule/layout/
    // pricing/recommendation/ruleEngine).
    const sourceRequired = Array.isArray(normalized.required)
      ? normalized.required.filter((v): v is string => typeof v === 'string')
      : [];
    // OpenAI strict structured-output requires `required` to list EVERY property
    // key — a truly-optional property is expressed by making it nullable, not by
    // omitting it from `required`. Force-marking an optional pack `required`
    // WITHOUT making it nullable pushes the model to emit it even when
    // irrelevant (e.g. a plain popup forced to invent a `pricing` block). So:
    // keep all keys in `required`, but make the originally-optional ones
    // nullable so the model can return `null` to opt out. (X-2 / top-risk #2.)
    //
    // A DEFAULTED field (`default` present) is deliberately left non-nullable:
    // Zod's `.default()` only coerces `undefined`/absent, NOT an explicit `null`,
    // so `null` would fail validation. Those keep the pre-fix behaviour (the
    // model must emit a real value; the default just backstops omission).
    for (const key of propertyKeys) {
      const node = props[key];
      const hasDefault = !!node && typeof node === 'object' && !Array.isArray(node)
        && 'default' in (node as Record<string, unknown>);
      if (!sourceRequired.includes(key) && !hasDefault) {
        props[key] = makeNullable(node);
      }
    }
    normalized.required = [...propertyKeys];
  }
  if (normalized.type === 'array' && normalized.items == null) {
    // OpenAI structured outputs reject array schemas without explicit items.
    normalized.items = path[path.length - 1] === 'requires'
      ? { type: 'string' }
      : { type: 'object', additionalProperties: true };
  }
  return normalized;
}

/**
 * R2.5 — overlay per-type enum constraints onto an already-normalized recipe
 * JSON Schema. For each per-type enum the module type resolves (via the flat-pin
 * catalog in `@superapp/core`), tighten
 * `config.properties.<packNamespace>.properties.<field>` to `{ enum: [...] }`.
 *
 * Scoped + defensive: only touches the exact `config.<ns>.<field>` node when it
 * already exists (the pack must be pinned onto the branch); leaves every other
 * key untouched and preserves nullability added by `normalizeForStructuredOutput`
 * (the pinned pack is optional). Types with no per-type enums are a no-op, so
 * their emitted schema is byte-identical to pre-R2.5.
 */
function overlayTypeEnums(recipeRoot: JsonSchemaObject, moduleType: ModuleType): void {
  const resolved = resolveTypeEnumsForType(moduleType);
  if (resolved.length === 0) return;
  const config = (recipeRoot.properties as Record<string, unknown> | undefined)?.config as
    | JsonSchemaObject
    | undefined;
  const configProps = config?.properties as Record<string, JsonSchemaObject> | undefined;
  if (!configProps) return;
  for (const r of resolved) {
    const packNode = configProps[r.packNamespace];
    const fieldNode = (packNode?.properties as Record<string, JsonSchemaObject> | undefined)?.[r.field];
    if (!fieldNode) continue;
    const values = r.options.map((o) => o.value);
    fieldNode.enum = values;
    // Keep the node a (nullable) string; drop min/max-length noise now that the
    // set is closed. `type` may be 'string' or ['string','null'] post-normalize.
    if (fieldNode.type === undefined) fieldNode.type = 'string';
    delete fieldNode.minLength;
    delete fieldNode.maxLength;
  }
}

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
    const recipeRoot = normalizeForStructuredOutput(
      stripDefinitionsWrapper(recipeSchema),
    ) as JsonSchemaObject;
    // R2.5 — tighten per-type enum fields to the type's option-set. The recipe
    // union keeps a loose `z.string()` for these (cross-type coexistence); the
    // model is constrained to the resolved enum here, on the live generation
    // path, independent of any flag. No-op for types with no per-type enums.
    overlayTypeEnums(recipeRoot, moduleType);

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
              recipe: recipeRoot,
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
        recipe: recipeRoot,
      },
    };

    REGISTRY.set(moduleType, {
      recipe: recipeRoot,
      options: normalizeForStructuredOutput(optionsSchema) as JsonSchemaObject,
      single: normalizeForStructuredOutput(singleSchema) as JsonSchemaObject,
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
