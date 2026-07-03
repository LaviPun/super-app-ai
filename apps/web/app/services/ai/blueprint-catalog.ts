/**
 * Blueprint catalog (Design System Bible follow-up / multi-module blueprints).
 *
 * Deterministic map: a classified merchant INTENT → the ordered set of module
 * ROLES needed to actually deliver it. This is the "how many modules are
 * required" decision, kept deterministic so it is predictable and unit-testable
 * without an API key. Intents NOT in this catalog stay single-module (current
 * behavior). Extend by adding entries — each member is a normal module type, so
 * generation/compile/deploy are unchanged.
 *
 * Seeded from the two probes that exposed the gap:
 *  - upsell.bundle_builder  → cart-transform + product-page builder UI + checkout display
 *  - promo.discount_reveal  → discount function + reveal popup
 */
import type { CompositeKind, ModuleType } from '@superapp/core';
import { COMPOSITE_KIND_BACKING, getCapabilityNode, type CapabilitySurface } from '@superapp/core';
import type { MemberBinding } from '@superapp/core';

export type PlannedModuleSpec = {
  /** Stable role within the blueprint. */
  role: string;
  moduleType: ModuleType;
  /** config.kind hint for theme.section members (recommendation only). */
  kindHint?: string;
  /** Required members must generate+validate or the blueprint is rejected. */
  required: boolean;
  /** Why this member exists — shown to the merchant + injected as context. */
  reason: string;
  /**
   * R2.3 — default recommendation-source hint for product-widget members. Injected
   * as generation context (prose) so a plain "add an upsell" prompt produces a
   * working `config.recommendation.strategy` instead of a blank product picker.
   * Deterministic per this file's contract; the model still emits the full pack.
   */
  recommendationHint?: string;
};

/**
 * R3.1 — declares that an intent produces a COMPOSITE (one authoritative shared
 * record + N bound render/enforcement surfaces), not just a flat bag of modules.
 * Deterministic per intent: the `kind` fixes the backing (via the pinned table),
 * the `bindings` map each member role to a `bindingRole`, and the record's scalar
 * `dataModel` + `bindingKey` are authored here — NOT model-chosen (design §4.2).
 */
export type BlueprintCompositeSpec = {
  /** Stable kebab record ref every member binds to. */
  recordRef: string;
  kind: CompositeKind;
  /** Stable id stamped on runtime lines (`_superapp_bundle_id`, …). */
  bindingKey: string;
  /** Per-member binding roles (memberRole must match a module role above). */
  bindings: Array<
    Pick<MemberBinding, 'memberRole' | 'bindingRole'> &
      Partial<Pick<MemberBinding, 'reads' | 'availabilitySource'>>
  >;
};

export type BlueprintCatalogEntry = {
  intent: string;
  /** Display name for the blueprint group. */
  name: string;
  /** One-line description of the whole solution. */
  summary: string;
  /** Role that anchors the group (drives Recipe.category, navigation). */
  primaryRole: string;
  modules: PlannedModuleSpec[];
  /** R3.1 — present ⇒ this intent is a composite; the manifest is derived from it. */
  composite?: BlueprintCompositeSpec;
};

const ENTRIES: BlueprintCatalogEntry[] = [
  {
    intent: 'upsell.bundle_builder',
    name: 'Product Bundle',
    summary: 'A complete product-bundle solution: cart merging, a product-page bundle UI, and a checkout display.',
    primaryRole: 'bundle-builder-ui',
    modules: [
      {
        role: 'bundle-builder-ui',
        moduleType: 'theme.section',
        kindHint: 'product-bundle',
        required: true,
        reason: 'Product-page UI where shoppers see and pick the bundle.',
        // R2.3 — default the FBT/upsell surface to a complementary strategy with a
        // safe fallback, so a bare "add an upsell" prompt yields a working strategy.
        recommendationHint:
          "Set config.recommendation = { strategy: 'complementary', productLimit: 3, fallback: 'related' } so the bundle surfaces frequently-bought-together products; only use strategy 'manual' with manualVariantGids if the merchant named specific products.",
      },
      {
        role: 'cart-merge',
        moduleType: 'functions.cartTransform',
        required: true,
        reason: 'Merges the bundle component SKUs into one cart line so it reads as a single product.',
      },
      {
        role: 'checkout-display',
        moduleType: 'checkout.block',
        required: false,
        reason: 'Shows the grouped bundle at checkout for a consistent presentation.',
      },
    ],
    // R3.1 — the bundle IS a composite: one product-bundle record + a display
    // surface + a checkout-time enforcement Function, all bound to the same id.
    composite: {
      recordRef: 'product-bundle',
      kind: 'product-bundle',
      bindingKey: '_superapp_bundle_id',
      bindings: [
        // Display binds Sold-Out to REAL component inventory (fixes the Fast
        // Bundle placeholder-availability bug).
        { memberRole: 'bundle-builder-ui', bindingRole: 'display', reads: ['discountPercentage', 'presentationMode'], availabilitySource: 'components' },
        // The cart-transform Function enforces the merge/price at checkout.
        { memberRole: 'cart-merge', bindingRole: 'enforcement', reads: ['presentationMode'] },
        // The checkout display reproduces the grouped bundle.
        { memberRole: 'checkout-display', bindingRole: 'display', reads: [], availabilitySource: 'none' },
      ],
    },
  },
  {
    intent: 'promo.discount_reveal',
    name: 'Discount Reveal',
    summary: 'A discount offer plus the popup that reveals and applies the code.',
    primaryRole: 'reveal-popup',
    modules: [
      {
        role: 'reveal-popup',
        moduleType: 'theme.section',
        kindHint: 'popup',
        required: true,
        reason: 'The popup that presents the offer and reveals the code with copy/confirmation.',
      },
      {
        role: 'discount-rule',
        moduleType: 'functions.discountRules',
        required: true,
        reason: 'The actual discount the popup hands out, enforced server-side.',
      },
    ],
  },
];

const BY_INTENT = new Map<string, BlueprintCatalogEntry>(ENTRIES.map((e) => [e.intent, e]));

/** The catalog entry for an intent, or undefined when it is single-module. */
export function getBlueprintCatalogEntry(intent?: string | null): BlueprintCatalogEntry | undefined {
  if (!intent) return undefined;
  return BY_INTENT.get(intent);
}

/** All intents that resolve to a multi-module blueprint (for docs/tests). */
export function blueprintIntents(): string[] {
  return ENTRIES.map((e) => e.intent);
}

/** Surface for a module type (THEME/FUNCTIONS/CHECKOUT/…) via the capability graph. */
export function surfaceForModuleType(moduleType: ModuleType): CapabilitySurface {
  return getCapabilityNode(moduleType).surface;
}

/**
 * The record's scalar `dataModel` per composite kind (R3.1). These are the
 * authored-once scalar knobs the display + enforcement surfaces both read
 * (pricing/labels/thresholds) — NOT the cross-surface `entityMap` refs. Pinned
 * here (not model-chosen) so display==enforcement always read the SAME fields.
 */
const COMPOSITE_DATA_MODEL: Record<CompositeKind, { fields: Array<{ name: string; type: 'text' | 'number' | 'select'; options?: string[]; required?: boolean }> }> = {
  'product-bundle': {
    fields: [
      { name: 'presentationMode', type: 'select', options: ['single-bap', 'multi-bap', 'cart-transform'], required: true },
      { name: 'discountPercentage', type: 'number', required: true },
    ],
  },
  'cart-drawer': {
    fields: [
      { name: 'rewardThreshold', type: 'number', required: true },
    ],
  },
  'loyalty-ledger': {
    fields: [
      { name: 'customerId', type: 'text', required: true },
      { name: 'points', type: 'number', required: true },
    ],
  },
  'subscription-contract': {
    fields: [
      { name: 'contractId', type: 'text', required: true },
    ],
  },
};

/**
 * R3.1 — build the shared-record MANIFEST (`{ sharedRecords, bindings }`) for a
 * composite intent, restricted to the roles that actually generated (so an
 * optional member that failed generation doesn't leave a dangling binding). The
 * backing is pinned per kind (never model-chosen); the record carries its scalar
 * `dataModel`; the `entityMap` starts empty (its rows — component SKUs — are
 * resolved at publish from the cart-transform member, or authored by the merchant).
 * Returns null when the intent is not a composite.
 */
export function buildCompositeManifest(
  entry: BlueprintCatalogEntry,
  presentRoles: Set<string>,
): { sharedRecords: unknown[]; bindings: unknown[] } | null {
  const spec = entry.composite;
  if (!spec) return null;

  const bindings = spec.bindings
    .filter((b) => presentRoles.has(b.memberRole))
    .map((b) => ({
      memberRole: b.memberRole,
      recordRef: spec.recordRef,
      bindingRole: b.bindingRole,
      reads: b.reads ?? [],
      availabilitySource: b.availabilitySource ?? 'none',
    }));

  const record = {
    ref: spec.recordRef,
    kind: spec.kind,
    backing: COMPOSITE_KIND_BACKING[spec.kind],
    dataModel: COMPOSITE_DATA_MODEL[spec.kind],
    entityMap: { bindingKey: spec.bindingKey, entries: [] as unknown[] },
  };

  return { sharedRecords: [record], bindings };
}
