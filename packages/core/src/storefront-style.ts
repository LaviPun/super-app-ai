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
  STOREFRONT_ELEVATION_IDIOMS,
  STOREFRONT_DENSITY_LEVELS,
  STOREFRONT_MOTION_DURATIONS,
  STOREFRONT_MOTION_EASINGS,
  STOREFRONT_MOTION_ENTRANCES,
  STOREFRONT_STYLE_PACKS,
  STOREFRONT_RADIUS_SCALING_MIN,
  STOREFRONT_RADIUS_SCALING_MAX,
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
 * Used by theme.section, proxy.widget (and other storefront types).
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
        /** Density dial (design-vocabulary §1.3): airy for marketing, compact for utility. */
        density: z.enum(STOREFRONT_DENSITY_LEVELS).optional(),
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
        /**
         * Flat text/background are OPTIONAL (module-design-system.md §3.3.2):
         * unset ⇒ the module inherits the store theme's colors at render
         * (compiler emits no --sa-text/--sa-bg; CSS falls back to inherit /
         * transparent). Set ⇒ a deliberate per-module override (layer 4).
         */
        text: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        background: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        border: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        buttonBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        buttonText: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        overlayBackdrop: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        overlayBackdropOpacity: z.number().min(0).max(1).default(0.45),
        /**
         * Merchant brand accent (hex) — seeds the OKLCH 12-step semantic ramp
         * (design-vocabulary §1.1). Additive: the compiler derives semantic
         * `--sa-solid/-content/-surface/-text-high/…` vars from it while the flat
         * colors above still drive the legacy `--sa-text/-bg/…` vars.
         */
        seed: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      })
      .default({}),
    shape: z
      .object({
        radius: z.enum(STOREFRONT_SHAPE_RADIUS).default('md'),
        borderWidth: z.enum(STOREFRONT_BORDER_WIDTHS).default('none'),
        shadow: z.enum(STOREFRONT_SHADOW_LEVELS).default('none'),
        /** Coherent elevation idiom (design-vocabulary §1.5) — layered/inset shadow personality. */
        elevation: z.enum(STOREFRONT_ELEVATION_IDIOMS).optional(),
        /** Global radius scaling % (Radix `scaling`): shift the derived radius ladder tight↔soft. */
        scaling: z
          .number()
          .int()
          .min(STOREFRONT_RADIUS_SCALING_MIN)
          .max(STOREFRONT_RADIUS_SCALING_MAX)
          .optional(),
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
    /**
     * Motion tokens (design-vocabulary §1.6). Duration + easing personality the
     * generator emits against by name (never a raw ms/cubic-bezier). Always paired
     * with the `accessibility.reducedMotion` fallback.
     */
    motion: z
      .object({
        duration: z.enum(STOREFRONT_MOTION_DURATIONS).default('base'),
        easing: z.enum(STOREFRONT_MOTION_EASINGS).default('standard'),
        /**
         * V-B B13 entrance-animation vocabulary. A one-shot on-enter animation for
         * the module root (IntersectionObserver adds `.sa-entered`), honoring
         * prefers-reduced-motion (instant). Absent / `none` ⇒ pre-B13 behavior
         * (no entrance emitted). `stagger` offsets grid children's entrance.
         */
        entrance: z.enum(STOREFRONT_MOTION_ENTRANCES).optional(),
        stagger: z.boolean().optional(),
      })
      .optional(),
    /**
     * Two-pack render grammar (module-design-system.md §3.3.1). Resolved, not
     * authored: set app-side from the aesthetic auto-select (`resolveStorefrontPack`,
     * §9.2) and persisted into `style_json.pack`, which the renderer reads to stamp
     * `data-sa-pack` on the `.superapp-scope` wrapper. Merchant theme-editor
     * `stylePack` overrides it live (precedence layer 5).
     */
    pack: z.enum(STOREFRONT_STYLE_PACKS).optional(),
    /** Free-form CSS additions. Sanitized + scoped at compile time. */
    customCss: CustomCssSchema,
  })
  .default({});

export type StorefrontStyle = z.infer<typeof StorefrontStyleSchema>;
