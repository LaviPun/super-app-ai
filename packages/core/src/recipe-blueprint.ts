/**
 * RecipeBlueprint — a named group of coordinated modules generated from one
 * merchant request. A blueprint is NOT a new module type: each member is a
 * normal `RecipeSpec`, so all existing validation / compile / deploy paths are
 * reused. The blueprint just bundles them with roles + human-readable links.
 *
 * Persisted by reusing the existing `Recipe` row (Recipe.modules) — see
 * apps/web/app/services/blueprints/blueprint.service.ts. Single-module
 * generation is unchanged; blueprints are an additive, flag-gated path.
 */
import { z } from 'zod';
import { RecipeSpecSchema, type RecipeSpec } from './recipe.js';
import { CAPABILITIES } from './capabilities.js';

const KNOWN_CAPABILITIES = new Set<string>(CAPABILITIES);

/** A single member of a blueprint: a role label + why + the actual recipe. */
export const BlueprintModuleSchema = z.object({
  /** Stable role within the blueprint, e.g. "cart-merge", "bundle-builder-ui". */
  role: z.string().min(1).max(60),
  /** 1-2 sentences on what this member does and how it coordinates. */
  explanation: z.string().min(1).max(400),
  recipe: RecipeSpecSchema,
});
export type BlueprintModule = z.infer<typeof BlueprintModuleSchema>;

/** Human-readable coordination note between two roles (not auto-wired yet). */
export const BlueprintLinkSchema = z.object({
  fromRole: z.string().min(1).max(60),
  toRole: z.string().min(1).max(60),
  note: z.string().min(1).max(280),
});
export type BlueprintLink = z.infer<typeof BlueprintLinkSchema>;

export const RecipeBlueprintSchema = z.object({
  name: z.string().min(3).max(80),
  summary: z.string().min(1).max(280),
  modules: z.array(BlueprintModuleSchema).min(1).max(6),
  links: z.array(BlueprintLinkSchema).optional(),
});
export type RecipeBlueprint = z.infer<typeof RecipeBlueprintSchema>;

export type BlueprintCoherenceResult = {
  ok: boolean;
  issues: string[];
};

/**
 * Validate that a blueprint hangs together: parses, ≥1 member, roles unique,
 * every member recipe is a valid RecipeSpec, capabilities are known, and any
 * link references real roles. Pure — safe to run anywhere.
 */
export function validateBlueprintCoherence(input: unknown): BlueprintCoherenceResult {
  const issues: string[] = [];

  const parsed = RecipeBlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  const bp = parsed.data;

  const roles = bp.modules.map((m) => m.role);
  const dupRoles = roles.filter((r, i) => roles.indexOf(r) !== i);
  if (dupRoles.length) issues.push(`Duplicate roles: ${[...new Set(dupRoles)].join(', ')}.`);

  bp.modules.forEach((m, idx) => {
    const recipeCheck = RecipeSpecSchema.safeParse(m.recipe);
    if (!recipeCheck.success) {
      issues.push(`Module "${m.role || idx}" recipe is invalid: ${recipeCheck.error.issues[0]?.message ?? 'parse failed'}.`);
      return;
    }
    const requires = (recipeCheck.data as RecipeSpec).requires ?? [];
    for (const cap of requires) {
      if (!KNOWN_CAPABILITIES.has(cap)) issues.push(`Module "${m.role}" requires unknown capability "${cap}".`);
    }
  });

  for (const link of bp.links ?? []) {
    if (!roles.includes(link.fromRole)) issues.push(`Link fromRole "${link.fromRole}" is not a module role.`);
    if (!roles.includes(link.toRole)) issues.push(`Link toRole "${link.toRole}" is not a module role.`);
  }

  return { ok: issues.length === 0, issues };
}
