/**
 * `advanced-custom` control pack (advanced, escape hatch) — sanitized custom
 * HTML/JS for power users. Persisted as `config.advancedCustom` on opted-in
 * recipe branches. Custom CSS lives in the `style` pack (already scoped+sanitized).
 *
 * SAFETY: these strings are NOT trusted. At compile/preview time customHtml is
 * sanitized (assertGeneratedPreviewHtmlIsSafe) and rendered in a scoped container;
 * customJs runs only inside the sandboxed preview iframe and, on deploy, inside
 * the extension's own CSP-bound block. No eval / no arbitrary network egress.
 */
import { z } from 'zod';
import type { ControlPack } from '../types.js';

const CUSTOM_MAX = 20_000;

export const AdvancedCustomPackSchema = z.object({
  /** Sanitized custom HTML rendered inside the module's scoped container. */
  customHtml: z.string().max(CUSTOM_MAX).optional(),
  /** Custom JS executed inside the sandboxed/CSP-bound module scope only. */
  customJs: z.string().max(CUSTOM_MAX).optional(),
});

export const advancedCustomPack: ControlPack<typeof AdvancedCustomPackSchema> = {
  id: 'advanced-custom',
  namespace: 'advancedCustom',
  label: 'Advanced (custom code)',
  tier: 'advanced',
  schema: AdvancedCustomPackSchema,
  uiSchema: {
    groupLabel: 'Advanced — custom code',
    order: ['customHtml', 'customJs'],
    fields: {
      customHtml: { widget: 'code', tier: 'advanced', help: 'Sanitized at compile time; rendered in a scoped container.' },
      customJs: { widget: 'code', tier: 'advanced', help: 'Runs only inside the sandboxed module scope (no eval, CSP-bound).' },
    },
  },
};
