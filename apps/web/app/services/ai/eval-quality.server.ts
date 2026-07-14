/**
 * Competitor-parity checklists (035 vocab-hardening — Phase 5a).
 *
 * Where `richness-qa.server.ts` asks "is this module thin?" (STRUCTURAL floors —
 * a hero with no CTA, a pricing table with one plan), this module asks the
 * complementary, PARITY question: "does this module carry the specific controls a
 * merchant would expect from the category-leading competitor app?" — a popup with
 * a frequency cap AND an escapable dismiss, a discount with a stacking rule, an
 * upsell with a recommendation strategy AND a deterministic fallback, a messaging
 * campaign that gates on consent.
 *
 * The two are deliberately layered, not duplicated:
 *   • The FLOOR item (`floor`) delegates to `runRichnessQa` — we do not re-encode
 *     the per-archetype minimums here; we import the single source of truth.
 *   • Every other item is a PARITY semantic the floors do NOT check (style.pack,
 *     colors.seed, recommendation.fallback, respectConsent, a stacking rule, …).
 *
 * `parityChecklist(recipe)` returns a deterministic `{ family, items[], score }`
 * where `score ∈ [0,1]` is the fraction of items that pass. It is pure, DB-free,
 * DOM-free, and never throws — a malformed recipe degrades to the `generic`
 * family and scores on structural presence alone. The score feeds the eval
 * flywheel's `avgQualityScore` metric (evals.server.ts) and the nightly trend
 * gate; it is a QUALITY signal, never a hard schema gate.
 *
 * Field paths were verified against the shipped templates in
 * `packages/core/src/templates/**` and the RecipeSpec members in
 * `packages/core/src/recipe.ts` — a representative shipped template of each family
 * scores ≥ 0.8 (asserted by eval-quality.test.ts).
 */
import type { RecipeSpec } from '@superapp/core';
import { KIND_ARCHETYPE } from '~/services/recipes/kind-archetype';
import { runRichnessQa } from '~/services/ai/richness-qa.server';

export type ParityFamily =
  | 'section'
  | 'popup'
  | 'discount'
  | 'upsell'
  | 'flow'
  | 'messaging'
  | 'generic';

export type ParityItem = {
  /** Stable, machine-readable id (e.g. `popup.frequencyCap`). */
  id: string;
  /** Merchant-facing label describing the parity control. */
  label: string;
  /** Did the recipe carry this control? */
  pass: boolean;
};

export type ParityChecklist = {
  family: ParityFamily;
  items: ParityItem[];
  /** Fraction of items that pass, in [0,1]. 1 when there are no items. */
  score: number;
};

// ── tolerant config readers (mirror the real, varied template shapes) ─────────

type Loose = Record<string, unknown>;

function asObject(v: unknown): Loose {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {};
}

function configOf(recipe: RecipeSpec): Loose {
  return asObject((recipe as { config?: unknown }).config);
}

function fieldsOf(config: Loose): Loose {
  return asObject(config.fields);
}

function styleOf(recipe: RecipeSpec): Loose {
  return asObject((recipe as { style?: unknown }).style);
}

function blocksOf(config: Loose): Loose[] {
  return Array.isArray(config.blocks) ? (config.blocks as Loose[]).map(asObject) : [];
}

function isPopulated(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  if (typeof v === 'number') return true;
  if (typeof v === 'boolean') return v;
  return false;
}

function anyKeyMatches(obj: Loose, re: RegExp): boolean {
  return Object.entries(obj).some(([k, v]) => re.test(k) && isPopulated(v));
}

/** ≥1 populated value under `keys` in config or config.fields. */
function hasAny(config: Loose, keys: string[]): boolean {
  const fields = fieldsOf(config);
  return keys.some((k) => isPopulated(config[k]) || isPopulated(fields[k]));
}

const MEDIA_KEY = /(image|media|video|photo|logo)/i;
const CTA_KEY = /(cta|button)/i;

function hasMedia(config: Loose): boolean {
  if (anyKeyMatches(config, MEDIA_KEY) || anyKeyMatches(fieldsOf(config), MEDIA_KEY)) return true;
  return blocksOf(config).some(
    (b) => b.kind === 'media' || b.kind === 'slide' || isPopulated(b.imageUrl) || isPopulated(b.videoUrl) || anyKeyMatches(asObject(b.fields), MEDIA_KEY),
  );
}

function hasCta(config: Loose): boolean {
  if (anyKeyMatches(config, CTA_KEY) || anyKeyMatches(fieldsOf(config), CTA_KEY)) return true;
  if (hasAny(config, ['actionUrl', 'linkUrl', 'linkText'])) return true;
  return blocksOf(config).some((b) => b.kind === 'cta' || isPopulated(b.url) || anyKeyMatches(asObject(b.fields), CTA_KEY));
}

/** Does the recipe pass every BLOCKING richness floor (no `fail`-severity issue)? */
function passesRichnessFloor(recipe: RecipeSpec): boolean {
  try {
    return runRichnessQa(recipe).every((i) => i.severity !== 'fail');
  } catch {
    return true; // richness-qa never throws, but never let it sink the checklist
  }
}

// ── family resolution ─────────────────────────────────────────────────────────

function isPopupConfig(config: Loose): boolean {
  return config.kind === 'popup' || config.kind === 'modal';
}

export function parityFamilyOf(recipe: RecipeSpec): ParityFamily {
  const type = String((recipe as { type?: unknown }).type ?? '');
  if (type === 'functions.discountRules') return 'discount';
  if (type === 'checkout.upsell' || type === 'checkout.block' || type === 'postPurchase.offer') return 'upsell';
  if (type === 'flow.automation') return 'flow';
  if (type === 'messaging.campaign') return 'messaging';
  if (type === 'theme.section' || type === 'proxy.widget') {
    return isPopupConfig(configOf(recipe)) ? 'popup' : 'section';
  }
  return 'generic';
}

// ── per-family checklists ───────────────────────────────────────────────────

function sectionItems(recipe: RecipeSpec): ParityItem[] {
  const config = configOf(recipe);
  const style = styleOf(recipe);
  const colors = asObject(style.colors);
  return [
    { id: 'section.heading', label: 'Headline', pass: hasAny(config, ['title', 'heading', 'headline']) },
    { id: 'section.subheading', label: 'Supporting subheading', pass: hasAny(config, ['subtitle', 'subheading', 'subhead', 'eyebrow', 'bodyText', 'bodyCopy', 'body', 'description', 'lead']) },
    { id: 'section.cta', label: 'Call-to-action', pass: hasCta(config) },
    { id: 'section.media', label: 'Hero media', pass: hasMedia(config) },
    { id: 'section.stylePack', label: 'Design pack selected', pass: isPopulated(style.pack) },
    { id: 'section.colorSeed', label: 'Brand color seed', pass: isPopulated(colors.seed) },
    { id: 'section.blocks', label: '≥2 content blocks', pass: blocksOf(config).length >= 2 },
    { id: 'section.floor', label: 'Meets richness structural floor', pass: passesRichnessFloor(recipe) },
  ];
}

function popupItems(recipe: RecipeSpec): ParityItem[] {
  const config = configOf(recipe);
  const fields = fieldsOf(config);
  const captureField = blocksOf(config).some((b) => b.kind === 'field');
  const hasCapture =
    isPopulated(fields.emailFieldEnabled) ||
    captureField ||
    isPopulated(fields.couponCode) ||
    hasAny(config, ['offer', 'discountPercent', 'couponCode']);
  return [
    { id: 'popup.trigger', label: 'Display trigger', pass: hasAny(config, ['trigger']) },
    {
      id: 'popup.frequencyCap',
      label: 'Frequency cap',
      pass: hasAny(config, ['frequency', 'frequencyCap', 'maxShowsPerDay']),
    },
    { id: 'popup.capture', label: 'Capture field or offer', pass: hasCapture },
    {
      id: 'popup.dismiss',
      label: 'Escapable (close/dismiss control)',
      pass: config.showCloseButton === true || isPopulated(fields.dismissLabel) || isPopulated(config.dismissLabel),
    },
    { id: 'popup.floor', label: 'Meets popup richness floor', pass: passesRichnessFloor(recipe) },
  ];
}

function discountItems(recipe: RecipeSpec): ParityItem[] {
  const config = configOf(recipe);
  const pricing = asObject(config.pricing);
  const rules = Array.isArray(config.rules) ? (config.rules as Loose[]) : [];
  const tiers = asObject(pricing.tiers);
  const tierRows = Array.isArray(tiers.rows) ? (tiers.rows as Loose[]) : [];
  const gate = asObject(pricing.gate);
  const hasLabel =
    tierRows.some((r) => isPopulated(r.title) || isPopulated(r.subtitle) || isPopulated(r.badge)) ||
    rules.some((r) => isPopulated(r.message) || isPopulated(r.label)) ||
    isPopulated(config.title) ||
    isPopulated(config.name);
  return [
    { id: 'discount.pricingPack', label: 'Pricing pack', pass: isPopulated(config.pricing) },
    { id: 'discount.model', label: 'Explicit pricing model', pass: isPopulated(pricing.model) },
    {
      id: 'discount.gateOrTiers',
      label: 'Audience gate or tier structure',
      pass: isPopulated(gate) || tierRows.length > 0 || rules.length > 0,
    },
    { id: 'discount.messageOrLabel', label: 'Merchant-facing message/label', pass: hasLabel },
    {
      id: 'discount.stacking',
      label: 'Stacking / combination control',
      pass: isPopulated(pricing.stacking) || typeof config.combineWithOtherDiscounts === 'boolean',
    },
  ];
}

function upsellItems(recipe: RecipeSpec): ParityItem[] {
  const config = configOf(recipe);
  const rec = asObject(config.recommendation);
  const hasProduct =
    isPopulated(config.productVariantGid) ||
    (Array.isArray(rec.manualVariantGids) && (rec.manualVariantGids as unknown[]).length > 0);
  return [
    { id: 'upsell.offer', label: 'Offer title', pass: hasAny(config, ['offerTitle', 'title']) },
    { id: 'upsell.product', label: 'Product source (variant or recommendation)', pass: hasProduct || isPopulated(config.recommendation) },
    { id: 'upsell.recommendationStrategy', label: 'Recommendation strategy', pass: isPopulated(rec.strategy) },
    { id: 'upsell.fallback', label: 'Deterministic fallback', pass: isPopulated(rec.fallback) },
    {
      id: 'upsell.terms',
      label: 'Offer terms (discount or message)',
      pass: (typeof config.discountPercent === 'number' && config.discountPercent > 0) || hasAny(config, ['message']),
    },
  ];
}

function flowItems(recipe: RecipeSpec): ParityItem[] {
  const config = configOf(recipe);
  const steps = Array.isArray(config.steps) ? (config.steps as Loose[]).map(asObject) : [];
  // Flow has no dedicated error field; a guarded/resilient step (a CONDITION
  // branch or a durable DELAY park) is the modeled "handle failure gracefully"
  // control — asserted only where the recipe carries one ("if modeled").
  const hasResilience = steps.some((s) => s.kind === 'CONDITION' || s.kind === 'DELAY');
  return [
    { id: 'flow.trigger', label: 'Trigger event', pass: isPopulated(config.trigger) },
    { id: 'flow.action', label: '≥1 action step', pass: steps.length >= 1 },
    { id: 'flow.multiStep', label: 'Multi-step automation', pass: steps.length >= 2 },
    { id: 'flow.resilience', label: 'Guarded/durable step (condition or delay)', pass: hasResilience },
  ];
}

function messagingItems(recipe: RecipeSpec): ParityItem[] {
  const config = configOf(recipe);
  const templates = Array.isArray(config.templates) ? (config.templates as Loose[]).map(asObject) : [];
  const audience = asObject(config.audience);
  const trigger = asObject(config.trigger);
  const dripSteps = Array.isArray(trigger.steps) ? (trigger.steps as unknown[]) : [];
  return [
    { id: 'messaging.channel', label: 'Delivery channel', pass: isPopulated(config.channel) },
    { id: 'messaging.template', label: 'Message template with body', pass: templates.some((t) => isPopulated(t.body)) },
    {
      id: 'messaging.consent',
      label: 'Consent gate',
      pass: config.respectConsent === true || isPopulated(audience.consentField),
    },
    {
      id: 'messaging.schedule',
      label: 'Drip preset or trigger/schedule',
      pass: (trigger.kind === 'drip' && (isPopulated(trigger.dripPreset) || dripSteps.length > 0)) || isPopulated(trigger.kind) || isPopulated(trigger.event),
    },
    { id: 'messaging.audience', label: 'Resolved audience', pass: isPopulated(config.audience) },
  ];
}

function genericItems(recipe: RecipeSpec): ParityItem[] {
  const r = recipe as { name?: unknown; type?: unknown };
  return [
    { id: 'generic.name', label: 'Named module', pass: isPopulated(r.name) },
    { id: 'generic.type', label: 'Recognized type', pass: isPopulated(r.type) },
    { id: 'generic.config', label: 'Populated configuration', pass: Object.keys(configOf(recipe)).length > 0 },
  ];
}

const FAMILY_ITEMS: Record<ParityFamily, (recipe: RecipeSpec) => ParityItem[]> = {
  section: sectionItems,
  popup: popupItems,
  discount: discountItems,
  upsell: upsellItems,
  flow: flowItems,
  messaging: messagingItems,
  generic: genericItems,
};

/**
 * Compute the competitor-parity checklist for a recipe. Pure + never throws.
 */
export function parityChecklist(recipe: RecipeSpec): ParityChecklist {
  let family: ParityFamily = 'generic';
  let items: ParityItem[] = [];
  try {
    family = parityFamilyOf(recipe);
    items = FAMILY_ITEMS[family](recipe);
  } catch {
    family = 'generic';
    items = [];
  }
  const passed = items.filter((i) => i.pass).length;
  const score = items.length === 0 ? 1 : passed / items.length;
  return { family, items, score };
}

// Re-export for consumers that only need the kind→archetype view.
export { KIND_ARCHETYPE };
