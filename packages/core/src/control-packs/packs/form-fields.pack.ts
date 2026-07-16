/**
 * `form-fields` control pack — multi-step form / product-finder quiz (V-B B6).
 *
 * Klaviyo / Omnisend / FoxKit-class staged capture. A popup that declares
 * `config.formFields` is upgraded at runtime (superapp-modules.src.js →
 * `initMultiStepForms`) from a classic title/body/CTA popup into a 1–4 step
 * stepper built INSIDE the existing popup shell — progress dots, back/next,
 * per-field validation (email/phone patterns + required), and a success step
 * that optionally reveals a discount code. Submission reuses the existing
 * app-proxy capture path (`/apps/superapp/capture`, captureType
 * `multi_step_form`); nothing here is fabricated.
 *
 * ADDITIVE + back-compat: the pin is `.optional()`, so a popup without
 * `formFields` renders byte-for-byte as before. HONESTY: a `consent` field
 * renders an UNCHECKED checkbox (never pre-checked — design-QA fails a
 * pre-checked consent) and its value is only sent when the shopper ticks it.
 */
import { z } from 'zod';
import { LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

/** The field kinds a step can carry. `choice` requires `options`. */
export const FORM_FIELD_TYPES = ['email', 'phone', 'name', 'birthday', 'consent', 'choice'] as const;

/** One field inside a step. */
export const FormFieldSchema = z.object({
  type: z.enum(FORM_FIELD_TYPES),
  label: z.string().min(1).max(LIMITS.labelMax),
  required: z.boolean().default(false),
  /** Options for `type: 'choice'` (radio/select). Ignored for other types. */
  options: z.array(z.string().min(1).max(LIMITS.labelMax)).max(12).optional(),
});

/** One step: an optional heading + 1–6 fields. */
export const FormStepSchema = z.object({
  heading: z.string().max(LIMITS.headingMax).optional(),
  fields: z.array(FormFieldSchema).min(1).max(6),
});

/** Terminal success screen shown after the last step submits. */
export const FormSuccessStepSchema = z.object({
  message: z.string().min(1).max(LIMITS.offerMessageMax),
  /** Optional coupon revealed on success (reuses the shared coupon UI). */
  discountCode: z.string().max(40).optional(),
});

export const FormFieldsPackSchema = z.object({
  /** 1–4 ordered steps (Klaviyo/Omnisend cap staged forms at a few screens). */
  steps: z.array(FormStepSchema).min(1).max(4),
  successStep: FormSuccessStepSchema,
});

export type FormFieldsPack = z.infer<typeof FormFieldsPackSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type FormStep = z.infer<typeof FormStepSchema>;

export const formFieldsPack: ControlPack<typeof FormFieldsPackSchema> = {
  id: 'formFields',
  namespace: 'formFields',
  label: 'Multi-step form',
  tier: 'advanced',
  schema: FormFieldsPackSchema,
  uiSchema: {
    groupLabel: 'Multi-step form / quiz',
    order: ['steps', 'successStep'],
    fields: {
      steps: { help: '1–4 screens; each screen collects one or more fields (email/phone/name/birthday/consent/choice).' },
      successStep: { help: 'Shown after the last step — a thank-you message and an optional coupon reveal.' },
    },
  },
};
