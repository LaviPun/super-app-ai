import type { RecipeSpec } from '@superapp/core';
import type { AdminDiscountUiPayload, CompileResult } from './types';

/**
 * Compile an admin.discountUi module (Spring 2026 Discount UI Extension).
 *
 * The shipped discount-function-settings extension
 * (extensions/discount-function-settings) registers
 * admin.discount-details.function-settings.render. Publishing persists this config to a
 * `$app:superapp_admin_discount_ui` metaobject referenced by
 * superapp.admin/discount_ui_refs; the extension reads the config at the target,
 * renders the declared `fields[]` as a settings form (Polaris s-* function-settings),
 * and writes the merchant's values to the discount's `$app/function-configuration`
 * metafield — the exact shape the paired functions.discountRules Function reads. So
 * this is a real deployable emit, not an AUDIT no-op.
 */
export function compileAdminDiscountUi(
  spec: Extract<RecipeSpec, { type: 'admin.discountUi' }>,
): CompileResult {
  const payload: AdminDiscountUiPayload = {
    type: spec.type,
    name: spec.name,
    target: 'admin.discount-details.function-settings.render',
    config: spec.config as unknown as Record<string, unknown>,
  };

  return {
    ops: [{ kind: 'AUDIT', action: 'compile.admin.discountUi' }],
    compiledJson: JSON.stringify({ target: payload.target, functionHandle: spec.config.functionHandle ?? null }),
    adminDiscountUiPayload: payload,
  };
}
