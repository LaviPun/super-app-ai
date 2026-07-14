/**
 * `device` control pack (basic) — V-A A7: PER-DEVICE VISIBILITY vocabulary
 * (competitor parity: GemPages / Klaviyo signup-form device targeting /
 * ProveSource "show on"). A merchant frequently wants the SAME module to appear
 * on desktop but not mobile (a wide promo strip), or mobile but not desktop (a
 * compact sticky offer), and to drop a multi-column grid to a single column on
 * phones. This pack is the pack-vocabulary FACE of that behaviour.
 *
 * ── HONEST DESIGN DECISION (documented; see recipe.ts + superapp-module.liquid) ──
 * `StorefrontStyleSchema.responsive.{hideOnMobile,hideOnDesktop}` ALREADY exists,
 * but it is wired into the render layer for the `floatingWidget` kind ONLY (the
 * `superapp-fw-wrap--hide-mobile/--hide-desktop` classes). For a `theme.section`
 * or a `proxy.widget` it was INERT — nothing lowered it to a class. So this pack
 * is NOT a duplicate: it fills a real rendering gap on the section/widget
 * surfaces. To avoid creating two competing responsive systems, the storefront
 * lowers BOTH `config.device` (this pack) AND `style.responsive` into the SAME
 * pair of module-root utility classes (`sa-hide-desktop` / `sa-hide-mobile`) —
 * so this pack is genuinely the pack-vocabulary face of one rendering path, and
 * `style.responsive` now works on sections too (previously floating-widget-only).
 *
 * MODEL: presentation-only, no schema for the module's content. `desktop` and
 * `mobile` both default to `true` (show everywhere) so an ABSENT/DEFAULT pack
 * emits no class — the render is byte-identical to pre-A7 (back-compat, asserted
 * by the vocab tests). `mobileColumns` (1 | 2) narrows a multi-up grid under the
 * mobile breakpoint via a `--sa-mobile-cols` override; absent leaves the grid's
 * own responsive rules untouched.
 *
 * Flat-pin path (post R2.4 prune): pinned as an `.optional()` `device` key onto
 * `theme.section.config` AND `proxy.widget.config` (see recipe.ts).
 */
import { z } from 'zod';
import type { ControlPack } from '../types.js';

/** Mobile column count for a grid-style module (1 = single column, 2 = two-up). */
export const DEVICE_MOBILE_COLUMNS = [1, 2] as const;
export type DeviceMobileColumns = (typeof DEVICE_MOBILE_COLUMNS)[number];

export const DevicePackSchema = z.object({
  /** Show on desktop (≥750px). Default true; false → hidden on desktop. */
  desktop: z.boolean().default(true),
  /** Show on mobile (<750px). Default true; false → hidden on mobile. */
  mobile: z.boolean().default(true),
  /** Optional per-mobile column override for grid modules (1 or 2). */
  mobileColumns: z
    .union([z.literal(1), z.literal(2)])
    .optional(),
});
export type DevicePack = z.infer<typeof DevicePackSchema>;

export const devicePack: ControlPack<typeof DevicePackSchema> = {
  id: 'device',
  namespace: 'device',
  label: 'Device visibility',
  tier: 'basic',
  schema: DevicePackSchema,
  uiSchema: {
    groupLabel: 'Device visibility',
    order: ['desktop', 'mobile', 'mobileColumns'],
    fields: {
      desktop: { help: 'Show this module on desktop screens (≥750px).' },
      mobile: { help: 'Show this module on mobile screens (<750px).' },
      mobileColumns: { help: 'Force 1 or 2 columns on mobile for grid modules.', tier: 'advanced' },
    },
  },
};
