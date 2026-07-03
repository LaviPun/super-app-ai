import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * Compile a local-pickup delivery-option generator Function (BOPIS). Emits a REAL
 * `FUNCTION_CONFIG_UPSERT` (functionKey `localPickupDeliveryOption`), so the config reaches
 * the `$app:superapp_function_config` metaobject (handle
 * `superapp-fn-localPickupDeliveryOption`) the wasm Function reads — backed by the
 * extensions/superapp-local-pickup crate.
 *
 * HONESTY: the Local Pickup Delivery Option Generator API is currently only available on
 * Shopify's `unstable` API version (NOT 2026-04; verified 2026-07-04 via the dev MCP). The
 * eligibility registry therefore classifies `functions.localPickupDeliveryOption`
 * `needs_runtime`, and publish preflight gates it — so this config is written but the type
 * does not report as deployable until the API ships on a stable version the app adopts and
 * the `superapp-local-pickup` handle is added to the deployed-function manifest. Compiling
 * config here (not a bare AUDIT) keeps the pipeline real end-to-end for that day.
 */
export function compileLocalPickupDeliveryOption(
  spec: Extract<RecipeSpec, { type: 'functions.localPickupDeliveryOption' }>,
): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'localPickupDeliveryOption', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.localPickupDeliveryOption' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-localPickupDeliveryOption' }),
  };
}
