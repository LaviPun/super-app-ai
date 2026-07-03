/**
 * Composite record + member bindings (Phase #4 · R3.1 — the flagship).
 *
 * A *composite* is the thing a flat single-module `RecipeSpec` cannot express:
 * ONE authoritative record (a deal / cart / ledger / contract) + N thin render
 * surfaces + a checkout-time enforcement Function, all referencing the SAME
 * entity id. The classic failure a composite prevents is *display ≠ enforcement*
 * drift — a PDP bundle widget showing one price while checkout charges another,
 * because the two surfaces re-derive the deal independently instead of reading
 * one record.
 *
 * These shapes are the shared-record ENVELOPE that hangs off `RecipeBlueprint`
 * (see recipe-blueprint.ts). A blueprint with no `sharedRecords`/`bindings` is
 * byte-for-byte today's flat bag — everything here is additive + optional.
 *
 * Boundary (R-4): `dataModel` types the record's SCALAR fields (pricing knobs,
 * labels, thresholds — reusing `DataModelSchema`); `entityMap` types the
 * cross-surface REFERENCE table (the component→BAP mapping for a bundle). They
 * are separate structures — never overload one for the other.
 */
import { z } from 'zod';
import { DataModelSchema } from './data-model.js';

/** The four irreducible composite archetypes (surface-matrix §67-97). */
export const COMPOSITE_KINDS = [
  'product-bundle',       // bundle: BAP + cart-transform + discount
  'cart-drawer',          // smart-cart: the live cart IS the record; rewards/gifts
  'loyalty-ledger',       // points ledger keyed to customer_id
  'subscription-contract', // selling-plan / contract advanced by cron (partial — §5d)
] as const;
export type CompositeKind = (typeof COMPOSITE_KINDS)[number];

/**
 * Where the authoritative record physically lives. Determines the provisioning
 * primitive at publish and the read path at runtime.
 *  - APP_METAFIELD: a `$app:<key>` json metafield on an app-owned owner
 *    (the bundle path today — `bundle-product.service.ts`). Read by Functions.
 *  - DATA_STORE: a typed `DataStore` row (`data-model.ts`) — first-party rows
 *    (loyalty ledger, subscriber list). Provisioned via the canonical
 *    `ensureTypedStore` writer (R3.3). Read by app-served surfaces.
 *  - SHOPIFY_CONTRACT: a native Shopify subscription contract + selling-plan
 *    group. Mirrored, not owned. (partial — §5d: modeled, not provisioned here.)
 *  - LIVE_CART: no persisted record; the live Shopify cart IS the state
 *    (cart-drawer). No provisioning.
 */
export const RECORD_BACKINGS = [
  'APP_METAFIELD', 'DATA_STORE', 'SHOPIFY_CONTRACT', 'LIVE_CART',
] as const;
export type RecordBacking = (typeof RECORD_BACKINGS)[number];

/** One author-time row of the cross-surface reference table (resolved at publish). */
export const EntityMapEntrySchema = z.object({
  /** Author-time reference resolved at publish → live GID (SKU / handle / tag). */
  ref: z.string().min(1).max(120),
  /** Role the referenced entity plays: 'component' | 'parent-bap' | 'gift' | … */
  role: z.string().min(1).max(40),
  qty: z.number().int().min(1).max(999).optional(),
}).strict();
export type EntityMapEntry = z.infer<typeof EntityMapEntrySchema>;

/**
 * The cross-surface reference table. For a bundle: the component→BAP mapping.
 * `bindingKey` is the stable id stamped on runtime lines
 * (`_superapp_bundle_id`, `_superapp_ledger_id`, …).
 */
export const EntityMapSchema = z.object({
  bindingKey: z.string().min(1).max(60),
  entries: z.array(EntityMapEntrySchema).max(100).default([]),
}).strict();
export type EntityMap = z.infer<typeof EntityMapSchema>;

/**
 * The authoritative record. `dataModel` (reused from data-model.ts) types its
 * scalar fields; `entityMap` types the cross-surface reference table. Every
 * member of the blueprint references this record by its `ref`.
 */
export const CompositeRecordSchema = z.object({
  /** Stable, blueprint-unique key. Every member references this. */
  ref: z.string().min(1).max(48).regex(/^[a-z][a-z0-9-]*$/,
    'recordRef must be kebab-case.'),
  kind: z.enum(COMPOSITE_KINDS),
  backing: z.enum(RECORD_BACKINGS),
  /** Typed scalar fields of the record (pricing knobs, labels, thresholds). */
  dataModel: DataModelSchema.optional(),
  /** Cross-surface reference table (component→BAP mapping for bundles). */
  entityMap: EntityMapSchema.optional(),
}).strict();
export type CompositeRecord = z.infer<typeof CompositeRecordSchema>;

/** How a blueprint member binds to the shared record. */
export const MEMBER_BINDING_ROLES = [
  'authoring',    // the admin/theme surface that edits the record
  'display',      // storefront render surface (reads record, shows price/avail)
  'enforcement',  // checkout-time Function (reproduces display authoritatively)
  'attribution',  // pixel/analytics keyed to bindingKey
] as const;
export type MemberBindingRole = (typeof MEMBER_BINDING_ROLES)[number];

/**
 * Where a `display` member reads product availability from. Load-bearing for the
 * inventory-source-correctness rule (fast-bundle.md:128): a bundle display
 * declaring `'components'` binds Sold-Out to REAL component inventory, never the
 * placeholder BAP product (the classic "Sold Out reads the dummy BAP" bug).
 */
export const AVAILABILITY_SOURCES = ['components', 'placeholder', 'none'] as const;
export type AvailabilitySource = (typeof AVAILABILITY_SOURCES)[number];

export const MemberBindingSchema = z.object({
  /** The blueprint member's stable role (matches BlueprintModule.role). */
  memberRole: z.string().min(1).max(60),
  recordRef: z.string().min(1).max(48),
  bindingRole: z.enum(MEMBER_BINDING_ROLES),
  /** Fields of the record this member consumes. */
  reads: z.array(z.string().min(1).max(60)).max(30).default([]),
  availabilitySource: z.enum(AVAILABILITY_SOURCES).default('none'),
}).strict();
export type MemberBinding = z.infer<typeof MemberBindingSchema>;

/**
 * The per-kind deterministic backing table. Backing is NOT model-chosen — it is
 * pinned per composite kind so a bundle always lands on the shipped
 * `$app:bundle_config` runtime and a ledger always lands on the typed store.
 * `validateBlueprintCoherence` re-asserts this so a hand-edited record cannot
 * drift onto the wrong runtime (design §4.2).
 */
export const COMPOSITE_KIND_BACKING: Record<CompositeKind, RecordBacking> = {
  'product-bundle': 'APP_METAFIELD',
  'cart-drawer': 'LIVE_CART',
  'loyalty-ledger': 'DATA_STORE',
  'subscription-contract': 'SHOPIFY_CONTRACT',
};

/**
 * The reality tag per composite kind — the honesty fence (design §5c/§5d).
 *
 *  - `full`: the whole composite lands on shipped runtime (bundle enforcement,
 *    cart-drawer rewards) — display == enforcement, nothing deferred.
 *  - `engine-real-shopify-api-gated`: the composite's background engine IS built
 *    and wired on the durable scheduler (R3.6 — loyalty accrual/expiry into the
 *    typed store; subscription contract-mirror + scheduled dunning/renewal
 *    reminders), but ONE terminal Shopify write it would ideally make is gated on
 *    a scope/API this build cannot reach and is a documented follow-up:
 *      · loyalty  → redemption ISSUANCE (a discount-code / gift-card mutation the
 *        workflow connector does not yet expose). Earning + expiry are real.
 *      · subscription → the actual Shopify BILLING CHARGE (SubscriptionContract +
 *        selling-plan + `write_own_subscription_contracts`). Mirror + reminders
 *        are real; NO charge is faked.
 *  - `record-and-surfaces-only`: modeled only (record + surfaces + typed store),
 *    no background engine. (No kind is in this state after R3.6.)
 *
 * A caller reads this to know what is enforced/automated vs a scoped follow-up.
 */
export type CompositeKindReality = 'full' | 'engine-real-shopify-api-gated' | 'record-and-surfaces-only';

export const COMPOSITE_KIND_REALITY: Record<CompositeKind, CompositeKindReality> = {
  'product-bundle': 'full',
  'cart-drawer': 'full',
  // R3.6 — accrual + expiry are REAL on the durable scheduler + typed store;
  // discount/gift-card redemption issuance stays a scoped Shopify-API follow-up.
  'loyalty-ledger': 'engine-real-shopify-api-gated',
  // R3.6 — contract-mirror + scheduled dunning/renewal reminders are REAL;
  // the actual Shopify subscription billing charge stays a scoped follow-up.
  'subscription-contract': 'engine-real-shopify-api-gated',
};

/**
 * Whether a composite kind's background/enforcement work is DEFERRED (nothing
 * automated) — as opposed to real-but-partially-Shopify-gated or fully shipped.
 * `resolveCompositeRecord` stamps this on the resolved record's `deferred` flag.
 * After R3.6 only a truly unimplemented engine would be `true`; loyalty and
 * subscription now have real engines (their Shopify-API tail is a follow-up, not
 * a deferred engine), so they are NOT deferred.
 */
export function isCompositeEngineDeferred(kind: CompositeKind): boolean {
  return COMPOSITE_KIND_REALITY[kind] === 'record-and-surfaces-only';
}
