/**
 * `style` control pack — wraps the existing, already-shared StorefrontStyleSchema
 * (layout, spacing, typography, colors, shape, responsive, accessibility, customCss).
 *
 * This is the proof case for the Control Pack model: a single shared schema with a
 * central CSS compiler, reused across many module types with zero per-type duplication.
 */
import { StorefrontStyleSchema } from '../../storefront-style.js';
import type { ControlPack } from '../types.js';

/** The style pack schema IS the storefront style schema (already a ZodObject). */
export const StylePackSchema = StorefrontStyleSchema;

export const stylePack: ControlPack<typeof StorefrontStyleSchema> = {
  id: 'style',
  namespace: 'style',
  label: 'Style',
  tier: 'basic',
  schema: StorefrontStyleSchema,
  uiSchema: {
    groupLabel: 'Style & Appearance',
    order: ['layout', 'colors', 'typography', 'spacing', 'shape', 'responsive', 'accessibility', 'customCss'],
    fields: {
      // customCss is the escape-hatch entry within style; gate behind advanced tier.
      customCss: { widget: 'code', tier: 'advanced', help: 'Sanitized + scoped at compile time. Use --sa-* vars.' },
    },
  },
};
