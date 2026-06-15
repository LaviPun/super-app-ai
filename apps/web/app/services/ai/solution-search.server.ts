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

export interface SolutionSearchResult {
  /** Best matches, highest score first. */
  startFrom: StartFromOption[];
  /** Compact grounding block for the prompt (empty when no matches). */
  grounding: string;
}

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
  return score;
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

  return { startFrom, grounding };
}
