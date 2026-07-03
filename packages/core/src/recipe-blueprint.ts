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
import {
  CompositeRecordSchema,
  MemberBindingSchema,
  COMPOSITE_KIND_BACKING,
  type CompositeRecord,
  type MemberBinding,
} from './composite-record.js';

const KNOWN_CAPABILITIES = new Set<string>(CAPABILITIES);

/** Member types that can play the checkout-time `enforcement` role (Functions). */
const ENFORCEMENT_MEMBER_TYPES = new Set<string>([
  'functions.cartTransform',
  'functions.discountRules',
  'functions.cartAndCheckoutValidation',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.fulfillmentConstraints',
  'functions.orderRoutingLocationRule',
]);

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
  // R3.1 — composites-as-manifests. Absent ⇒ today's flat bag (100% back-compat):
  // `validateBlueprintCoherence` short-circuits the composite rules when both are
  // undefined, and the co-deploy path treats the blueprint exactly as before.
  /** Authoritative shared records the members bind to (one deal/cart/ledger/contract). */
  sharedRecords: z.array(CompositeRecordSchema).max(4).optional(),
  /** How each member binds to a shared record (role + fields it reads). */
  bindings: z.array(MemberBindingSchema).max(24).optional(),
});
export type RecipeBlueprint = z.infer<typeof RecipeBlueprintSchema>;

export type BlueprintCoherenceResult = {
  ok: boolean;
  issues: string[];
  /**
   * Non-fatal advisories that do NOT fail coherence but surface a known-bad
   * pattern (e.g. a bundle display bound to placeholder inventory — the Fast
   * Bundle Sold-Out bug). Callers should log these; generation may re-prompt.
   */
  warnings: string[];
};

/**
 * Validate that a blueprint hangs together: parses, ≥1 member, roles unique,
 * every member recipe is a valid RecipeSpec, capabilities are known, any link
 * references real roles, and — when the blueprint carries a shared-record
 * manifest (R3.1) — the record/binding graph is coherent:
 *
 *  - every `binding.recordRef` names a real `sharedRecords[].ref`;
 *  - every `binding.memberRole` names a real member role;
 *  - each record's `backing` matches the deterministic per-kind pin (a bundle
 *    can't drift onto DATA_STORE, etc.);
 *  - each `product-bundle` record has ≥1 `enforcement` binding on a Function
 *    member (display alone can never enforce a price at checkout);
 *  - a `display` binding with `availabilitySource:'placeholder'` on a
 *    `product-bundle` record → a WARNING (the Fast Bundle Sold-Out bug —
 *    surfaced, never silently allowed).
 *
 * A blueprint with no `sharedRecords`/`bindings` short-circuits the composite
 * block entirely (back-compat). Pure — safe to run anywhere.
 */
export function validateBlueprintCoherence(input: unknown): BlueprintCoherenceResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const parsed = RecipeBlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.')}: ${i.message}`), warnings };
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

  // --- Composite shared-record coherence (R3.1). Skipped entirely when absent. ---
  if (bp.sharedRecords || bp.bindings) {
    validateCompositeCoherence(bp.sharedRecords ?? [], bp.bindings ?? [], bp.modules, issues, warnings);
  }

  return { ok: issues.length === 0, issues, warnings };
}

/**
 * The composite manifest coherence rules (R3.1). Mutates `issues`/`warnings`.
 * Pure over its inputs (member type is read from the parsed recipe).
 */
function validateCompositeCoherence(
  records: CompositeRecord[],
  bindings: MemberBinding[],
  modules: BlueprintModule[],
  issues: string[],
  warnings: string[],
): void {
  const recordByRef = new Map(records.map((r) => [r.ref, r]));
  const memberByRole = new Map(modules.map((m) => [m.role, m]));

  // Duplicate record refs would make binding resolution ambiguous.
  const refs = records.map((r) => r.ref);
  const dupRefs = refs.filter((r, i) => refs.indexOf(r) !== i);
  if (dupRefs.length) issues.push(`Duplicate sharedRecord refs: ${[...new Set(dupRefs)].join(', ')}.`);

  // Each record's backing must match the deterministic per-kind pin.
  for (const rec of records) {
    const pinned = COMPOSITE_KIND_BACKING[rec.kind];
    if (rec.backing !== pinned) {
      issues.push(`Record "${rec.ref}" (${rec.kind}) declares backing "${rec.backing}" but ${rec.kind} is pinned to "${pinned}".`);
    }
  }

  // Every binding must reference a real record + a real member.
  for (const b of bindings) {
    if (!recordByRef.has(b.recordRef)) {
      issues.push(`Binding for member "${b.memberRole}" references unknown record "${b.recordRef}".`);
    }
    if (!memberByRole.has(b.memberRole)) {
      issues.push(`Binding references unknown member role "${b.memberRole}".`);
    }
  }

  // product-bundle records need ≥1 enforcement binding on a Function member, and
  // a placeholder-inventory display is the Fast Bundle Sold-Out bug (warning).
  for (const rec of records) {
    if (rec.kind !== 'product-bundle') continue;
    const recBindings = bindings.filter((b) => b.recordRef === rec.ref);

    const hasEnforcement = recBindings.some((b) => {
      if (b.bindingRole !== 'enforcement') return false;
      const member = memberByRole.get(b.memberRole);
      return member != null && ENFORCEMENT_MEMBER_TYPES.has(member.recipe.type);
    });
    if (!hasEnforcement) {
      issues.push(`product-bundle record "${rec.ref}" has no enforcement binding on a Function member — display can't be enforced at checkout.`);
    }

    for (const b of recBindings) {
      if (b.bindingRole === 'display' && b.availabilitySource === 'placeholder') {
        warnings.push(`product-bundle display "${b.memberRole}" binds availability to the placeholder BAP, not real component inventory (Sold-Out bug). Prefer availabilitySource:'components'.`);
      }
    }
  }
}
