/**
 * Composite record resolver (Phase #4 · R3.1 — the flagship).
 *
 * At publish, a composite blueprint provisions its ONE authoritative record
 * BEFORE any member publishes, so every bound member injects against a resolved
 * record (not the placeholder GIDs the generator emitted). This module is the
 * per-backing dispatch that turns a `CompositeRecord` into a `ResolvedCompositeRecord`.
 *
 * ONE canonical path per substrate piece — this file reuses, never reimplements:
 *  - product-bundle / APP_METAFIELD → the shipped `BundleProductService`
 *    (`resolveComponents` → `ensureParentBundleProduct` → `resolveBundleWithPricing`),
 *    exactly the chain R3.2's co-deploy uses. The `$app:bundle_config` write +
 *    cart-transform activation stay in `publishBlueprint` so the C4 dual-writer
 *    ordering (publish THEN activate) is enforced in one place.
 *  - loyalty-ledger / DATA_STORE → R3.3's canonical `provisionModuleDataStore`
 *    (→ `ensureTypedStore`). The SAME writer the publish route uses (plan X-2), so
 *    a composite ledger and a plain module store never drift.
 *  - cart-drawer / LIVE_CART → no-op: the live Shopify cart IS the state.
 *  - subscription-contract / SHOPIFY_CONTRACT → modeled, NOT provisioned here.
 *    Contract-mirror + cron advancement need R3.5's durable layer (honesty fence,
 *    §5d). Resolves to a record with `deferred:true` and does NO admin writes.
 */
import type { CompositeRecord } from '@superapp/core';
import { COMPOSITE_KIND_REALITY } from '@superapp/core';
import {
  BundleProductService,
  bundleIdFromTitle,
  resolveBundleWithPricing,
  type ResolvedBundle,
} from '~/services/bundles/bundle-product.service';
import { provisionModuleDataStore } from '~/services/publish/provision-data-store.server';
import type { PublishService } from '~/services/publish/publish.service';

type AdminClient = ConstructorParameters<typeof PublishService>[0];

/**
 * A resolved shared record, ready to fan out into the bound members. The
 * `bindingKey` is the stable id stamped on runtime lines; `bundle` carries the
 * fully-wired `ResolvedBundle` for a product-bundle record (the thing
 * `injectResolvedRecord` injects into the display/enforcement members).
 */
export type ResolvedCompositeRecord = {
  ref: string;
  kind: CompositeRecord['kind'];
  backing: CompositeRecord['backing'];
  /** Stable id stamped on runtime lines (`entityMap.bindingKey`), when declared. */
  bindingKey?: string;
  /** Resolved bundle (product-bundle only) — real component + parent BAP GIDs. */
  bundle?: ResolvedBundle;
  /** Provisioned typed-store key (DATA_STORE only). */
  storeKey?: string;
  /**
   * True when this kind is modeled but its background/enforcement engine is a
   * documented R3.5 follow-up (loyalty accrual, subscription advancement). The
   * record + surfaces are real; automated earning/dunning is NOT wired here.
   */
  deferred: boolean;
};

/** Options carried into resolution (shopId is needed for DATA_STORE provisioning). */
export type ResolveRecordDeps = {
  shopId?: string;
  /** Stable id used to derive the typed-store key when the record omits one. */
  moduleId?: string;
};

/**
 * Resolve one composite record for publish. Dispatches on `kind`. Fails LOUD on a
 * bundle that resolves `< 2` components (mirrors R3.2's fail-closed discipline —
 * never a silent placeholder deploy). Returns the resolved record the caller
 * injects into bound members.
 */
export async function resolveCompositeRecord(
  admin: AdminClient,
  record: CompositeRecord,
  deps: ResolveRecordDeps = {},
): Promise<ResolvedCompositeRecord> {
  const deferred = COMPOSITE_KIND_REALITY[record.kind] === 'record-and-surfaces-only';
  const bindingKey = record.entityMap?.bindingKey;

  switch (record.backing) {
    case 'APP_METAFIELD': {
      // product-bundle: wrap the shipped BundleProductService end-to-end.
      const bundle = await resolveBundleRecord(admin, record);
      return { ref: record.ref, kind: record.kind, backing: record.backing, bindingKey, bundle, deferred };
    }

    case 'DATA_STORE': {
      // loyalty-ledger (and any DATA_STORE-backed record): provision the typed
      // store via R3.3's canonical writer — the SAME path the publish route uses.
      let storeKey: string | undefined;
      if (deps.shopId && record.dataModel) {
        const result = await provisionModuleDataStore(deps.shopId, deps.moduleId ?? record.ref, {
          label: labelForRecord(record),
          description: `Composite record for "${record.ref}" (${record.kind}).`,
          key: record.ref.replace(/-/g, '_').slice(0, 40),
          schema: record.dataModel,
        });
        storeKey = result?.storeKey;
      }
      return { ref: record.ref, kind: record.kind, backing: record.backing, bindingKey, storeKey, deferred };
    }

    case 'LIVE_CART':
      // cart-drawer: the live cart IS the state. Nothing to provision.
      return { ref: record.ref, kind: record.kind, backing: record.backing, bindingKey, deferred };

    case 'SHOPIFY_CONTRACT':
      // subscription-contract: modeled only. Contract-mirror + cron advancement
      // are an explicit R3.5 follow-up — NO admin write here (honesty fence §5d).
      return { ref: record.ref, kind: record.kind, backing: record.backing, bindingKey, deferred: true };
  }
}

/**
 * Resolve a product-bundle record's `entityMap` (component SKUs) into a fully-wired
 * `ResolvedBundle`, reusing the shipped BundleProductService. Fails loud on `< 2`
 * resolved components. Threads any `discountPercentage`/pricing scalar from the
 * record's `dataModel` is NOT done here — pricing lives on the cart-transform
 * member's config and is lowered by `resolveBundleForBlueprint`/co-deploy; this
 * resolver only produces the bundle-identity triangle (id + parent + components).
 */
async function resolveBundleRecord(
  admin: AdminClient,
  record: CompositeRecord,
): Promise<ResolvedBundle | undefined> {
  const entries = record.entityMap?.entries ?? [];
  const componentSkus = entries.filter((e) => e.role === 'component').map((e) => e.ref);
  if (componentSkus.length === 0) return undefined; // nothing to resolve → co-deploy resolves via the member

  const svc = new BundleProductService(admin);
  const components = await svc.resolveComponents(componentSkus);
  if (components.length < 2) {
    throw new Error(
      `Composite record "${record.ref}": only ${components.length}/${componentSkus.length} component SKUs resolved to store variants.`,
    );
  }

  const title = labelForRecord(record);
  const bundleId = bundleIdFromTitle(record.ref);
  const parentVariantId = await svc.ensureParentBundleProduct({ bundleId, title, components });
  const base: ResolvedBundle = { bundleId, title, parentVariantId, discountPercentage: 0, components };
  return resolveBundleWithPricing(base, undefined);
}

/** A human label for the record (from a `label`-ish dataModel field, else the ref). */
function labelForRecord(record: CompositeRecord): string {
  return record.ref.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
