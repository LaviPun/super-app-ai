/**
 * Tier-1 "instantiate + delta-edit" generation (plan Phase 2a).
 *
 * When solution-search returns a `tier: 1` exemplar (a very strong, same-type
 * template match), the cheapest path to a high-quality recipe is NOT to generate
 * one from scratch — it's to hand the model the template spec and ask for the
 * minimal edit that adapts it to the merchant's request. The model returns a
 * JSON Merge Patch (RFC 7386); we apply it to the template spec, pin `type` back
 * to the template's type, and run the SAME validation/repair pipeline as freeform
 * output so the result is indistinguishable downstream.
 *
 * This module is pure + deterministic except for `generateRecipeViaDelta`, which
 * makes exactly one LLM call (repairs reuse llm.server's shared repair loop).
 */
import type { ModuleType, RecipeSpec } from '@superapp/core';
import { RecipeSpecSchema, validateTypeEnums } from '@superapp/core';
import { wrapUserRequestForPrompt } from '~/services/ai/injection-scan.server';
import {
  repairRecipeForValidation,
  validateAndRepairRecipe,
  type GenerateResult,
  type LlmClient,
  type RecipeOption,
} from '~/services/ai/llm.server';

/**
 * Apply an RFC 7386 JSON Merge Patch to `target`, returning a new value (does not
 * mutate `target`).
 *
 * Semantics:
 *  - patch is a non-array object → recursively merge into target (target coerced
 *    to `{}` when it is not itself a plain object);
 *  - a member whose patch value is `null` → DELETE that key from the result;
 *  - patch is `null`, an array, or a primitive → REPLACE target wholesale.
 */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    // Scalars, arrays and null replace the target outright.
    return patch;
  }
  const base: Record<string, unknown> =
    target && typeof target === 'object' && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) {
      delete base[key];
    } else {
      base[key] = applyMergePatch(base[key], value);
    }
  }
  return base;
}

/** True for a plain (non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Strip a leading/trailing markdown code fence (```json … ```), mirroring how the
 * freeform path tolerates fenced model output before `JSON.parse`.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/**
 * Extract the merge patch from a parsed model response. Tolerates the model
 * wrapping it as `{ patch: … }` or `{ recipe: … }`, else treats the whole object
 * as the patch itself.
 */
function extractPatch(parsed: unknown): unknown {
  if (isPlainObject(parsed)) {
    if ('patch' in parsed) return parsed.patch;
    if ('recipe' in parsed) return parsed.recipe;
  }
  return parsed;
}

export interface CompileDeltaPromptParams {
  /** Minified JSON of the template's RecipeSpec — the starting point. */
  templateSpecJson: string;
  /** The template's module type; the patch must not change it. */
  moduleType: string;
  /** Raw merchant request (wrapped for injection safety before embedding). */
  userRequest: string;
  /** Optional approach hint (Tier-1 uses the "Conservative" slot). */
  approachHint?: string;
  /** Optional design directives, reused verbatim from the freeform prompt. */
  designReferenceBlock?: string;
  designSystemDirective?: string;
  /** Prior validation error, appended so a repair pass can correct it. */
  previousError?: string;
}

/**
 * Compile the delta-edit prompt: the template spec is the starting point and the
 * model must output ONLY a JSON Merge Patch that adapts it to the request.
 */
export function compileDeltaPrompt(params: CompileDeltaPromptParams): string {
  const parts: string[] = [];
  if (params.designReferenceBlock) parts.push(params.designReferenceBlock, '');
  if (params.designSystemDirective) parts.push(params.designSystemDirective, '');

  parts.push(
    'You are adapting a hand-authored, production-quality module template to a specific merchant request by emitting a JSON Merge Patch (RFC 7386).',
    '',
    `Starting template — a complete, valid RecipeSpec of type "${params.moduleType}". This is your starting point; keep everything that already fits:`,
    params.templateSpecJson,
    '',
    wrapUserRequestForPrompt(params.userRequest),
  );
  if (params.approachHint) parts.push('', params.approachHint);

  parts.push(
    '',
    'Output ONLY a JSON Merge Patch (RFC 7386) that transforms the template above into the module the merchant asked for:',
    '- Objects merge recursively; a key set to null DELETES that key; arrays and primitives REPLACE the template value wholesale.',
    '- Adapt ALL copy, headings, labels, CTAs, branding and content to the merchant request — do not leave the template\'s original brand text in place.',
    '- Preserve structural completeness: keep every block/field the template needs to render richly. Only null-out something you deliberately want removed.',
    `- The "type" field MUST NOT change — it stays "${params.moduleType}". Do not include a different "type" in your patch.`,
    '- Emit only the keys you are changing, not an untouched copy of the whole template.',
    '',
    'Respond with a JSON object exactly of the form { "explanation": "1 sentence on how you adapted it", "patch": { ...merge patch... } } and nothing else.',
  );
  if (params.previousError) {
    parts.push('', '(Previous validation error — fix in next response):', params.previousError);
  }
  return parts.join('\n');
}

export interface GenerateRecipeViaDeltaParams {
  client: LlmClient;
  /** Minified JSON of the Tier-1 template spec (from TemplateExemplar.specJson). */
  templateSpecJson: string;
  moduleType: ModuleType;
  userRequest: string;
  approachHint?: string;
  designReferenceBlock?: string;
  designSystemDirective?: string;
  /** Reduced token budget for the patch call (getDeltaTokenBudget). */
  maxTokens: number;
  shopId?: string;
}

export interface DeltaGenerationResult {
  recipe: RecipeSpec;
  /** The initial LLM call result, for cost/usage attribution by the caller. */
  result: GenerateResult;
  /** Model-supplied one-liner, if any (falls back to the caller's default). */
  explanation?: string;
  /** Always 'delta' — lets callers stamp option metadata uniformly. */
  generationMode: Extract<NonNullable<RecipeOption['generationMode']>, 'delta'>;
}

/**
 * Generate one recipe via the Tier-1 delta path: one LLM call for a merge patch,
 * applied to the template spec, `type` pinned back, then the SAME
 * repair → Zod → per-type-enum → bounded-repair pipeline as freeform output.
 *
 * Throws on any unrecoverable failure (bad JSON, non-object patch result, or a
 * recipe that cannot be repaired to validity) so the caller can fall back to
 * freeform generation for that option — never silently degrades.
 */
export async function generateRecipeViaDelta(
  params: GenerateRecipeViaDeltaParams,
): Promise<DeltaGenerationResult> {
  const template = JSON.parse(params.templateSpecJson) as unknown;
  if (!isPlainObject(template)) {
    throw new Error('Tier-1 template spec did not parse to an object');
  }

  const prompt = compileDeltaPrompt({
    templateSpecJson: params.templateSpecJson,
    moduleType: params.moduleType,
    userRequest: params.userRequest,
    approachHint: params.approachHint,
    designReferenceBlock: params.designReferenceBlock,
    designSystemDirective: params.designSystemDirective,
  });

  // No structured responseSchema: the model emits { explanation, patch }, NOT the
  // recipe-shaped schema the freeform path uses.
  const result = await params.client.generateRecipe(prompt, { maxTokens: params.maxTokens });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(result.rawJson));
  } catch (err) {
    throw new Error(`Tier-1 delta output was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const patch = extractPatch(parsed);
  const patchedRaw = applyMergePatch(template, patch);
  if (!isPlainObject(patchedRaw)) {
    throw new Error('Tier-1 merge patch did not yield an object recipe');
  }
  // Pin the discriminator back to the template's type — the patch must never
  // change it, and forcing it here makes that non-negotiable regardless of output.
  const patched: Record<string, unknown> = { ...patchedRaw, type: params.moduleType };

  const repaired = repairRecipeForValidation(patched);
  const safe = RecipeSpecSchema.safeParse(repaired);
  let recipe: RecipeSpec;
  if (safe.success && validateTypeEnums(safe.data).length === 0) {
    recipe = safe.data;
  } else {
    // Reuse the shared bounded (≤2) repair loop — identical to the freeform path.
    const fix = await validateAndRepairRecipe(patched, params.client, {
      shopId: params.shopId,
      moduleType: params.moduleType,
    });
    recipe = fix.recipe;
  }

  const explanation = isPlainObject(parsed) && typeof parsed.explanation === 'string'
    ? parsed.explanation
    : undefined;

  return { recipe, result, explanation, generationMode: 'delta' };
}
