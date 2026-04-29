import type { RecipeSpec } from '@superapp/core';
import type { AdminActionPayload, CompileResult } from './types';

export function compileAdminAction(
  spec: Extract<RecipeSpec, { type: 'admin.action' }>,
): CompileResult {
  const payload: AdminActionPayload = {
    type: spec.type,
    name: spec.name,
    target: spec.config.target,
    label: spec.config.label,
    title: spec.config.title ?? spec.config.label,
    config: spec.config as unknown as Record<string, unknown>,
  };

  return {
    ops: [{ kind: 'AUDIT', action: 'compile.admin.action' }],
    compiledJson: JSON.stringify({ target: spec.config.target }),
    adminActionPayload: payload,
  };
}
