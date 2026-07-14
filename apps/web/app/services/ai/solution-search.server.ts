/**
 * Search-augmented generation (RAG) for WS1 / specs/022-requirement-search-generation.
 *
 * Given a RequirementSpec, find the top-k existing templates/catalog modules that
 * best match it, extract their capability surface (which config fields / packs
 * they expose), and return:
 *  - `grounding`     — compact examples injected into the create prompt.
 *  - `startFrom`     — selectable "start from this" options surfaced to the client.
 *
 * Deterministic ranking (token/tag overlap + type match) — no extra LLM hop, so
 * the create-module call budget is unchanged.
 */
import { MODULE_TEMPLATES, type TemplateEntry } from '@superapp/core';
import type { RequirementSpec } from '@superapp/platform-contracts';

export interface StartFromOption {
  templateId: string;
  name: string;
  description: string;
  moduleType: string;
  tags: string[];
  /** Top-level config keys the template exposes (its capability surface). */
  capabilitySurface: string[];
  score: number;
}

/**
 * Few-shot exemplar: the full spec of the single best-matching template, minified
 * for injection into the create prompt. Present only for a match that clears
 * EXEMPLAR_MIN_SCORE and fits the token budget (EXEMPLAR_MAX_CHARS).
 *
 * Tiering (both carry `specJson`, so the delta layer can `JSON.parse` it):
 *  - `tier: 2` — a strong match (score ≥ EXEMPLAR_MIN_SCORE): injected as a
 *    "match this quality" reference block, generation stays fully freeform.
 *  - `tier: 1` — a very strong, same-type match (score ≥ EXEMPLAR_TIER1_MIN_SCORE
 *    AND `template.type === requirement.moduleType`): the template is close enough
 *    to *instantiate-and-delta-edit*, so option 0 can be produced as a JSON merge
 *    patch over this spec (see template-delta.server.ts) instead of from scratch.
 */
export interface TemplateExemplar {
  templateId: string;
  tier: 1 | 2;
  /** Minified, empty-stripped JSON of the template's RecipeSpec. */
  specJson: string;
}

export interface SolutionSearchResult {
  /** Best matches, highest score first. */
  startFrom: StartFromOption[];
  /** Compact grounding block for the prompt (empty when no matches). */
  grounding: string;
  /** Full-spec few-shot exemplar for a strong top match (omitted otherwise). */
  exemplar?: TemplateExemplar;
}

/** Raw match score the top template must reach to qualify as a (Tier-2) few-shot exemplar. */
const EXEMPLAR_MIN_SCORE = 3;
/**
 * Raw match score at/above which a *same-type* top match is close enough to
 * instantiate-and-delta-edit (Tier-1) rather than seed a fully-freeform generation.
 */
const EXEMPLAR_TIER1_MIN_SCORE = 6;
/** JSON size ceiling for an injected exemplar (~2,000 tokens). Above this: hints only. */
const EXEMPLAR_MAX_CHARS = 8000;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'with', 'for', 'and', 'or', 'to', 'of', 'in', 'on', 'that',
  'show', 'shows', 'when', 'my', 'me', 'i', 'want', 'need', 'create', 'make', 'add',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function capabilitySurfaceOf(template: TemplateEntry): string[] {
  const config = (template.spec as { config?: unknown }).config;
  if (!config || typeof config !== 'object') return [];
  return Object.keys(config as Record<string, unknown>);
}

function scoreTemplate(template: TemplateEntry, queryTokens: Set<string>, requirement: RequirementSpec): number {
  let score = 0;
  // Strong signal: same module type as the requirement.
  if (template.type === requirement.moduleType) score += 3;
  const haystack = tokenize(`${template.name} ${template.description} ${(template.tags ?? []).join(' ')}`);
  for (const token of queryTokens) {
    if (haystack.has(token)) score += 1;
  }
  // Light boost when the template's capability surface covers a required control.
  const surface = new Set(capabilitySurfaceOf(template));
  for (const control of requirement.mustHaveControls) {
    if (surface.has(control)) score += 0.5;
  }
  // Quality-tier grading (Phase 6). Exemplars are hand-picked best-in-class for
  // their type and should win the grounding/few-shot pick over an equal-relevance
  // peer; floors are minimal coverage stubs and must lose to any real template, so
  // they never surface as the exemplar when something better matches. An untagged
  // template is neutral (no adjustment).
  if (template.tier === 'exemplar') score += 1.5;
  else if (template.tier === 'floor') score -= 1;
  return score;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripEmpty).filter((v) => !isEmptyValue(v));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripEmpty(raw);
      if (!isEmptyValue(cleaned)) out[key] = cleaned;
    }
    return out;
  }
  return value;
}

/**
 * Compact a template spec into a minified JSON string for few-shot injection:
 * drop undefined/null/empty-string/empty-array/empty-object values recursively,
 * then serialize with no whitespace. Deterministic — preserves source key order,
 * so the same spec always yields byte-identical output. Falsy-but-meaningful
 * values (0, false) are retained.
 */
export function compactSpecForExemplar(spec: unknown): string {
  return JSON.stringify(stripEmpty(spec));
}

/**
 * Find the top-k grounding templates for a requirement. Pure + deterministic.
 */
export function searchSolutions(
  requirement: RequirementSpec,
  options?: { topK?: number },
): SolutionSearchResult {
  const topK = options?.topK ?? 3;
  const queryTokens = tokenize(`${requirement.goal} ${requirement.audience} ${requirement.triggers.join(' ')}`);

  const ranked = MODULE_TEMPLATES.map((template) => ({
    template,
    score: scoreTemplate(template, queryTokens, requirement),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const startFrom: StartFromOption[] = ranked.map(({ template, score }) => ({
    templateId: template.id,
    name: template.name,
    description: template.description,
    moduleType: template.type,
    tags: template.tags ?? [],
    capabilitySurface: capabilitySurfaceOf(template),
    score,
  }));

  const grounding = startFrom.length
    ? [
        'Grounding examples — existing modules close to this request. Reuse their control/config surface where it fits; do not copy verbatim:',
        ...startFrom.map(
          (o, i) =>
            `${i + 1}. ${o.name} (${o.moduleType}) — ${o.description}. Controls: ${o.capabilitySurface.join(', ') || 'n/a'}.`,
        ),
      ].join('\n')
    : '';

  // Few-shot: inject the full spec of the single best match when it scores strongly
  // and fits the budget. Weak or oversized matches keep hints only. A very strong,
  // same-type match is promoted to Tier-1 (instantiate + delta-edit); everything
  // else that clears the floor stays Tier-2 (quality reference, freeform generation).
  let exemplar: TemplateExemplar | undefined;
  const top = ranked[0];
  if (top && top.score >= EXEMPLAR_MIN_SCORE) {
    const specJson = compactSpecForExemplar(top.template.spec);
    if (specJson.length <= EXEMPLAR_MAX_CHARS) {
      // A `floor`-tier template is a minimal coverage stub — never delta-editable
      // grounding. Even if a burst of token overlap pushed it past the Tier-1 floor,
      // it must stay Tier-2 (freeform reference), never Tier-1 (instantiate + delta).
      const tier: 1 | 2 =
        top.score >= EXEMPLAR_TIER1_MIN_SCORE
        && top.template.type === requirement.moduleType
        && top.template.tier !== 'floor'
          ? 1
          : 2;
      exemplar = { templateId: top.template.id, tier, specJson };
    }
  }

  return { startFrom, grounding, ...(exemplar ? { exemplar } : {}) };
}
