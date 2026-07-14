/**
 * Assistant action proposals — pure, isomorphic derivation + allowlist validation.
 *
 * SAFETY CONTRACT (non-negotiable): a proposal may ONLY reference an entity id
 * that a tool run resolved this turn. Proposals are derived DETERMINISTICALLY
 * from {@link AssistantToolRunResult} payloads — never parsed from model-generated
 * text. Every proposal is validated against {@link ACTION_INTENT_ALLOWLIST} before
 * it is emitted, persisted, or rendered (defense in depth: a tampered persisted
 * row must not render an arbitrary ops intent).
 *
 * This module has NO server-only imports so both the SSE producer (server) and the
 * chat UI (client) can share the exact same allowlist + validator. The brief-named
 * `internal-assistant-actions.server.ts` is a thin re-export barrel over this file.
 */

import type { AssistantToolRunResult } from '~/services/ai/internal-assistant-tools.server';

/**
 * A single confirm-to-run ops action the operator can execute via `/internal/ops`.
 * `kind` is optional and defaults to `'ops'` so pre-existing persisted rows (written
 * before the link kind existed) and existing callers stay valid.
 */
export type OpsActionProposal = {
  /** Discriminant. Absent = `'ops'` (back-compat). */
  kind?: 'ops';
  /** Stable, deterministic id (hash of intent + params) — safe as a React key. */
  id: string;
  /** Ops intent — MUST be a key of {@link ACTION_INTENT_ALLOWLIST}. */
  intent: string;
  /** String-only params forwarded verbatim to `/internal/ops`. */
  params: Record<string, string>;
  /** Operator-facing button label (honest — never claims the action already ran). */
  label: string;
  /** Short "why this is offered" line, sourced from the resolving tool result. */
  reason: string;
};

/**
 * A navigation-only proposal: no server mutation, just a deep link into the internal
 * console. `href` MUST pass {@link isAllowedLinkHref} at EVERY boundary (derive / SSE
 * emit / persist / render) — a tampered persisted row must never render a non-allowlisted
 * href (e.g. `javascript:` or an external URL). There is no `intent`/`params`.
 */
export type LinkActionProposal = {
  kind: 'link';
  /** Stable, deterministic id (hash of href) — safe as a React key. */
  id: string;
  /** Allowlisted internal path (see {@link LINK_HREF_ALLOWED_PREFIXES}). */
  href: string;
  /** Operator-facing link label. */
  label: string;
  /** Short "why this is offered" line. */
  reason: string;
};

export type ActionProposal = OpsActionProposal | LinkActionProposal;

/** True when a proposal is the navigation-only link kind. */
export function isLinkProposal(p: ActionProposal): p is LinkActionProposal {
  return (p as { kind?: string }).kind === 'link';
}

/**
 * Allowlisted href prefixes for {@link LinkActionProposal}. A prefix ending in `/`
 * matches any deeper path segment; a prefix without a trailing slash matches only at
 * a boundary (`?`, `/`, `#`, or end) so `/internal/recipe-editEVIL` is rejected.
 */
export const LINK_HREF_ALLOWED_PREFIXES = ['/internal/recipe-edit', '/internal/templates/'] as const;

/**
 * Strict href validator — the single choke point for link proposals. An href is
 * allowed ONLY if it: is a non-empty ≤512-char string; contains no whitespace,
 * quotes, angle brackets or backslashes; contains no `..` traversal; starts with
 * `/internal/`; and matches an allowlisted prefix at a segment boundary. This
 * rejects `javascript:`, `http(s)://…`, protocol-relative `//host`, and any path
 * outside the allowlist by construction.
 */
export function isAllowedLinkHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length === 0 || href.length > 512) return false;
  if (/[\s<>"'`\\]/.test(href)) return false;
  if (href.includes('..')) return false;
  if (!href.startsWith('/internal/')) return false;
  return LINK_HREF_ALLOWED_PREFIXES.some((prefix) => {
    if (!href.startsWith(prefix)) return false;
    if (prefix.endsWith('/')) return true;
    const rest = href.slice(prefix.length);
    return rest === '' || rest.startsWith('?') || rest.startsWith('/') || rest.startsWith('#');
  });
}

/** Max proposals surfaced under one assistant reply. */
export const MAX_ACTION_PROPOSALS = 3;
/** Reason-line character cap. */
const REASON_CAP = 140;
/** Plausible entity-id shape (cuid / correlation slug). Rejects paths, spaces, injection. */
const ENTITY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;

/**
 * Per-intent parameter spec. `required` keys must be present and valid; keys not
 * in `required ∪ optional` are rejected (tamper resistance). Every value must be a
 * plain string (ops parses FormData strings).
 *
 * Only `job_replay` / `job_replay_all` are wired to a derivation rule TODAY. The
 * remaining specs (publish, rollback, flow pause/resume, connector_test) are
 * declared so a FUTURE tool which resolves that concrete entity id lights the
 * mapping up without a validator change — but with the current toolset nothing
 * derives them, so they never fire. See {@link deriveActionProposals}.
 */
type IntentSpec = {
  required: string[];
  optional?: string[];
  validate: (params: Record<string, string>) => boolean;
};

const isEntityId = (v: unknown): v is string => typeof v === 'string' && ENTITY_ID_RE.test(v);

/** Every value present is a string and every key falls within `allowed`. */
function keysAllowed(params: Record<string, string>, required: string[], optional: string[]): boolean {
  const allowed = new Set([...required, ...optional]);
  for (const [key, value] of Object.entries(params)) {
    if (!allowed.has(key)) return false;
    if (typeof value !== 'string') return false;
  }
  for (const key of required) {
    if (!(key in params)) return false;
  }
  return true;
}

/** Build a spec whose validate self-checks its own key set (no record back-refs). */
function spec(
  required: string[],
  optional: string[],
  extra?: (params: Record<string, string>) => boolean,
): IntentSpec {
  return {
    required,
    optional,
    validate: (params) => keysAllowed(params, required, optional) && (extra ? extra(params) : true),
  };
}

export const ACTION_INTENT_ALLOWLIST: Record<string, IntentSpec> = {
  job_replay: spec(['id'], [], (p) => isEntityId(p.id)),
  job_replay_all: spec([], []),
  // --- Declared for future tools; no derivation rule emits these today. ---
  publish: spec(['id'], [], (p) => isEntityId(p.id)),
  rollback: spec(['id'], ['version'], (p) => isEntityId(p.id) && (p.version === undefined || /^[0-9]{1,6}$/.test(p.version))),
  flow_pause: spec(['id'], [], (p) => isEntityId(p.id)),
  flow_resume: spec(['id'], [], (p) => isEntityId(p.id)),
  connector_test: spec(['id'], ['path', 'method'], (p) => isEntityId(p.id)),
};

export function isAllowedActionIntent(intent: string): boolean {
  return Object.prototype.hasOwnProperty.call(ACTION_INTENT_ALLOWLIST, intent);
}

/**
 * True only when `value` is a well-formed proposal whose intent is allowlisted and
 * whose params satisfy that intent's spec. Applied before every emit / persist /
 * render — the single choke point that keeps model text and tampered rows out.
 */
export function validateActionProposal(value: unknown): value is ActionProposal {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) return false;
  if (typeof p.label !== 'string' || !p.label) return false;
  if (typeof p.reason !== 'string') return false;

  // Link kind: navigation only. Reject any ops fields (tamper resistance) and gate
  // the href through the strict allowlist — the same choke point at every boundary.
  if (p.kind === 'link') {
    if ('intent' in p || 'params' in p) return false;
    const allowedKeys = new Set(['kind', 'id', 'href', 'label', 'reason']);
    for (const key of Object.keys(p)) {
      if (!allowedKeys.has(key)) return false;
    }
    return isAllowedLinkHref(p.href);
  }

  // Ops kind (default). `kind`, if present, must be exactly 'ops'.
  if (p.kind !== undefined && p.kind !== 'ops') return false;
  if (typeof p.intent !== 'string') return false;
  if (!p.params || typeof p.params !== 'object' || Array.isArray(p.params)) return false;
  const params = p.params as Record<string, unknown>;
  for (const v of Object.values(params)) {
    if (typeof v !== 'string') return false;
  }
  const spec = ACTION_INTENT_ALLOWLIST[p.intent];
  if (!spec) return false;
  return spec.validate(params as Record<string, string>);
}

/**
 * Parse a persisted `actionsJson` string (or already-parsed array) into a list of
 * VALIDATED proposals. Anything malformed or not allowlisted is dropped — a
 * tampered row can never render an arbitrary intent.
 */
export function parseStoredActionProposals(raw: unknown): ActionProposal[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(validateActionProposal).slice(0, MAX_ACTION_PROPOSALS);
}

/** Deterministic djb2 → base36 hash. No deps; stable across server/client. */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function proposalId(intent: string, params: Record<string, string>): string {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `sap_${stableHash(`${intent}|${canonical}`)}`;
}

function truncateReason(text: string | null | undefined, fallback: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return fallback;
  return trimmed.length <= REASON_CAP ? trimmed : `${trimmed.slice(0, REASON_CAP - 1)}…`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function makeProposal(intent: string, params: Record<string, string>, label: string, reason: string): OpsActionProposal {
  return { kind: 'ops', id: proposalId(intent, params), intent, params, label, reason };
}

function makeLinkProposal(href: string, label: string, reason: string): LinkActionProposal {
  return { kind: 'link', id: `sap_${stableHash(`link|${href}`)}`, href, label, reason };
}

const TEMPLATES_SHOP_ID = '__templates__';

/** Reusable id shape for recipe-edit params (module cuid / template id). */
const RECIPE_ENTITY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

/**
 * Build the recipe-edit deep link for a resolved template or module. Returns null
 * (no card) when the ids are missing or malformed — the href is still re-validated
 * by {@link isAllowedLinkHref} before it is emitted, so this only avoids obviously
 * broken links early.
 */
function recipeEditHref(source: 'template' | 'module', id: string, shopId?: string): string | null {
  if (!RECIPE_ENTITY_ID_RE.test(id)) return null;
  if (source === 'template') {
    return `/internal/recipe-edit?shopId=${encodeURIComponent(TEMPLATES_SHOP_ID)}&moduleId=${encodeURIComponent(id)}`;
  }
  if (!shopId || !RECIPE_ENTITY_ID_RE.test(shopId)) return null;
  return `/internal/recipe-edit?shopId=${encodeURIComponent(shopId)}&moduleId=${encodeURIComponent(id)}`;
}

type InspectResolved = {
  found?: boolean;
  source?: 'template' | 'module';
  id?: string;
  shopId?: string;
  name?: string;
};

type SearchTemplatesData = {
  results?: Array<{ id?: string; name?: string }>;
};

/**
 * Derive navigation-only link cards from the recipe/template tools run this turn:
 *  - `inspectRecipe` resolved a template  → "Open <name> in Recipe Editor".
 *  - `inspectRecipe` resolved a module    → "Open <name> in Recipe Editor" (module URL).
 *  - `searchTemplates` returned results   → "View <name> template" (best match detail page).
 * Each href is re-validated through {@link isAllowedLinkHref}; anything malformed is
 * dropped. PURE + unit-tested.
 */
export function deriveLinkProposals(toolResults: AssistantToolRunResult[]): LinkActionProposal[] {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return [];
  const out: LinkActionProposal[] = [];

  for (const result of toolResults) {
    if (!result || result.ok !== true || result.toolName !== 'inspectRecipe') continue;
    const d = result.data as InspectResolved | undefined;
    if (!d || d.found !== true || !d.source || !d.id) continue;
    const href = recipeEditHref(d.source, d.id, d.shopId);
    if (!href || !isAllowedLinkHref(href)) continue;
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 60) : d.id;
    out.push(makeLinkProposal(href, `Open ${name} in Recipe Editor`, `Edit the ${d.source}'s RecipeSpec JSON in the Recipe Editor.`));
    break; // one inspect link per turn
  }

  for (const result of toolResults) {
    if (!result || result.ok !== true || result.toolName !== 'searchTemplates') continue;
    const d = result.data as SearchTemplatesData | undefined;
    const best = Array.isArray(d?.results) ? d!.results![0] : undefined;
    if (!best || typeof best.id !== 'string' || !RECIPE_ENTITY_ID_RE.test(best.id)) continue;
    const href = `/internal/templates/${encodeURIComponent(best.id)}`;
    if (!isAllowedLinkHref(href)) continue;
    const name = typeof best.name === 'string' && best.name.trim() ? best.name.trim().slice(0, 60) : best.id;
    out.push(makeLinkProposal(href, `View ${name} template`, 'Open the best-matching template detail page.'));
    break; // one search link per turn
  }

  return out;
}

type InvestigateEntry = {
  table?: string;
  id?: string;
  status?: string;
  message?: string;
};

/**
 * Derive confirm-to-run proposals from the tools the assistant actually ran this
 * turn. PURE and unit-tested. Rules (allowlist §Items):
 *
 *  1. `investigateLogEntry` resolved a FAILED job  → `job_replay {id}`.
 *  2. `getJobStatus` dlqFailedTotal > 0            → `job_replay_all`.
 *  3. `getJobStatus` recentFailed (≤2, deduped)    → `job_replay {id}`.
 *
 * ok:false results and read-only tools (docs search, health, …) yield nothing.
 * Output is validated, deduped by intent+params, and capped at
 * {@link MAX_ACTION_PROPOSALS}. Priority order (investigate → dlq-all → recent) is
 * the push order so the cap keeps the most specific proposals.
 */
export function deriveActionProposals(toolResults: AssistantToolRunResult[]): ActionProposal[] {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return [];
  const proposals: ActionProposal[] = [];
  const seenReplayIds = new Set<string>();

  // Rule 1 — investigated FAILED job (highest priority; runs first).
  for (const result of toolResults) {
    if (!result || result.ok !== true || result.toolName !== 'investigateLogEntry') continue;
    const data = result.data as { found?: boolean; entry?: InvestigateEntry } | undefined;
    if (!data || data.found !== true || !data.entry) continue;
    const entry = data.entry;
    if (entry.table !== 'job' || String(entry.status ?? '').toUpperCase() !== 'FAILED') continue;
    if (!isEntityId(entry.id)) continue;
    if (seenReplayIds.has(entry.id)) continue;
    seenReplayIds.add(entry.id);
    proposals.push(
      makeProposal(
        'job_replay',
        { id: entry.id },
        `Replay job ${shortId(entry.id)}`,
        truncateReason(entry.message, 'Investigated job failed — re-enqueue it.'),
      ),
    );
  }

  // Rules 2 + 3 — job status snapshot.
  for (const result of toolResults) {
    if (!result || result.ok !== true || result.toolName !== 'getJobStatus') continue;
    const data = result.data as
      | { dlqFailedTotal?: number; recentFailed?: Array<{ id?: string; type?: string; result?: string }> }
      | undefined;
    if (!data) continue;

    const dlq = Number(data.dlqFailedTotal ?? 0);
    if (Number.isFinite(dlq) && dlq > 0) {
      proposals.push(
        makeProposal(
          'job_replay_all',
          {},
          `Replay all ${dlq} DLQ job${dlq === 1 ? '' : 's'}`,
          `${dlq} failed job${dlq === 1 ? '' : 's'} in the dead-letter queue.`,
        ),
      );
    }

    const recent = Array.isArray(data.recentFailed) ? data.recentFailed : [];
    let addedFromRecent = 0;
    for (const job of recent) {
      if (addedFromRecent >= 2) break;
      if (!job || !isEntityId(job.id) || seenReplayIds.has(job.id)) continue;
      seenReplayIds.add(job.id);
      addedFromRecent += 1;
      proposals.push(
        makeProposal(
          'job_replay',
          { id: job.id },
          `Replay job ${shortId(job.id)}`,
          truncateReason(job.result, `Failed ${job.type ?? 'job'} — re-enqueue it.`),
        ),
      );
    }
  }

  // Navigation link cards (recipe/template tools) come AFTER ops proposals so a
  // crowded turn keeps the higher-priority confirm-to-run ops cards within the cap.
  const linkProposals = deriveLinkProposals(toolResults);

  // Validate (defense in depth), dedupe by id, cap.
  const seenKeys = new Set<string>();
  const out: ActionProposal[] = [];
  for (const proposal of [...proposals, ...linkProposals]) {
    if (!validateActionProposal(proposal)) continue;
    const key = proposal.id;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(proposal);
    if (out.length >= MAX_ACTION_PROPOSALS) break;
  }
  return out;
}
