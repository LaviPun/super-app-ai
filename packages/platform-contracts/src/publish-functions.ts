import { z } from 'zod';

/**
 * Publish + Functions reliability contracts (WS5 / specs/026-publish-functions-reliability).
 *
 * Codifies three things:
 *  1. The **two-layer Functions deployment contract** — (a) a wasm extension that
 *     ships via `shopify app deploy` (build/CI), and (b) the per-module config the
 *     app writes to a metaobject the function reads at runtime.
 *  2. **Preflight** — a module whose function type has no deployed extension behind
 *     it must fail publish loudly, not silently AUDIT.
 *  3. **Idempotent republish** — upsert (not duplicate) the metaobject/config; the
 *     republish diff drives the in-place update.
 *
 * Source of truth: this file. Documented by
 * `specs/026-publish-functions-reliability/contracts/publish-functions.md`.
 */

/**
 * The two-layer Functions deployment contract for one function type.
 *  - `extensionHandle` + `wasmDeployed` = layer (a), the shipped wasm extension.
 *  - `configMetaobjectType` = layer (b), the metaobject the function reads at runtime.
 */
export const FunctionDeploymentContractSchema = z.object({
  functionType: z.string().min(1),
  /** Handle of the `extensions/` entry that ships the wasm via `shopify app deploy`. */
  extensionHandle: z.string().min(1),
  /** Whether the wasm extension is actually deployed behind this module. */
  wasmDeployed: z.boolean(),
  /** Metaobject type the app upserts per-module config into; the function reads it at runtime. */
  configMetaobjectType: z.string().min(1),
});
export type FunctionDeploymentContract = z.infer<typeof FunctionDeploymentContractSchema>;

export const MODULE_PUBLISH_PREFLIGHT_STATUSES = ['deployable', 'needs_runtime', 'gated', 'blocked'] as const;
export const ModulePublishPreflightStatusSchema = z.enum(MODULE_PUBLISH_PREFLIGHT_STATUSES);
export type ModulePublishPreflightStatus = (typeof MODULE_PUBLISH_PREFLIGHT_STATUSES)[number];

/**
 * Result of preflighting one module for publish (extension-eligibility model —
 * see @superapp/core extension-eligibility.ts).
 *  - `deployable`    — the backing runtime is shipped; publish writes config it reads.
 *  - `needs_runtime` — the runtime extension/wasm is not shipped yet; publish must
 *                      fail loudly with `reasons` (the only genuinely non-deployable case).
 *  - `gated` / `blocked` — legacy statuses kept for wire compatibility with older
 *                      persisted results; the classifier no longer emits them.
 */
export const ModulePublishPreflightResultSchema = z.object({
  moduleType: z.string().min(1),
  status: ModulePublishPreflightStatusSchema,
  reasons: z.array(z.string().min(1)).default([]),
  /** For function types: the extension that must be present to deploy. */
  requiresExtension: z.string().min(1).optional(),
  /** True only when the module will actually deploy something. */
  willDeploy: z.boolean(),
});
export type ModulePublishPreflightResult = z.infer<typeof ModulePublishPreflightResultSchema>;

export const REPUBLISH_ACTIONS = ['create', 'update', 'noop', 'delete'] as const;
export const RepublishActionSchema = z.enum(REPUBLISH_ACTIONS);
export type RepublishAction = (typeof REPUBLISH_ACTIONS)[number];

/**
 * Idempotent republish diff: upsert (not duplicate) the config metaobject.
 * `action: 'noop'` when nothing changed; `'create'` on first publish; `'update'`
 * in place by `metaobjectId`; `'delete'` on unpublish.
 */
export const RepublishDiffSchema = z.object({
  moduleType: z.string().min(1),
  metaobjectType: z.string().min(1),
  /** Stable id used to upsert in place (absent ⇒ create). */
  metaobjectId: z.string().min(1).optional(),
  action: RepublishActionSchema,
  changedFields: z.array(z.string().min(1)).default([]),
});
export type RepublishDiff = z.infer<typeof RepublishDiffSchema>;

/**
 * Compute an idempotent republish diff. Pure — the upsert/no-duplicate invariant
 * (SC-002) lives here so create→republish→unpublish is provable in a test.
 */
export function computeRepublishDiff(input: {
  moduleType: string;
  metaobjectType: string;
  existing?: { metaobjectId: string; config: Record<string, unknown> } | null;
  next: Record<string, unknown> | null;
}): RepublishDiff {
  const { moduleType, metaobjectType, existing, next } = input;

  // Unpublish: remove the existing metaobject.
  if (next === null) {
    return RepublishDiffSchema.parse({
      moduleType,
      metaobjectType,
      metaobjectId: existing?.metaobjectId,
      action: existing ? 'delete' : 'noop',
      changedFields: [],
    });
  }

  // First publish: create.
  if (!existing) {
    return RepublishDiffSchema.parse({
      moduleType,
      metaobjectType,
      action: 'create',
      changedFields: Object.keys(next),
    });
  }

  // Republish: update in place by id; noop when nothing changed.
  const changedFields: string[] = [];
  const keys = new Set([...Object.keys(existing.config), ...Object.keys(next)]);
  for (const key of keys) {
    if (JSON.stringify(existing.config[key]) !== JSON.stringify(next[key])) {
      changedFields.push(key);
    }
  }
  return RepublishDiffSchema.parse({
    moduleType,
    metaobjectType,
    metaobjectId: existing.metaobjectId,
    action: changedFields.length === 0 ? 'noop' : 'update',
    changedFields,
  });
}
