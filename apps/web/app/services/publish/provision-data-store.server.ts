/**
 * Canonical typed-data-store provisioning writer (Phase #4 · R3.3).
 *
 * This is the ONE place the app funnels a module-declared typed data model into
 * `DataStoreService.ensureTypedStore` — the sole writer of `DataStore.schemaJson`.
 * Wiring it flips the fully-built-but-dark typed-form + write-time-validation
 * stack live (see `parseDataModel` / `createRecord` gate).
 *
 * Two callers, one path (X-2 in the phase plan): R3.3 calls it from the publish
 * route for a `spec.dataModel`; R3.1's `DATA_STORE`-backed composite record calls
 * the SAME function for its record so a composite ledger and a plain module store
 * never drift in key convention, `schemaJson` serialization, or additive merge.
 * Do NOT add a parallel provisioning path — reuse this one.
 */
import type { ModuleDataStore } from '@superapp/core';
import { DataStoreService, PREDEFINED_STORES } from '~/services/data/data-store.service';

export interface ProvisionResult {
  /** The normalized store key that was provisioned. */
  storeKey: string;
}

/**
 * The declared-model shape a caller hands in. Structurally the recipe `Base.dataModel`
 * (`ModuleDataStore`); accepted directly so both the publish route (`spec.dataModel`)
 * and R3.1's composite record can pass their own carrier without coupling to `RecipeSpec`.
 */
export type DeclaredDataModel = ModuleDataStore;

/**
 * Provision a module's declared typed data store.
 *
 * Idempotent + additive: re-publishing EXPANDS the schema (existing fields kept),
 * never drops/retypes — records written under the old schema stay valid
 * (see `DataStoreService.mergeSchemaAdditively`).
 *
 * @returns the provisioned store key, or `null` when nothing was provisioned
 *   (no declared model / empty field list). Never swallows a writer error — the
 *   caller owns the try/catch and the non-fatal policy.
 */
export async function provisionModuleDataStore(
  shopId: string,
  moduleId: string,
  dataModel: DeclaredDataModel | undefined | null,
  deps: { service?: DataStoreService } = {},
): Promise<ProvisionResult | null> {
  if (!dataModel || !dataModel.schema?.fields?.length) return null;

  // R-b: an explicit key must not collide with a predefined store (`product`,
  // `order`, …) — that would additively merge a module schema into a shared store.
  // Force the `module_` prefix for a colliding override; the default is already safe.
  let key = dataModel.key ?? `module_${moduleId}`;
  if (dataModel.key && PREDEFINED_STORES.some((s) => s.key === dataModel.key)) {
    key = `module_${moduleId}`;
  }

  const service = deps.service ?? new DataStoreService();
  const store = await service.ensureTypedStore(shopId, key, {
    label: dataModel.label,
    description: dataModel.description,
    // `parseDataModel`-compatible: JSON.parse → DataModelSchema.safeParse round-trips.
    schemaJson: JSON.stringify(dataModel.schema),
  });
  return { storeKey: store.key };
}
