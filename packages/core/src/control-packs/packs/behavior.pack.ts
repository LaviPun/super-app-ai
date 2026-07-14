/**
 * `behavior` control pack — close/dismiss behavior for overlay modules.
 *
 * V-B B5 (teaser / minimized popup state) and B8 (cross-module coordination bus)
 * widen this ADDITIVELY (035 vocab-hardening). Both new objects are optional and
 * absent by default, so an old `{ showCloseButton, autoCloseSeconds }` config
 * validates and renders byte-for-byte as before. The runtime behavior lives in
 * the theme extension (`superapp-modules.src.js`).
 */
import { z } from 'zod';
import { LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

/** Corner the minimized teaser pill docks to. */
export const TEASER_POSITIONS = ['bottom-left', 'bottom-right'] as const;

/**
 * B5 — teaser / minimized popup state. When enabled, dismissing the popup (close
 * button / scrim / Escape) collapses it to a small pill that reopens it on click,
 * instead of suppressing it for the session.
 */
export const TeaserSchema = z
  .object({
    enabled: z.boolean().default(false),
    label: z.string().max(LIMITS.popupCountdownLabelMax).default('Get 10% off'),
    position: z.enum(TEASER_POSITIONS).default('bottom-right'),
    /** Show the pill after a dismiss (default true — the whole point of a teaser). */
    showAfterDismiss: z.boolean().default(true),
  })
  .optional();

/** Which surface a module competes on in the coordination bus. */
export const COORDINATION_CHANNELS = ['overlay', 'bar'] as const;
/** States a module defers to (won't open while one of these is active). */
export const COORDINATION_SUPPRESS = ['overlay-open', 'cart-drawer-open'] as const;

/**
 * B8 — cross-module coordination bus. Lets overlays/bars announce open/close so a
 * second overlay defers (queues) or skips instead of stacking on the first (also
 * closes the latent double-popup collision). `channel` defaults by kind in the
 * runtime when absent; `priority` breaks ties (higher wins).
 */
export const CoordinationSchema = z
  .object({
    channel: z.enum(COORDINATION_CHANNELS).optional(),
    priority: z.number().int().min(0).max(100).default(0),
    suppressWhile: z.array(z.enum(COORDINATION_SUPPRESS)).max(2).optional(),
  })
  .optional();

export const BehaviorPackSchema = z.object({
  showCloseButton: z.boolean().default(true),
  autoCloseSeconds: z.number().int().min(0).max(LIMITS.popupDelaySecondsMax).default(0),
  // ── V-B B5 / B8 additive vocabulary ────────────────────────────────────────
  teaser: TeaserSchema,
  coordination: CoordinationSchema,
});

export const behaviorPack: ControlPack<typeof BehaviorPackSchema> = {
  id: 'behavior',
  namespace: 'behavior',
  label: 'Behavior',
  tier: 'basic',
  schema: BehaviorPackSchema,
  uiSchema: {
    groupLabel: 'Close behavior',
    order: ['showCloseButton', 'autoCloseSeconds', 'teaser', 'coordination'],
    fields: {
      autoCloseSeconds: { help: '0 = never auto-close.' },
      teaser: { help: 'Minimize to a reopenable pill on dismiss (instead of hiding for the session).' },
      coordination: { help: 'Defer to a higher-priority overlay/bar instead of stacking on it.' },
    },
  },
};
