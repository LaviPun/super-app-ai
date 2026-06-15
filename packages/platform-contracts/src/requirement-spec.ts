import { z } from 'zod';

/**
 * Requirements-first generation contracts (WS1 / specs/022-requirement-search-generation).
 *
 * A `RequirementSpec` is the structured intent extracted *before* generation —
 * deterministic-first (reusing IntentPacket + classify signals), escalating to a
 * single LLM call only when classifier confidence is low. Generation then fills
 * pack values against this spec rather than inventing the requirement.
 *
 * A `GenerationCoverageReport` records which `mustHaveControls` the generated
 * spec actually satisfied; < 100% coverage triggers the WS3 fill-missing action.
 *
 * Source of truth: this file. Documented by
 * `specs/022-requirement-search-generation/contracts/requirement-spec.md`.
 *
 * Note: this package does not depend on `@superapp/core`, so `moduleType` /
 * `surface` are validated as non-empty strings here; the app layer checks them
 * against `RECIPE_SPEC_TYPES` / `SHOPIFY_SURFACES`.
 */

export const REQUIREMENT_TIERS = ['basic', 'advanced'] as const;
export const RequirementTierSchema = z.enum(REQUIREMENT_TIERS);

/** A single data field the module needs to read or capture. */
export const RequirementDataNeedSchema = z.object({
  name: z.string().min(1),
  /** Free-form type hint (e.g. 'string', 'money', 'email', 'shopify:product'). */
  type: z.string().min(1),
  /** Whether the module reads this from Shopify or captures it from the shopper. */
  direction: z.enum(['read', 'capture']).default('read'),
  required: z.boolean().default(false),
});
export type RequirementDataNeed = z.infer<typeof RequirementDataNeedSchema>;

export const RequirementSpecSchema = z.object({
  /** One-sentence merchant goal. */
  goal: z.string().min(1),
  /** Target Shopify surface (validated against SHOPIFY_SURFACES app-side). */
  surface: z.string().min(1),
  /** Recommended RecipeSpec type (validated against RECIPE_SPEC_TYPES app-side). */
  moduleType: z.string().min(1),
  /** Control-pack / config keys the module must expose to satisfy the goal. */
  mustHaveControls: z.array(z.string().min(1)).default([]),
  dataNeeds: z.array(RequirementDataNeedSchema).default([]),
  /** Who the module targets (e.g. 'new visitors', 'VIP customers'). */
  audience: z.string().default(''),
  /** Behavioural triggers (e.g. 'exit_intent', 'scroll_50', 'on_load'). */
  triggers: z.array(z.string().min(1)).default([]),
  /** Measurable outcomes the merchant cares about. */
  successCriteria: z.array(z.string().min(1)).default([]),
  tier: RequirementTierSchema.default('basic'),
  /** How the spec was produced — deterministic reuse vs an LLM escalation. */
  source: z.enum(['deterministic', 'llm_escalated']).default('deterministic'),
});
export type RequirementSpec = z.infer<typeof RequirementSpecSchema>;

/** Per-control coverage result. */
export const CoverageControlSchema = z.object({
  control: z.string().min(1),
  present: z.boolean(),
});
export type CoverageControl = z.infer<typeof CoverageControlSchema>;

export const GenerationCoverageReportSchema = z.object({
  moduleType: z.string().min(1),
  controls: z.array(CoverageControlSchema).default([]),
  /** Count of satisfied mustHaveControls. */
  satisfied: z.number().int().nonnegative(),
  /** Total mustHaveControls required. */
  total: z.number().int().nonnegative(),
  /** satisfied / total, 0..1 (1 when total is 0). */
  ratio: z.number().min(0).max(1),
  /** True when ratio === 1. */
  complete: z.boolean(),
  /** Controls still missing — fed to WS3 fill-missing. */
  missing: z.array(z.string().min(1)).default([]),
});
export type GenerationCoverageReport = z.infer<typeof GenerationCoverageReportSchema>;

/**
 * Compute a coverage report from the required controls and the set of controls
 * the generated spec actually exposes. Pure — safe to unit test and reuse.
 */
export function computeCoverageReport(input: {
  moduleType: string;
  mustHaveControls: string[];
  presentControls: Iterable<string>;
}): GenerationCoverageReport {
  const present = new Set(input.presentControls);
  const controls = input.mustHaveControls.map((control) => ({
    control,
    present: present.has(control),
  }));
  const satisfied = controls.filter((c) => c.present).length;
  const total = controls.length;
  const missing = controls.filter((c) => !c.present).map((c) => c.control);
  const ratio = total === 0 ? 1 : satisfied / total;
  return GenerationCoverageReportSchema.parse({
    moduleType: input.moduleType,
    controls,
    satisfied,
    total,
    ratio,
    complete: ratio === 1,
    missing,
  });
}
