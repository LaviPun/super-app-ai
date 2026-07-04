import type { RecipeSpec } from '@superapp/core';
import type { AdminLinkPayload, CompileResult } from './types';

/**
 * Compile an admin.link module (`admin_link` extension type).
 *
 * A deep link from an admin resource page to a page of the app. This is a DISTINCT
 * Shopify extension type (`admin_link`), not a ui_extension: the deployed artifact is
 * a `[[extensions.targeting]] target + url` registration in the shipped admin-link
 * extension family (extensions/admin-link), and Shopify appends the store + selected
 * resource id to the URL at click time. Publishing persists the label/url/target to a
 * `$app:superapp_admin_link` metaobject referenced by superapp.admin/link_refs so the
 * app's link page (and any admin-link management UI) can resolve the destination. The
 * emitted `compiledJson` mirrors the toml registration shape.
 */
export function compileAdminLink(
  spec: Extract<RecipeSpec, { type: 'admin.link' }>,
): CompileResult {
  const payload: AdminLinkPayload = {
    type: spec.type,
    name: spec.name,
    target: spec.config.target,
    label: spec.config.label,
    url: spec.config.url,
    config: spec.config as unknown as Record<string, unknown>,
  };

  return {
    ops: [{ kind: 'AUDIT', action: 'compile.admin.link' }],
    // Mirror the admin_link toml registration (name/target/url) so publish + audits
    // can verify the deployed shape.
    compiledJson: JSON.stringify({ type: 'admin_link', name: spec.config.label, target: spec.config.target, url: spec.config.url }),
    adminLinkPayload: payload,
  };
}
