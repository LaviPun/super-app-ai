import type { RecipeSpec } from '@superapp/core';
import type { AdminSegmentTemplatePayload, CompileResult } from './types';

/**
 * Compile an admin.segmentTemplate module
 * (admin.customers.segmentation-templates.data).
 *
 * Returns pre-built customer-segment query templates into the segment editor's
 * template gallery. The shipped segment-template extension
 * (extensions/admin-segment-template) registers the single data target and returns the
 * published templates verbatim. Publishing persists the templates to a
 * `$app:superapp_admin_segment_template` metaobject referenced by
 * superapp.admin/segment_template_refs, which the extension reads at the target.
 */
export function compileAdminSegmentTemplate(
  spec: Extract<RecipeSpec, { type: 'admin.segmentTemplate' }>,
): CompileResult {
  const payload: AdminSegmentTemplatePayload = {
    type: spec.type,
    name: spec.name,
    target: spec.config.target,
    config: spec.config as unknown as Record<string, unknown>,
  };

  return {
    ops: [{ kind: 'AUDIT', action: 'compile.admin.segmentTemplate' }],
    compiledJson: JSON.stringify({ target: spec.config.target, templateCount: spec.config.templates.length }),
    adminSegmentTemplatePayload: payload,
  };
}
