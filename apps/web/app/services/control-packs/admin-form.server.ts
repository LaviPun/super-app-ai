/**
 * Bridge: control-pack composition (core) → the admin-form shape SchemaForm
 * renders. Emits the SAME `{ schemaVersion, jsonSchema, uiSchema, defaults }`
 * contract the hydrate step produces (see hydrate-envelope.server.ts), so one
 * renderer serves both the v2 composer and AI-hydrated configs.
 */
import { composeConfig, hasManifest } from '@superapp/core';
import type { ModuleType } from '@superapp/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface AdminFormConfig {
  schemaVersion: string;
  jsonSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

/** Best-effort defaults: keep each pack's value that fully validates from `{}` (packs whose fields all have defaults). */
function deriveDefaults(packs: ReturnType<typeof composeConfig>['packs']): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const pack of packs) {
    const parsed = pack.schema.safeParse({});
    defaults[pack.namespace] = parsed.success ? parsed.data : {};
  }
  return defaults;
}

/**
 * Build the admin-form config for a v2 module type + tier.
 * Returns undefined when the type has no v2 manifest (caller falls back to v1).
 */
export function buildAdminFormConfig(
  type: ModuleType,
  tier: 'basic' | 'advanced' = 'basic',
): AdminFormConfig | undefined {
  if (!hasManifest(type)) return undefined;
  const composed = composeConfig(type, tier);
  const jsonSchema = zodToJsonSchema(composed.schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;

  return {
    schemaVersion: `v2-controlpacks-${tier}`,
    jsonSchema,
    uiSchema: composed.uiSchema as Record<string, unknown>,
    defaults: deriveDefaults(composed.packs),
  };
}
