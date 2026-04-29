import type { RecipeSpec } from '@superapp/core';
import type { AdminBlockPayload, CompileResult } from './types';

export function compileAdminBlock(
  spec: Extract<RecipeSpec, { type: 'admin.block' }>,
): CompileResult {
  const payload: AdminBlockPayload = {
    type: spec.type,
    name: spec.name,
    target: spec.config.target,
    label: spec.config.label,
    config: spec.config as unknown as Record<string, unknown>,
  };

  return {
    ops: [{ kind: 'AUDIT', action: 'compile.admin.block' }],
    compiledJson: JSON.stringify({ target: spec.config.target }),
    adminBlockPayload: payload,
  };
}
