/**
 * Richness floors (035 vocab-hardening).
 *
 * Two deterministic, spec-level checks that fight "technically-valid but thin"
 * generations — a hero with no CTA, a pricing table with one plan, a module that
 * touches none of the control packs its type is supposed to use:
 *
 *   1. Per-archetype STRUCTURAL FLOORS — the minimum content a given section
 *      archetype needs to not read as a stub (keyed off `KIND_ARCHETYPE`).
 *   2. A BASICNESS detector — how much of the module's expected control-pack
 *      surface (from `mustHaveControls`) it actually populates, blended with a
 *      per-archetype block-count minimum.
 *
 * Floor tolerance: the floors were derived by reading the SHIPPED templates in
 * `packages/core/src/templates/{sections,modules,blocks}` for each archetype —
 * the templates define the ceiling, so any floor is weakened until every shipped
 * template of that archetype passes it (asserted by
 * `richness-qa-templates.test.ts`). Notably:
 *   • hero MEDIA is not required — centered/editorial heroes (e.g. NSEC-HERO-03)
 *     ship with no media, so the hero floor is CTA + subtitle only.
 *   • "upsell → recommendation pack + fallback" is realized as "≥1 product block
 *     AND an offer source (offerSource / recommendations)", because shipped
 *     upsell sections use `fields.offerSource: 'manual'` + manual product blocks,
 *     not a formal recommendation pack object.
 *
 * Severity policy (telemetry-aware): structural floors are blocking `'fail'`
 * ONLY for hero/pricing/upsell/popup (the conversion-critical archetypes);
 * everywhere else a missed floor is a `'warn'`. Basicness is `'fail'` only when
 * the score < 0.5 AND the request is not richness-exempt.
 *
 * Exemption: a user who asks for something "simple/minimal/plain/basic/just a…"
 * opted out of richness — `opts.richnessExempt` (or `detectRichnessExempt`)
 * short-circuits BOTH the floors and basicness so we don't fight the request.
 *
 * Pure + DB-free + no DOM. Reuses the `QaIssue` shape from `design-qa.server.ts`.
 */
import type { RecipeSpec } from '@superapp/core';
import { KIND_ARCHETYPE, type SectionArchetype } from '~/services/recipes/kind-archetype';
import type { QaIssue, QaSeverity } from '~/services/ai/design-qa.server';

export interface RichnessQaOpts {
  /**
   * The config-pack namespaces this module is expected to populate (from
   * `mustHaveControlsForType` / the matched RequirementSpec). Drives the
   * basicness score. When absent/empty, basicness is skipped (no expectation to
   * measure against) and only the structural floors run.
   */
  mustHaveControls?: string[];
  /** When true, skip floors + basicness entirely (see `detectRichnessExempt`). */
  richnessExempt?: boolean;
}

/** Archetypes whose missed floor is blocking (`'fail'`); all others `'warn'`. */
const BLOCKING_ARCHETYPES = new Set<SectionArchetype>(['hero', 'pricing', 'upsell']);

/**
 * Minimum block count per archetype, used ONLY by the basicness block-count
 * blend (not the structural floors). Conservative — the structural floors carry
 * the real per-archetype content requirements.
 */
const MIN_BLOCKS: Partial<Record<SectionArchetype, number>> = {
  hero: 1,
  feature: 2,
  gallery: 2,
  pricing: 2,
  faq: 3,
  testimonial: 3,
  upsell: 1,
  stats: 2,
  timeline: 2,
  team: 2,
};

// ── spec-shape helpers (tolerant of the real template shapes) ────────────────

type LooseConfig = Record<string, unknown>;
type Block = Record<string, unknown>;

function configOf(recipe: RecipeSpec): LooseConfig {
  const c = (recipe as { config?: unknown }).config;
  return c && typeof c === 'object' ? (c as LooseConfig) : {};
}

function fieldsOf(config: LooseConfig): LooseConfig {
  const f = config.fields;
  return f && typeof f === 'object' ? (f as LooseConfig) : {};
}

function blocksOf(config: LooseConfig): Block[] {
  return Array.isArray(config.blocks) ? (config.blocks as Block[]) : [];
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Is a config/field value "populated" (non-empty string, non-empty array/object, number, or true)? */
function isPopulated(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  if (typeof v === 'number') return true;
  if (typeof v === 'boolean') return v;
  return false;
}

function blockFields(b: Block): LooseConfig {
  const f = b.fields;
  return f && typeof f === 'object' ? (f as LooseConfig) : {};
}

/** Does any own-key of `obj` match `re` AND carry a populated value? */
function anyKeyMatches(obj: LooseConfig, re: RegExp): boolean {
  return Object.entries(obj).some(([k, v]) => re.test(k) && isPopulated(v));
}

function archetypeOf(config: LooseConfig): SectionArchetype | undefined {
  const kind = config.kind;
  return typeof kind === 'string' ? KIND_ARCHETYPE[kind] : undefined;
}

/**
 * A frequency-capped marketing popup — detected by `kind`, NOT by
 * `activation: 'overlay'`. Overlay is also used by size-chart modals and
 * collection badges, which are not popups and carry no trigger/frequency (every
 * shipped `kind: 'popup'` template DOES).
 */
function isPopup(config: LooseConfig): boolean {
  const kind = config.kind;
  return kind === 'popup' || kind === 'modal';
}

/**
 * V-B conversion kinds with their OWN floor (independent of the archetype table):
 * a cart-goal progress bar (B1, maps to `band`) and a post-add-to-cart offer
 * (B2, maps to `upsell`). Detected by kind so the floor fires only for these, not
 * for every band/upsell. Both are conversion-critical → blocking `'fail'`.
 */
function isProgressBar(config: LooseConfig): boolean {
  return config.kind === 'progress-bar';
}

/** B5 — does the popup carry a teaser / minimized-state config (behavior.teaser)? */
function hasTeaser(config: LooseConfig): boolean {
  const behavior = config.behavior;
  if (!behavior || typeof behavior !== 'object') return false;
  const teaser = (behavior as LooseConfig).teaser;
  return !!teaser && typeof teaser === 'object' && (teaser as LooseConfig).enabled === true;
}
function isPostAtcOffer(config: LooseConfig): boolean {
  return config.kind === 'post-atc-offer';
}

/** The floor-id / severity key for a recipe (kind-scoped kinds win over the archetype). */
function floorKeyOf(config: LooseConfig, arch: SectionArchetype | undefined): string | undefined {
  if (isPopup(config)) return 'popup';
  if (isProgressBar(config)) return 'progress-bar';
  if (isPostAtcOffer(config)) return 'post-atc-offer';
  return arch;
}

/**
 * ≥1 media reference anywhere in config/fields/blocks. Scans by key name
 * (image/media/video/photo/logo) because the shipped templates spread media
 * across many field names (mediaUrl, heroImageUrl, logoUrl, imageUrl, …) and
 * across slide/media blocks.
 */
const MEDIA_KEY = /(image|media|video|photo|logo)/i;
function hasMedia(config: LooseConfig): boolean {
  if (anyKeyMatches(config, MEDIA_KEY) || anyKeyMatches(fieldsOf(config), MEDIA_KEY)) return true;
  return blocksOf(config).some(
    (b) =>
      b.kind === 'media' ||
      b.kind === 'slide' ||
      nonEmptyString(b.imageUrl) ||
      nonEmptyString(b.videoUrl) ||
      anyKeyMatches(blockFields(b), MEDIA_KEY),
  );
}

/**
 * ≥1 call-to-action. Scans by key name (cta/button) since heroes express CTAs as
 * `primaryCtaLabel`/`primaryCtaUrl`/`addButtonLabel`/… as well as `cta` blocks
 * and `block.url`.
 */
const CTA_KEY = /(cta|button)/i;
const CTA_LEGACY = ['actionUrl', 'linkUrl', 'linkText'];
function hasCta(config: LooseConfig): boolean {
  const fields = fieldsOf(config);
  if (anyKeyMatches(config, CTA_KEY) || anyKeyMatches(fields, CTA_KEY)) return true;
  if (CTA_LEGACY.some((k) => nonEmptyString(config[k]) || nonEmptyString(fields[k]))) return true;
  return blocksOf(config).some(
    (b) => b.kind === 'cta' || nonEmptyString(b.url) || anyKeyMatches(blockFields(b), CTA_KEY),
  );
}

/** A subtitle / subheading / supporting line is present. */
function hasSubtitle(config: LooseConfig): boolean {
  const fields = fieldsOf(config);
  const keys = ['subtitle', 'subheading', 'subhead', 'eyebrow', 'bodyText', 'bodyCopy', 'body', 'description', 'lead'];
  return keys.some((k) => nonEmptyString(config[k]) || nonEmptyString(fields[k]));
}

function blocksOfKind(config: LooseConfig, kinds: string[]): Block[] {
  const set = new Set(kinds);
  return blocksOf(config).filter((b) => typeof b.kind === 'string' && set.has(b.kind as string));
}

/**
 * Pricing has an emphasized tier — a recommended/highlighted plan block, a
 * `highlight*` config field (highlightBlockIndex / highlightColumnIndex /
 * highlightUsColumn), or a plan badge. This is the meaningful pricing signal:
 * a compare table with no emphasized tier reads as undifferentiated.
 */
function pricingHighlighted(config: LooseConfig): boolean {
  if (anyKeyMatches(fieldsOf(config), /highlight/i)) return true;
  return blocksOf(config).some((b) => {
    const bf = blockFields(b);
    return bf.recommended === true || bf.highlighted === true || nonEmptyString(bf.badge);
  });
}

// ── structural floors ────────────────────────────────────────────────────────

type FloorResult = { ok: boolean; message: string };

/**
 * Evaluate the structural floor for a recipe. Returns null when the recipe is
 * not one of the floored archetypes (no floor applies).
 */
function evaluateFloor(config: LooseConfig, arch: SectionArchetype | undefined): FloorResult | null {
  // Popups are floored by their own rule (independent of the archetype table).
  if (isPopup(config)) {
    const hasTrigger = nonEmptyString(config.trigger) || nonEmptyString(fieldsOf(config).trigger);
    const hasFrequency =
      nonEmptyString(config.frequency) ||
      nonEmptyString((config as LooseConfig).frequencyCap) ||
      nonEmptyString(fieldsOf(config).frequency);
    return {
      ok: hasTrigger && hasFrequency,
      message: 'Popup/overlay is missing a trigger and/or frequency cap — set config.trigger (e.g. exit_intent) and config.frequency (e.g. once_per_session) so it does not fire on every page load.',
    };
  }

  // B1 — cart-goal progress bar: needs ≥1 reward tier AND before-copy that carries
  // a {amount}/{remaining} token (a static bar with no live copy reads as a stub).
  if (isProgressBar(config)) {
    const pg = (config.progressGoal ?? {}) as LooseConfig;
    const tiers = Array.isArray(pg.tiers) ? (pg.tiers as unknown[]) : [];
    const hasToken = typeof pg.beforeText === 'string' && /\{amount\}|\{remaining\}/.test(pg.beforeText);
    return {
      ok: tiers.length >= 1 && hasToken,
      message: `Progress bar needs config.progressGoal with ≥1 tier and a beforeText carrying an {amount}/{remaining} token (found ${tiers.length} tier(s), token=${hasToken}).`,
    };
  }

  // B2 — post-add-to-cart offer: needs a recommendation SOURCE + an accept label
  // (with no offer source there is nothing to put in the modal).
  if (isPostAtcOffer(config)) {
    const hasRec = isPopulated(config.recommendation);
    const hasAccept = nonEmptyString(config.acceptLabel) || nonEmptyString(fieldsOf(config).acceptLabel);
    return {
      ok: hasRec && hasAccept,
      message: `Post-add-to-cart offer needs a recommendation source (config.recommendation) and an acceptLabel (recommendation=${hasRec}, acceptLabel=${hasAccept}).`,
    };
  }

  switch (arch) {
    case 'hero':
      // Weakened from the "media + CTA + subtitle" ideal: shipped heroes vary
      // widely (carousel with slide blocks and no config subtitle; launch/coming
      // -soon with no CTA; editorial with a CTA-link and no media). The floor a
      // bare-headline stub still fails: it must carry an action-or-media AND a
      // supporting element (subtitle or ≥1 content block).
      return {
        ok: (hasCta(config) || hasMedia(config)) && (hasSubtitle(config) || blocksOf(config).length >= 1),
        message: 'Hero is a bare headline — add a CTA or hero media, plus a supporting subtitle or content blocks beneath the title.',
      };
    case 'pricing': {
      // Weakened from "≥2 plans": comparison-table variants carry `row` blocks
      // (features) with plans as columns in `fields`, and one shipped variant is
      // a single featured-plan card. The kept, meaningful requirement is an
      // emphasized tier + at least some pricing content.
      const plans = blocksOfKind(config, ['plan']);
      const hasContent = plans.length >= 1 || blocksOf(config).length >= 2;
      const highlighted = pricingHighlighted(config);
      return {
        ok: hasContent && highlighted,
        message: `Pricing needs a highlighted/recommended tier and pricing content (found ${blocksOf(config).length} block(s), highlighted=${highlighted}).`,
      };
    }
    case 'upsell': {
      // "recommendation pack + fallback" as shipped = the manual product list IS
      // the fallback. Shipped upsells (FBT, add-ons grid, cart upsell strip) use
      // `feature`/`upsell-card`/`addon`/`bundle-item` blocks and mostly no
      // `offerSource` field, so the floor is ≥1 recommendation block.
      const products = blocksOf(config);
      return {
        ok: products.length >= 1,
        message: `Upsell needs ≥1 recommendation/product entry (the manual fallback list). Found ${products.length} block(s).`,
      };
    }
    case 'testimonial': {
      const count = blocksOf(config).length;
      return {
        ok: count >= 3,
        message: `Testimonial/social-proof needs ≥3 entries (found ${count}).`,
      };
    }
    case 'faq': {
      const items = blocksOfKind(config, ['faq-item']);
      const count = items.length > 0 ? items.length : blocksOf(config).length;
      return {
        ok: count >= 4,
        message: `FAQ needs ≥4 question/answer items (found ${count}).`,
      };
    }
    default:
      return null;
  }
}

// ── basicness ────────────────────────────────────────────────────────────────

/**
 * Basicness score in [0,1]: half from expected-pack coverage (fraction of
 * `mustHaveControls` namespaces populated in config), half from block density
 * (block count vs the archetype minimum). 1.0 when there is no pack expectation
 * and no block minimum.
 */
export function basicnessScore(
  config: LooseConfig,
  arch: SectionArchetype | undefined,
  mustHaveControls: string[],
): { score: number; missing: string[] } {
  const expected = mustHaveControls.filter((ns) => ns && ns.length > 0);
  const missing = expected.filter((ns) => !isPopulated(config[ns]));
  const coverage = expected.length === 0 ? 1 : (expected.length - missing.length) / expected.length;

  const minBlocks = (arch && MIN_BLOCKS[arch]) ?? 0;
  const blockScore = minBlocks === 0 ? 1 : Math.min(1, blocksOf(config).length / minBlocks);

  const score = 0.5 * coverage + 0.5 * blockScore;
  return { score, missing };
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Heuristic: did the user explicitly ask for a simple/minimal module? Such a
 * request opts out of the richness floors + basicness detector.
 */
export function detectRichnessExempt(userPrompt: string): boolean {
  return /\b(simple|minimal|plain|basic|just an?|only)\b/i.test(userPrompt);
}

/**
 * Run the richness floors + basicness detector against a recipe.
 *
 * @returns `QaIssue[]` — empty when exempt, when the recipe is not a floored
 *          archetype, and when nothing is thin. Never throws.
 */
export function runRichnessQa(recipe: RecipeSpec, opts: RichnessQaOpts = {}): QaIssue[] {
  try {
    if (opts.richnessExempt) return [];

    const config = configOf(recipe);
    // Non-visual / config-less recipes carry no archetype and no floor.
    if (Object.keys(config).length === 0) return [];

    const arch = archetypeOf(config);
    const issues: QaIssue[] = [];

    // 1) Structural floor.
    const floor = evaluateFloor(config, arch);
    if (floor && !floor.ok) {
      const key = floorKeyOf(config, arch);
      // Conversion-critical floors block: popups, the money/conversion archetypes,
      // and the kind-scoped V-B conversion kinds (progress bar + post-ATC offer).
      const blocking =
        isPopup(config) ||
        isProgressBar(config) ||
        isPostAtcOffer(config) ||
        (arch !== undefined && BLOCKING_ARCHETYPES.has(arch));
      const severity: QaSeverity = blocking ? 'fail' : 'warn';
      issues.push({
        id: `richness.floor.${key}`,
        severity,
        message: floor.message,
        autofixed: false,
      });
    }

    // 1b) B5 — teaser presence on capture popups (WARN only, never blocking). A
    // popup that minimizes to a reopenable teaser on dismiss recovers far more
    // captures than a gone-for-session one. Old templates lack it, so this can only
    // ever warn — we never fail on it and never autofix it (a teaser is a deliberate
    // merchant choice, not something to default on).
    if (isPopup(config) && !hasTeaser(config)) {
      issues.push({
        id: 'richness.floor.popup.teaser',
        severity: 'warn',
        message:
          'Popup has no teaser / minimized state — on dismiss it disappears for the session. Consider behavior.teaser.enabled so it collapses to a reopenable pill instead (recovers abandoned captures).',
        autofixed: false,
      });
    }

    // 2) Basicness — only when there is a pack expectation to measure against.
    const expected = (opts.mustHaveControls ?? []).filter((ns) => ns && ns.length > 0);
    if (expected.length > 0) {
      const { score, missing } = basicnessScore(config, arch, expected);
      if (score < 0.5) {
        issues.push({
          id: 'richness.underuse',
          severity: 'fail',
          message:
            `This module populates only a fraction of the controls its type is meant to use (richness ${score.toFixed(2)} < 0.50). ` +
            (missing.length > 0
              ? `Populate the missing control pack(s): ${missing.join(', ')}. `
              : '') +
            'Add real content to those packs and more blocks — a thin, one-note module underuses the surface.',
          autofixed: false,
        });
      }
    }

    return issues;
  } catch {
    return [];
  }
}
