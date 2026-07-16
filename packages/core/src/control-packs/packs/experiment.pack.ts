/**
 * `experiment` control pack — client-side A/B test (V-B B7, Zipify/Kaching-class).
 *
 * When `config.experiment.enabled`, the storefront runtime (superapp-modules.src.js
 * → `initExperiments`) buckets each visitor DETERMINISTICALLY (a hash of a
 * persistent per-browser key + the module id, split by the variant weights),
 * applies the variant's TEXT overrides to the already-rendered module (headline /
 * subheadline / CTA label / coupon code — text only, so there is zero layout
 * risk), and stamps `data-sa-variant="<id>"` on the module root so the analytics
 * pixel and any capture payload can attribute the outcome to a variant.
 *
 * v1 is exactly TWO variants whose `weight`s should sum to ~100 (design-QA warns
 * otherwise). ADDITIVE + back-compat: the pin is `.optional()` and the runtime
 * no-ops when `enabled` is false or `data-sa-exp` is absent, so a module without
 * an experiment renders byte-for-byte as before.
 */
import { z } from 'zod';
import type { ControlPack } from '../types.js';

/** Which interaction the experiment is trying to move (attribution hint only). */
export const EXPERIMENT_GOALS = ['click', 'submit', 'atc'] as const;

/** The text-only overrides a variant applies to the rendered module. */
export const ExperimentOverridesSchema = z.object({
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(200).optional(),
  ctaLabel: z.string().max(80).optional(),
  couponCode: z.string().max(40).optional(),
});

/** One variant: a stable id, an integer weight (1–99), and its text overrides. */
export const ExperimentVariantSchema = z.object({
  id: z.string().min(1).max(24),
  weight: z.number().int().min(1).max(99),
  overrides: ExperimentOverridesSchema.default({}),
});

export const ExperimentPackSchema = z.object({
  enabled: z.boolean().default(false),
  /** Exactly two variants for v1 (A/B). */
  variants: z.array(ExperimentVariantSchema).length(2),
  goal: z.enum(EXPERIMENT_GOALS).optional(),
});

export type ExperimentPack = z.infer<typeof ExperimentPackSchema>;
export type ExperimentVariant = z.infer<typeof ExperimentVariantSchema>;

export const experimentPack: ControlPack<typeof ExperimentPackSchema> = {
  id: 'experiment',
  namespace: 'experiment',
  label: 'A/B experiment',
  tier: 'advanced',
  schema: ExperimentPackSchema,
  uiSchema: {
    groupLabel: 'A/B experiment',
    order: ['enabled', 'variants', 'goal'],
    fields: {
      variants: { showWhen: { field: 'enabled', equals: true }, help: 'Exactly two variants; weights should sum to ~100. Overrides are text-only (headline / subheadline / CTA / coupon).' },
      goal: { showWhen: { field: 'enabled', equals: true }, help: 'What the test is moving — click / submit / add-to-cart (used for attribution).' },
    },
  },
};
