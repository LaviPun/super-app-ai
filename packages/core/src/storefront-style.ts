import { z } from 'zod';
import {
  LIMITS,
  STOREFRONT_LAYOUT_MODES,
  STOREFRONT_ANCHORS,
  STOREFRONT_WIDTHS,
  STOREFRONT_Z_INDEX_LEVELS,
  STOREFRONT_SPACING_OPTIONS,
  STOREFRONT_TYPOGRAPHY_SIZES,
  STOREFRONT_TYPOGRAPHY_WEIGHTS,
  STOREFRONT_LINE_HEIGHTS,
  STOREFRONT_ALIGN_OPTIONS,
  STOREFRONT_SHAPE_RADIUS,
  STOREFRONT_BORDER_WIDTHS,
  STOREFRONT_SHADOW_LEVELS,
  STOREFRONT_OFFSET_MIN,
  STOREFRONT_OFFSET_MAX,
} from './allowed-values.js';

/**
 * Custom CSS is scoped and sanitized at compile time (see style-compiler.ts).
 * Merchant may write extra CSS using --sa-* vars. Block-level only (no @import,
 * no url(), no expression(), no <script>). Max from Allowed Values Manifest (doc 4.2.8).
 */
const CustomCssSchema = z
  .string()
  .max(LIMITS.customCssMax, `Custom CSS must be under ${LIMITS.customCssMax} characters`)
  .optional();

/**
 * Theme-safe storefront UI style. All values from Allowed Values Manifest (doc 3.4).
 * Used by theme.banner, theme.popup, theme.notificationBar, proxy.widget.
 */
export const StorefrontStyleSchema = z
  .object({
    layout: z
      .object({
        mode: z.enum(STOREFRONT_LAYOUT_MODES).default('inline'),
        anchor: z.enum(STOREFRONT_ANCHORS).default('top'),
        offsetX: z.number().int().min(STOREFRONT_OFFSET_MIN).max(STOREFRONT_OFFSET_MAX).default(0),
        offsetY: z.number().int().min(STOREFRONT_OFFSET_MIN).max(STOREFRONT_OFFSET_MAX).default(0),
        width: z.enum(STOREFRONT_WIDTHS).default('auto'),
        zIndex: z.enum(STOREFRONT_Z_INDEX_LEVELS).default('sticky'),
      })
      .default({}),
    spacing: z
      .object({
        padding: z.enum(STOREFRONT_SPACING_OPTIONS).default('medium'),
        margin: z.enum(STOREFRONT_SPACING_OPTIONS).default('none'),
        gap: z.enum(STOREFRONT_SPACING_OPTIONS).default('medium'),
      })
      .default({}),
    typography: z
      .object({
        size: z.enum(STOREFRONT_TYPOGRAPHY_SIZES).default('MD'),
        weight: z.enum(STOREFRONT_TYPOGRAPHY_WEIGHTS).default('normal'),
        lineHeight: z.enum(STOREFRONT_LINE_HEIGHTS).default('normal'),
        align: z.enum(STOREFRONT_ALIGN_OPTIONS).default('left'),
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
        radius: z.enum(STOREFRONT_SHAPE_RADIUS).default('md'),
        borderWidth: z.enum(STOREFRONT_BORDER_WIDTHS).default('none'),
        shadow: z.enum(STOREFRONT_SHADOW_LEVELS).default('none'),
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
