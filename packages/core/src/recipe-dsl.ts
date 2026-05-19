import { z } from 'zod';
import {
  MODULE_TYPE_DEFAULT_REQUIRES,
  MODULE_TYPE_TO_CATEGORY,
  RECIPE_SPEC_TYPES,
  type ModuleType,
} from './allowed-values.js';
import { RecipeSpecSchema, type RecipeSpec } from './recipe.js';
import { IntentGraphSchema, type IntentGraph } from './intent-graph.js';
import { findCatalogEntry, findTypeEntry } from './catalog.js';
import { findTemplate } from './templates.js';

export const RecipeDslVersionSchema = z.literal('1.0');

const DslIdPattern = /^dsl_[a-zA-Z0-9_-]{6,80}$/;
const StepIdPattern = /^[a-zA-Z0-9_-]{3,64}$/;

const UnsafeTextPattern = /<\s*\/?\s*(script|iframe|object|embed|link|meta)\b|javascript\s*:|on[a-z]+\s*=|{%\s*|{{\s*|eval\s*\(|new\s+Function\s*\(|import\s*\(/i;
const UnsafeKeyPattern = /(^|\.)(code|liquid|javascript|script|html|rawCode|rawLiquid|wasm|eval)(\.|$)/i;

const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>;

type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema).max(100),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const DslSetConfigStepSchema = z.object({
  id: z.string().regex(StepIdPattern),
  op: z.literal('set_config'),
  path: z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/),
  value: JsonValueSchema,
}).strict();

const DslSetPlacementStepSchema = z.object({
  id: z.string().regex(StepIdPattern),
  op: z.literal('set_placement'),
  enabled_on: z.object({
    templates: z.array(z.string()).max(20).optional(),
    groups: z.array(z.string()).max(20).optional(),
  }).strict().optional(),
  disabled_on: z.object({
    templates: z.array(z.string()).max(20).optional(),
    groups: z.array(z.string()).max(20).optional(),
  }).strict().optional(),
}).strict();

const DslSetStyleStepSchema = z.object({
  id: z.string().regex(StepIdPattern),
  op: z.literal('set_style'),
  path: z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/),
  value: JsonValueSchema,
}).strict();

const DslUseTemplateStepSchema = z.object({
  id: z.string().regex(StepIdPattern),
  op: z.literal('use_template'),
  templateId: z.string().min(1).max(80),
}).strict();

export const RecipeDslStepSchema = z.discriminatedUnion('op', [
  DslSetConfigStepSchema,
  DslSetPlacementStepSchema,
  DslSetStyleStepSchema,
  DslUseTemplateStepSchema,
]);

export type RecipeDslStep = z.infer<typeof RecipeDslStepSchema>;

export const RecipeDslSchema = z.object({
  schema_version: RecipeDslVersionSchema.default('1.0'),
  id: z.string().regex(DslIdPattern),
  intentGraph: IntentGraphSchema.optional(),
  catalogId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  recipe: z.object({
    type: z.enum(RECIPE_SPEC_TYPES),
    name: z.string().min(1).max(80),
    requires: z.array(z.string()).max(30).optional(),
    config: z.record(z.string(), JsonValueSchema).default({}),
    placement: z.record(z.string(), JsonValueSchema).optional(),
    style: z.record(z.string(), JsonValueSchema).optional(),
  }).strict(),
  steps: z.array(RecipeDslStepSchema).max(50).default([]),
  safety: z.object({
    allowRawCode: z.literal(false).default(false),
    deploysMerchantCode: z.literal(false).default(false),
    requiresMerchantApproval: z.literal(true).default(true),
  }).strict().default({
    allowRawCode: false,
    deploysMerchantCode: false,
    requiresMerchantApproval: true,
  }),
}).strict().superRefine((dsl, ctx) => {
  if (dsl.catalogId) {
    const entry = findCatalogEntry(dsl.catalogId);
    if (!entry) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown catalogId "${dsl.catalogId}"`, path: ['catalogId'] });
    } else if (entry.moduleType && entry.moduleType !== dsl.recipe.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `catalogId "${dsl.catalogId}" is for ${entry.moduleType}, not ${dsl.recipe.type}`,
        path: ['catalogId'],
      });
    }
  }

  if (dsl.templateId) {
    const template = findTemplate(dsl.templateId);
    if (!template) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown templateId "${dsl.templateId}"`, path: ['templateId'] });
    } else if (template.spec.type !== dsl.recipe.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `templateId "${dsl.templateId}" is for ${template.spec.type}, not ${dsl.recipe.type}`,
        path: ['templateId'],
      });
    }
  }

  const typeEntry = findTypeEntry(dsl.recipe.type);
  if (!typeEntry) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing catalog type entry for ${dsl.recipe.type}`, path: ['recipe', 'type'] });
  }

  for (const step of dsl.steps) {
    if (step.op === 'set_placement' && step.enabled_on && step.disabled_on) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use only one of enabled_on or disabled_on.', path: ['steps'] });
    }

    if (step.op === 'use_template') {
      const template = findTemplate(step.templateId);
      if (!template) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown templateId "${step.templateId}"`, path: ['steps'] });
      } else if (template.spec.type !== dsl.recipe.type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `template step "${step.templateId}" is for ${template.spec.type}, not ${dsl.recipe.type}`,
          path: ['steps'],
        });
      }
    }
  }

  const unsafePaths = collectUnsafeDslPaths(dsl);
  for (const path of unsafePaths) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsafe DSL content is not allowed at ${path}`,
      path: path.split('.'),
    });
  }
});

export type RecipeDsl = z.infer<typeof RecipeDslSchema>;

export type RecipeDslCompileResult = {
  dsl: RecipeDsl;
  recipe: RecipeSpec;
  boundaries: {
    catalogId?: string;
    templateId?: string;
    intentGraphId?: string;
    recipeType: ModuleType;
    validatedRecipeSpec: true;
    deploysMerchantCode: false;
  };
};

function collectUnsafeDslPaths(value: unknown, path = 'dsl'): string[] {
  const out: string[] = [];

  if (typeof value === 'string') {
    if (UnsafeTextPattern.test(value)) out.push(path);
    return out;
  }

  if (!value || typeof value !== 'object') return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...collectUnsafeDslPaths(item, `${path}.${index}`)));
    return out;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = `${path}.${key}`;
    if (UnsafeKeyPattern.test(nextPath)) out.push(nextPath);
    out.push(...collectUnsafeDslPaths(child, nextPath));
  }

  return out;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const existing = cursor[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function mergeRequires(moduleType: ModuleType, extraRequires: string[] | undefined): string[] {
  return Array.from(new Set([...(MODULE_TYPE_DEFAULT_REQUIRES[moduleType] ?? []), ...(extraRequires ?? [])]));
}

function baseRecipeFromDsl(dsl: RecipeDsl): Record<string, unknown> {
  let base: Record<string, unknown> = {};

  const templateId = dsl.templateId ?? dsl.steps.find((step) => step.op === 'use_template')?.templateId;
  if (templateId) {
    const template = findTemplate(templateId);
    if (template) {
      base = JSON.parse(JSON.stringify(template.spec)) as Record<string, unknown>;
    }
  }

  return {
    ...base,
    type: dsl.recipe.type,
    name: dsl.recipe.name,
    category: MODULE_TYPE_TO_CATEGORY[dsl.recipe.type],
    requires: mergeRequires(dsl.recipe.type, dsl.recipe.requires),
    config: {
      ...((base.config as Record<string, unknown> | undefined) ?? {}),
      ...dsl.recipe.config,
    },
    ...(dsl.recipe.placement ? { placement: dsl.recipe.placement } : {}),
    ...(dsl.recipe.style ? { style: dsl.recipe.style } : {}),
  };
}

export function compileRecipeDsl(input: unknown): RecipeDslCompileResult {
  const dsl = RecipeDslSchema.parse(input);
  const candidate = baseRecipeFromDsl(dsl);

  for (const step of dsl.steps) {
    if (step.op === 'set_config') {
      const config = (candidate.config ?? {}) as Record<string, unknown>;
      setAtPath(config, step.path, step.value);
      candidate.config = config;
    }
    if (step.op === 'set_placement') {
      candidate.placement = {
        ...(step.enabled_on ? { enabled_on: step.enabled_on } : {}),
        ...(step.disabled_on ? { disabled_on: step.disabled_on } : {}),
      };
    }
    if (step.op === 'set_style') {
      const style = (candidate.style ?? {}) as Record<string, unknown>;
      setAtPath(style, step.path, step.value);
      candidate.style = style;
    }
  }

  const recipe = RecipeSpecSchema.parse(candidate);
  return {
    dsl,
    recipe,
    boundaries: {
      ...(dsl.catalogId ? { catalogId: dsl.catalogId } : {}),
      ...(dsl.templateId ? { templateId: dsl.templateId } : {}),
      ...(dsl.intentGraph ? { intentGraphId: dsl.intentGraph.id } : {}),
      recipeType: recipe.type,
      validatedRecipeSpec: true,
      deploysMerchantCode: false,
    },
  };
}

export function buildRecipeDslFromIntentGraph(
  graphInput: IntentGraph,
  recipe: RecipeDsl['recipe'],
  options: { id?: string; catalogId?: string; templateId?: string; steps?: RecipeDslStep[] } = {},
): RecipeDsl {
  const graph = IntentGraphSchema.parse(graphInput);
  const candidate = graph.nodes.find((node) => node.kind === 'recipe_candidate');
  const moduleType = candidate?.kind === 'recipe_candidate' ? candidate.moduleType : recipe.type;
  const id = options.id ?? `dsl_${graph.id.replace(/^ig_/, '').slice(0, 76)}`;

  return RecipeDslSchema.parse({
    id,
    intentGraph: graph,
    catalogId: options.catalogId ?? (candidate?.kind === 'recipe_candidate' ? candidate.catalogId : undefined),
    templateId: options.templateId,
    recipe: {
      ...recipe,
      type: moduleType,
    },
    steps: options.steps ?? [],
  });
}
