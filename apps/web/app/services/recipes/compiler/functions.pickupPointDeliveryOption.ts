import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * Compile a pickup-point delivery-option generator Function (parcel lockers / post
 * offices). Emits a REAL `FUNCTION_CONFIG_UPSERT` (functionKey
 * `pickupPointDeliveryOption`), so the config reaches the `$app:superapp_function_config`
 * metaobject (handle `superapp-fn-pickupPointDeliveryOption`) the wasm Function reads —
 * backed by the extensions/superapp-pickup-point crate.
 *
 * HONESTY: the Pickup Point Delivery Option Generator API is currently only available on
 * Shopify's `unstable` API version (NOT 2026-04; verified 2026-07-04 via the dev MCP). The
 * eligibility registry therefore classifies `functions.pickupPointDeliveryOption`
 * `needs_runtime`, and publish preflight gates it — so this config is written but the type
 * does not report as deployable until the API ships on a stable version the app adopts and
 * the `superapp-pickup-point` handle is added to the deployed-function manifest.
 */
export function compilePickupPointDeliveryOption(
  spec: Extract<RecipeSpec, { type: 'functions.pickupPointDeliveryOption' }>,
): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'pickupPointDeliveryOption', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.pickupPointDeliveryOption' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-pickupPointDeliveryOption' }),
  };
}
