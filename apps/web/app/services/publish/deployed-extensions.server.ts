/**
 * Deployed Layer-A extension manifest — the single source of truth for which
 * Shopify Function extensions are actually shipped via `shopify app deploy`.
 *
 * The two-layer Functions contract (see `publish-preflight.server.ts`) refuses
 * to report a `functions.*` module as published unless its wasm extension is
 * deployed. Previously the deployed set came ONLY from an operator-set env var
 * (`SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS`), which is easy to forget and lets a
 * composite (e.g. a product bundle) plan a function member that can never
 * publish. This manifest pins the handles that exist in `extensions/` so
 * deployability tracks the repo, and a guardrail test
 * (`__tests__/blueprint-deployability.test.ts`) asserts:
 *   1. every handle here is a real `extensions/<dir>/shopify.extension.toml`
 *      with `type = "function"`, and
 *   2. every blueprint-catalog member type is `deployable`.
 *
 * Adding a new Function extension = add its handle here (+ ship it). That makes
 * every module type it backs deployable everywhere at once.
 */

/** Function extension handles shipped in `extensions/` (type = "function"). */
export const DEPLOYED_FUNCTION_EXTENSION_HANDLES = [
  'cart-transform-function',
  'discount-function',
  // Built + function-runner tested (config-driven via $app metafield); each runs
  // on Shopify Plus per the eligibility registry's plan note.
  'superapp-delivery-customization',
  'superapp-payment-customization',
  'superapp-cart-checkout-validation',
  'superapp-fulfillment-constraints',
] as const;

/**
 * The effective deployed-function set: the checked-in manifest UNION any handles
 * declared by the operator via `SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS` (kept for
 * forward-compatibility / staged rollouts).
 */
export function deployedFunctionExtensions(): Set<string> {
  const raw = process.env.SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS ?? '';
  const fromEnv = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return new Set<string>([...DEPLOYED_FUNCTION_EXTENSION_HANDLES, ...fromEnv]);
}
