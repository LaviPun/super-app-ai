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
 * Which composite kinds land fully on shipped runtime in this increment vs which
 * are modeled (record + real display/redeem surfaces + typed store) with their
 * background/enforcement engine deferred to R3.5 (loyalty accrual, subscription
 * advancement). This is the honesty fence (design §5c/§5d, plan X-4) — a caller
 * can read it to know what is enforced vs a documented follow-up.
 */
export const COMPOSITE_KIND_REALITY: Record<CompositeKind, 'full' | 'record-and-surfaces-only'> = {
  'product-bundle': 'full',
  'cart-drawer': 'full',
  'loyalty-ledger': 'record-and-surfaces-only', // accrual/expiry engine → R3.5
  'subscription-contract': 'record-and-surfaces-only', // contract-mirror + cron → R3.5
};
