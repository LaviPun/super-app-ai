import type { RecipeSpec } from '@superapp/core';
import type { AdminPrintPayload, CompileResult } from './types';

/**
 * Compile an admin.print module (`admin_print` / Print Action Extension API).
 *
 * Produces a custom printable document (packing slip / invoice / label / pick list)
 * for orders and products. The shipped admin-print extension (extensions/admin-print)
 * registers the four print-action targets and renders an `s-admin-print-action` whose
 * `src` points at the app's `/admin-print/document` route. Publishing persists the
 * documentKind/title/subtitle/bodyTemplate config to a `$app:superapp_admin_print`
 * metaobject referenced by superapp.admin/print_refs; the extension reads it at the
 * target to compute the print `src`, and the app route reads it to render the
 * document. A real deployable emit — not an AUDIT no-op.
 */
export function compileAdminPrint(
  spec: Extract<RecipeSpec, { type: 'admin.print' }>,
): CompileResult {
  const payload: AdminPrintPayload = {
    type: spec.type,
    name: spec.name,
    target: spec.config.target,
    label: spec.config.label,
    config: spec.config as unknown as Record<string, unknown>,
  };

  return {
    ops: [{ kind: 'AUDIT', action: 'compile.admin.print' }],
    compiledJson: JSON.stringify({ target: spec.config.target, documentKind: spec.config.documentKind }),
    adminPrintPayload: payload,
  };
}
