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
import type { ModuleType } from '@superapp/core';
import { getCapabilityNode, type CapabilitySurface } from '@superapp/core';

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
