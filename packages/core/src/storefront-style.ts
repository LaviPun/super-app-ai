import { z } from 'zod';

/**
 * Custom CSS is scoped and sanitized at compile time (see style-compiler.ts).
 * Merchant may write extra CSS using --sa-* vars. Block-level only (no @import,
 * no url(), no expression(), no <script>). Max 2000 chars.
 */
const CustomCssSchema = z
  .string()
  .max(2000, 'Custom CSS must be under 2000 characters')
  .optional();

/**
 * Theme-safe storefront UI style. All values are enums/presets so output stays
 * safe and stable. Used by theme.banner, theme.popup, theme.notificationBar,
 * proxy.widget.
 *
 * customCss is the only free-form field — it is sanitized and scoped to the
 * module root selector at compile time.
 */
export const StorefrontStyleSchema = z
  .object({
    layout: z
      .object({
        mode: z.enum(['inline', 'overlay', 'sticky', 'floating']).default('inline'),
        anchor: z.enum(['top', 'bottom', 'left', 'right', 'center']).default('top'),
        offsetX: z.number().int().min(-100).max(100).default(0),
        offsetY: z.number().int().min(-100).max(100).default(0),
        width: z.enum(['auto', 'container', 'narrow', 'wide', 'full']).default('auto'),
        zIndex: z.enum(['base', 'dropdown', 'sticky', 'overlay', 'modal']).default('sticky'),
      })
      .default({}),
    spacing: z
      .object({
        padding: z.enum(['none', 'tight', 'medium', 'loose']).default('medium'),
        margin: z.enum(['none', 'tight', 'medium', 'loose']).default('none'),
        gap: z.enum(['none', 'tight', 'medium', 'loose']).default('medium'),
      })
      .default({}),
    typography: z
      .object({
        size: z.enum(['XS', 'SM', 'MD', 'LG', 'XL', '2XL']).default('MD'),
        weight: z.enum(['normal', 'medium', 'bold']).default('normal'),
        lineHeight: z.enum(['tight', 'normal', 'relaxed']).default('normal'),
        align: z.enum(['left', 'center', 'right']).default('left'),
      })
      .default({}),
    colors: z
      .object({
        text: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#111111'),
        background: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#ffffff'),
        border: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        buttonBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        buttonText: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        overlayBackdrop: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        overlayBackdropOpacity: z.number().min(0).max(1).default(0.45),
      })
      .default({}),
    shape: z
      .object({
        radius: z.enum(['none', 'sm', 'md', 'lg', 'xl', 'full']).default('md'),
        borderWidth: z.enum(['none', 'thin', 'medium', 'thick']).default('none'),
        shadow: z.enum(['none', 'sm', 'md', 'lg']).default('none'),
      })
      .default({}),
    responsive: z
      .object({
        hideOnMobile: z.boolean().default(false),
        hideOnDesktop: z.boolean().default(false),
      })
      .default({}),
    accessibility: z
      .object({
        focusVisible: z.boolean().default(true),
        reducedMotion: z.boolean().default(true),
      })
      .default({}),
    /** Free-form CSS additions. Sanitized + scoped at compile time. */
    customCss: CustomCssSchema,
  })
  .default({});

export type StorefrontStyle = z.infer<typeof StorefrontStyleSchema>;
