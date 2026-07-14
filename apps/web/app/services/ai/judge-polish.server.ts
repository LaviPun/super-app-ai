/**
 * Async LLM-judge polish (plan Phase 5c).
 *
 * AFTER the create-module stream has emitted every option + the deterministic
 * `ranking` + `done`, the route spends a bounded background window scoring each
 * option with ONE cheap-model judge call and — when the judge proposes a safe,
 * validated copy/style patch that does not structurally regress — pushing an
 * improved recipe. This is PURELY additive: it never delays or degrades the core
 * response (the stream has already delivered everything a client needs), and every
 * failure mode here is silent.
 *
 * This module holds the pure, testable core. It:
 *   1. builds a judge prompt over {userRequest, recipe JSON, rendered-HTML text}
 *      (adapted from the tournament `buildJudgePrompt` rubric — same judge, no
 *      second judge infrastructure);
 *   2. makes exactly ONE `client.generateRecipe` call, capped at ~1000 tokens,
 *      raced against `timeoutMs`;
 *   3. leniently parses `{ score 0-100, dimensions, suggestedPatch? }`;
 *   4. sanitises + applies `suggestedPatch` as an RFC-7386 merge patch
 *      (`applyMergePatch`, reused from template-delta), pinning structural/
 *      capability keys so a patch can only touch copy/label/text/style;
 *   5. runs the SAME validation as freeform output
 *      (`repairRecipeForValidation` → `RecipeSpecSchema` → `validateTypeEnums`) —
 *      an INVALID patch is DROPPED silently while the score is still returned.
 *
 * The judge model is whatever `getLlmClient` hands the caller — the cost-ranked
 * chain already prefers the cheapest provider; nothing is hardcoded here.
 *
 * Usage attribution + emit decisions (`option_updated` only when the patched
 * recipe is NOT WORSE by the deterministic ranker) live in the caller (the
 * stream route), which owns the `AiUsageService` and the SSE channel. This module
 * does no DB I/O so it stays trivially unit-testable with a mock client.
 */
import type { ModuleType, RecipeSpec } from '@superapp/core';
import { RecipeSpecSchema, validateTypeEnums } from '@superapp/core';
import { z } from 'zod';
import { parseHTML } from 'linkedom';
import { PreviewService } from '~/services/preview/preview.service';
import { wrapUserRequestForPrompt } from '~/services/ai/injection-scan.server';
import { applyMergePatch } from '~/services/ai/template-delta.server';
import { rankOptions, type OptionQaSummary, type RankableOption } from '~/services/ai/option-ranking.server';
import { repairRecipeForValidation, type GenerateResult, type LlmClient } from '~/services/ai/llm.server';

/** Storefront types PreviewService can render to auditable buyer-facing HTML. */
const RENDERABLE_TYPES = new Set<string>(['theme.section', 'proxy.widget']);

/** Max chars of rendered-HTML text handed to the judge (keeps the prompt cheap). */
const RENDERED_TEXT_CAP = 1500;

/** Token ceiling for the single judge call — this is a cheap scoring pass. */
export const JUDGE_POLISH_MAX_TOKENS = 1000;

/**
 * Top-level RecipeSpec keys a polish patch may set. `type`/`category`/`requires`
 * are the discriminator + capability surface — a copy/style polish must never
 * touch them, so we strip them from the patch before applying (defence in depth
 * on top of the full re-validation below).
 */
const PATCH_ALLOWED_TOP_KEYS = new Set(['name', 'config']);

/**
 * Env flag — OFF by default. When unset/false the route skips the whole polish
 * phase, so this rollout is safe: the core streamed response is byte-for-byte
 * unchanged. Flip on with `JUDGE_POLISH_ENABLED=1|true|yes|on`.
 */
export function isJudgePolishEnabled(): boolean {
  const raw = process.env.JUDGE_POLISH_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Lenient response schema — a flaky judge must never break the stream. */
const DimensionsSchema = z
  .object({
    relevance: z.number().min(0).max(100),
    completeness: z.number().min(0).max(100),
    copyQuality: z.number().min(0).max(100),
    design: z.number().min(0).max(100),
  })
  .partial();

const JudgePolishResponseSchema = z.object({
  score: z.number().min(0).max(100),
  dimensions: DimensionsSchema.optional(),
  // A JSON Merge Patch (RFC 7386) limited to copy/label/text/style fields.
  suggestedPatch: z.record(z.unknown()).nullish(),
});

/** JSON-Schema mirror for providers that support structured output (best-effort). */
export const JUDGE_POLISH_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['score'],
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100, description: '0 unusable … 100 excellent, overall' },
    dimensions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        relevance: { type: 'number', minimum: 0, maximum: 100 },
        completeness: { type: 'number', minimum: 0, maximum: 100 },
        copyQuality: { type: 'number', minimum: 0, maximum: 100 },
        design: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    suggestedPatch: {
      type: 'object',
      description:
        'Optional RFC-7386 JSON Merge Patch that improves ONLY copy/label/text/style fields. Omit if nothing to improve.',
    },
  },
};

export interface JudgeAndPolishParams {
  /** The LLM client (cost-ranked chain from getLlmClient) — cheap model preferred. */
  client: LlmClient;
  /** The merchant's raw request (wrapped for injection safety before embedding). */
  userRequest: string;
  /** Hard wall-clock cap for this one option's judge call, in ms. */
  timeoutMs: number;
}

export interface JudgePolishResult {
  /** Overall judge score 0-100. Absent only when the model output did not parse. */
  score?: number;
  /** Per-dimension 0-100 scores, when the judge supplied them. */
  dimensions?: Record<string, number>;
  /** The sanitised patch that was applied (present only when it validated). */
  patch?: Record<string, unknown>;
  /** The validated, polished recipe (present only when the patch validated). */
  patchedRecipe?: RecipeSpec;
  /**
   * The raw judge LLM-call result, surfaced so the caller can attribute
   * (non-billable) cost/usage. Present whenever the call completed — even when the
   * response failed to parse. Absent only on timeout (no call result to bill).
   */
  raw?: GenerateResult;
}

/** True for a plain (non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Strip a leading/trailing markdown code fence, mirroring the freeform parser. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/**
 * Rendered-HTML text extraction for storefront types: render deterministically
 * through PreviewService, strip tags via a real DOM, collapse whitespace, cap.
 * Returns '' for non-renderable types or on ANY render/parse failure — this is a
 * best-effort prompt enrichment, never a hard dependency.
 */
export function extractRenderedText(recipe: RecipeSpec): string {
  try {
    if (!RENDERABLE_TYPES.has(recipe.type)) return '';
    const rendered = new PreviewService().render(recipe);
    if (rendered.kind !== 'HTML' || typeof rendered.html !== 'string' || rendered.html.length === 0) return '';
    const { document } = parseHTML(rendered.html);
    const text = (document.body?.textContent ?? document.documentElement?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, RENDERED_TEXT_CAP);
  } catch {
    return '';
  }
}

/**
 * Compile the judge-polish prompt. Adapted from the tournament judge rubric
 * (`buildJudgePrompt`): scores one candidate against the user request, but on a
 * 0-100 scale with named dimensions and an OPTIONAL copy/style merge patch.
 */
export function compileJudgePolishPrompt(params: {
  userRequest: string;
  recipe: RecipeSpec;
  renderedText?: string;
}): string {
  const parts: string[] = [
    'You are the head judge scoring one generated Shopify storefront module against the merchant request, then optionally proposing a SMALL copy/style improvement.',
    '',
    wrapUserRequestForPrompt(params.userRequest),
    '',
    'Module RecipeSpec JSON:',
    '```json',
    JSON.stringify(params.recipe, null, 2),
    '```',
  ];
  if (params.renderedText && params.renderedText.length > 0) {
    parts.push('', 'Rendered storefront copy (visible text only):', '"""', params.renderedText, '"""');
  }
  parts.push(
    '',
    'Score the module 0-100 overall, weighting relevance and completeness most heavily. Also rate these dimensions 0-100: relevance (fit to the request), completeness (nothing important missing), copyQuality (headline/body/CTA wording), design (visual/structural quality).',
    '',
    'If — and only if — you can improve the wording, labels, visible text or style tokens WITHOUT changing the module\'s structure, type, or capabilities, include a JSON Merge Patch (RFC 7386) as "suggestedPatch":',
    '- Touch ONLY copy/label/text/style fields (e.g. config.fields headings/body/CTA text, config.blocks text, style/color tokens).',
    '- Do NOT change "type", "category" or "requires"; do NOT add or remove blocks or restructure config.',
    '- Emit only the keys you are changing. Omit "suggestedPatch" entirely if there is nothing worth improving.',
    '',
    'Respond with ONLY a JSON object of the form { "score": <0-100>, "dimensions": { "relevance": n, "completeness": n, "copyQuality": n, "design": n }, "suggestedPatch": { ... } } and nothing else.',
  );
  return parts.join('\n');
}

/**
 * Remove disallowed top-level keys from a candidate merge patch, so a polish can
 * only touch `name`/`config` (copy/label/text/style). Returns `null` when nothing
 * usable remains. Pure.
 */
export function sanitizePolishPatch(patch: unknown): Record<string, unknown> | null {
  if (!isPlainObject(patch)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (PATCH_ALLOWED_TOP_KEYS.has(key)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Apply a sanitised polish patch to `recipe` and re-validate. Pins `type` back
 * (the patch can never change it) and runs the SAME repair→Zod→enum pipeline as
 * freeform output. Returns the validated recipe, or `null` when the patched
 * recipe does not validate (the patch is DROPPED silently). Pure, no LLM repair.
 */
export function applyAndValidatePolish(
  recipe: RecipeSpec,
  sanitizedPatch: Record<string, unknown>,
): RecipeSpec | null {
  const mergedRaw = applyMergePatch(recipe, sanitizedPatch);
  if (!isPlainObject(mergedRaw)) return null;
  // Pin the discriminator back — a copy/style polish must never change the type.
  const pinned: Record<string, unknown> = { ...mergedRaw, type: (recipe as { type: ModuleType }).type };
  const repaired = repairRecipeForValidation(pinned);
  const safe = RecipeSpecSchema.safeParse(repaired);
  if (!safe.success) return null;
  if (validateTypeEnums(safe.data).length > 0) return null;
  return safe.data;
}

/**
 * Guard for pushing a polished recipe: re-run the DETERMINISTIC option ranker on
 * the patched recipe and require it to be NO WORSE than the original. Never push a
 * polish that regresses the structural rank score.
 *
 * `generationMode`/`qaSummary` are held constant (the polish reuses the original
 * option's metadata), so this isolates the change to `verifyPenalty(recipe)`.
 * Copy/style polish is score-NEUTRAL under the ranker (it can't see wording), so
 * the guard is "not worse" (`>=`) — a strict `>` would suppress every copy-only
 * improvement, which is the whole point of the judge. Returns true when the patch
 * is safe to push.
 */
export function polishIsNotWorse(
  originalRecipe: RecipeSpec,
  patchedRecipe: RecipeSpec,
  meta?: { generationMode?: RankableOption['generationMode']; qaSummary?: OptionQaSummary },
): boolean {
  const base = { generationMode: meta?.generationMode, qaSummary: meta?.qaSummary };
  const orig = rankOptions([{ recipe: originalRecipe, ...base }]).scores[0]?.score ?? 0;
  const next = rankOptions([{ recipe: patchedRecipe, ...base }]).scores[0]?.score ?? 0;
  return next >= orig;
}

/**
 * Judge one option and, when safe, produce a polished recipe. Makes exactly one
 * LLM call, raced against `timeoutMs`.
 *
 * Returns `null` on timeout (no usable output, nothing to bill). Otherwise a
 * `JudgePolishResult`:
 *   - `raw` is always present (for cost attribution);
 *   - `score`/`dimensions` present when the response parsed;
 *   - `patch`/`patchedRecipe` present ONLY when the judge proposed a patch that
 *     sanitised, applied and fully validated. An invalid/absent patch is dropped
 *     silently; the score is still returned.
 *
 * Never throws — a judge/parse/render failure yields the best partial result.
 */
export async function judgeAndPolishOption(
  recipe: RecipeSpec,
  params: JudgeAndPolishParams,
): Promise<JudgePolishResult | null> {
  const renderedText = extractRenderedText(recipe);
  const prompt = compileJudgePolishPrompt({ userRequest: params.userRequest, recipe, renderedText });

  const call = (async (): Promise<JudgePolishResult | null> => {
    let result: GenerateResult;
    try {
      result = await params.client.generateRecipe(prompt, {
        maxTokens: JUDGE_POLISH_MAX_TOKENS,
        responseSchema: { name: 'JudgePolish', schema: JUDGE_POLISH_JSON_SCHEMA },
      });
    } catch {
      // The call itself failed — nothing to score or bill.
      return null;
    }

    const out: JudgePolishResult = { raw: result };
    let parsed: z.infer<typeof JudgePolishResponseSchema>;
    try {
      parsed = JudgePolishResponseSchema.parse(JSON.parse(stripCodeFences(result.rawJson)));
    } catch {
      // Unparseable judge output: return `raw` so the caller can still attribute
      // usage, but no score/patch.
      return out;
    }

    out.score = parsed.score;
    if (parsed.dimensions) out.dimensions = parsed.dimensions as Record<string, number>;

    const sanitized = sanitizePolishPatch(parsed.suggestedPatch ?? undefined);
    if (sanitized) {
      const patchedRecipe = applyAndValidatePolish(recipe, sanitized);
      if (patchedRecipe) {
        out.patch = sanitized;
        out.patchedRecipe = patchedRecipe;
      }
      // An invalid patch is dropped silently — `out.score` is still returned.
    }
    return out;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, params.timeoutMs));
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
