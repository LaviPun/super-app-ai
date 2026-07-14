/**
 * Module manifests (Module System v2). A manifest lists the control packs that
 * compose a module type, split into Basic and Advanced tiers. This replaces the
 * hand-written per-type config schema with a thin, declarative composition.
 *
 * `theme.section` is the generic, unrestricted storefront type and carries the
 * full pack surface; collapsed kinds (banner, popup, notification-bar, …) compose
 * from the same manifest. Remaining types are migrated incrementally.
 */
import type { ModuleType } from '../allowed-values.js';
import type { ModuleManifest } from './types.js';

const MANIFESTS: Partial<Record<ModuleType, ModuleManifest>> = {
  'theme.section': {
    type: 'theme.section',
    // `layout-archetype` (R2.5) carries the per-type `layout` enum; its option-set
    // is supplied by the module type via the catalog in `type-enums.ts`.
    packs: ['content', 'style', 'layout-archetype', 'trigger', 'page-targeting', 'frequency-cap', 'countdown', 'behavior'],
    // Advanced tier unlocks audience targeting, scheduling/day-parting, the merchant
    // condition primitive (R2.1 `rule-engine`), the product-recommendation source
    // (R2.3 `recommendation`), and the custom-code escape hatch.
    advancedPacks: ['audience', 'schedule', 'rule-engine', 'recommendation', 'advanced-custom'],
  },

  // Function types that carry the R2.2 `pricing` control pack (plan 1c). They
  // compose NO basic control packs — their core config (`rules[]` / `bundles[]`)
  // is hand-written zod on the recipe branch, not pack-derived — so
  // `mustHaveControlsForType(type, 'basic')` stays `[]`, byte-identical to before
  // these manifests existed. `pricing` rides at the ADVANCED tier purely so
  // `resolveTypeEnumsForType` surfaces its per-type `mechanism` enum: the catalog
  // in `type-enums.ts` restricts `mechanism` to the ONE real runtime each type
  // lowers into (drops the declarative-only mechanisms from generation). Nothing
  // else keys off these manifests — the sole reader, `requirement-spec.server.ts`,
  // only derives `mustHaveControls`, which is unchanged at the default (basic) tier.
  'functions.discountRules': {
    type: 'functions.discountRules',
    packs: [],
    advancedPacks: ['pricing'],
  },
  'functions.cartTransform': {
    type: 'functions.cartTransform',
    packs: [],
    advancedPacks: ['pricing'],
  },

  // Storefront app-proxy widget (plan 3a). The ONLY control pack its recipe branch
  // pins is `rule-engine` (`config.ruleEngine`); the branch-level `style`/`placement`
  // are `StorefrontStyleSchema`/`PlacementSchema`, NOT control packs, so they are not
  // listed. `rule-engine` rides at ADVANCED (mirrors theme.section — display rules are
  // an opt-in), so `mustHaveControls(basic)` stays `[]` (byte-identical to no manifest).
  // rule-engine declares no `typeEnums`, so this surfaces no per-type enum today; the
  // manifest exists so the type participates honestly in the pack-composition system.
  'proxy.widget': {
    type: 'proxy.widget',
    packs: [],
    advancedPacks: ['rule-engine'],
  },

  // Buyer-facing checkout/post-purchase types (plan 3a). Each pins the R2.3
  // `recommendation` pack (`config.recommendation`) — the branch-level `style` is
  // `StorefrontStyleSchema`, not a control pack. The catalog in `type-enums.ts`
  // restricts `recommendation.strategy` to the STATIC six on these surfaces (no
  // App-Proxy access → dynamic strategies always degrade to `fallback`).
  //
  // Tiering divergence is intentional and per-type: for an upsell/offer the product
  // source IS the core control a typical module populates, so `recommendation` is
  // BASIC (mustHaveControls → ['recommendation'], a beneficial solution-search boost).
  // A checkout.block is a generic info/content block where recommendation is an opt-in
  // enhancement, so it rides ADVANCED (mustHaveControls basic stays []). Either tier is
  // walked by `resolveTypeEnumsForType`, so the strategy restriction applies to all three.
  'checkout.upsell': {
    type: 'checkout.upsell',
    packs: ['recommendation'],
  },
  'checkout.block': {
    type: 'checkout.block',
    packs: [],
    advancedPacks: ['recommendation'],
  },
  'postPurchase.offer': {
    type: 'postPurchase.offer',
    packs: ['recommendation'],
  },
};

/**
 * Returns the manifest for a module type, or undefined if not yet migrated.
 *
 * The composer/v2-form layer that this once fed was pruned in phase #3 R2.4;
 * the sole remaining consumer is `requirement-spec.server.ts`, which reads a
 * type's pack set to derive the deterministic `mustHaveControls` list.
 */
export function getManifest(type: ModuleType): ModuleManifest | undefined {
  return MANIFESTS[type];
}
