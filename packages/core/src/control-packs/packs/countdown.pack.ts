/**
 * `countdown` control pack — optional urgency timer for popups/banners.
 *
 * V-B B4 (035 vocab-hardening) widens this to a Hextom-class timer with four
 * deadline MODES, honest onExpire actions, and a tiles/plain render style. All
 * new fields are ADDITIVE with defaults that reproduce the pre-B4 behavior
 * byte-for-byte: an old `{ enabled, seconds, label }` config still validates and
 * still renders exactly as before (mode defaults to `session`, plain style,
 * onExpire `hide`). The storefront math for each mode lives in the theme runtime
 * (`superapp-modules.src.js` → `initCountdowns`); nothing here is fabricated.
 */
import { z } from 'zod';
import { LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

/** Deadline strategy. `session` ≡ the pre-B4 default (a per-render deadline). */
export const COUNTDOWN_MODES = ['fixed', 'evergreen', 'daily', 'session'] as const;
/** What the timer does when it hits zero. `hide` ≡ the pre-B4 default. */
export const COUNTDOWN_ON_EXPIRE = ['hide', 'freeze', 'restart'] as const;
/** Visual treatment. `plain` ≡ the pre-B4 compact `2d 04:31:22` string. */
export const COUNTDOWN_TIMER_STYLES = ['plain', 'tiles'] as const;

/** Per-unit labels for the `tiles` style (defaulted in the runtime when absent). */
export const CountdownLabelsSchema = z
  .object({
    days: z.string().max(LIMITS.popupCountdownLabelMax).optional(),
    hours: z.string().max(LIMITS.popupCountdownLabelMax).optional(),
    minutes: z.string().max(LIMITS.popupCountdownLabelMax).optional(),
    seconds: z.string().max(LIMITS.popupCountdownLabelMax).optional(),
  })
  .optional();

export const CountdownPackSchema = z.object({
  enabled: z.boolean().default(false),
  seconds: z.number().int().min(0).max(LIMITS.popupCountdownSecondsMax).default(0),
  label: z.string().max(LIMITS.popupCountdownLabelMax).default(''),
  // ── V-B B4 additive vocabulary ───────────────────────────────────────────
  /** Deadline strategy (default `session`, which preserves pre-B4 behavior). */
  mode: z.enum(COUNTDOWN_MODES).default('session'),
  /** Absolute deadline (ISO 8601) — used by `fixed`. */
  endAt: z.string().datetime({ offset: true }).optional(),
  /** Per-visitor / per-session window length (minutes) — used by `evergreen`/`session`. */
  durationMinutes: z.number().int().min(1).max(LIMITS.popupCountdownSecondsMax / 60).optional(),
  /** Action at zero (default `hide` — remove the timer, the pre-B4 behavior). */
  onExpire: z.enum(COUNTDOWN_ON_EXPIRE).default('hide'),
  /** Render style (default `plain` — the pre-B4 compact string). */
  timerStyle: z.enum(COUNTDOWN_TIMER_STYLES).default('plain'),
  /** Optional per-unit labels for the `tiles` style. */
  labels: CountdownLabelsSchema,
});

export const countdownPack: ControlPack<typeof CountdownPackSchema> = {
  id: 'countdown',
  namespace: 'countdown',
  label: 'Countdown',
  tier: 'basic',
  schema: CountdownPackSchema,
  uiSchema: {
    groupLabel: 'Countdown timer',
    order: ['enabled', 'mode', 'endAt', 'durationMinutes', 'onExpire', 'timerStyle', 'seconds', 'label'],
    fields: {
      seconds: { showWhen: { field: 'enabled', equals: true } },
      label: { showWhen: { field: 'enabled', equals: true }, placeholder: 'Offer expires in' },
      mode: { showWhen: { field: 'enabled', equals: true }, help: 'fixed = to a date · evergreen = per-visitor · daily = resets at midnight · session = per visit.' },
      endAt: { showWhen: { field: 'mode', equals: 'fixed' }, placeholder: '2026-12-31T23:59:59Z' },
      durationMinutes: { showWhen: { field: 'mode', equals: 'evergreen' }, help: 'Length of the per-visitor countdown window.' },
      onExpire: { showWhen: { field: 'enabled', equals: true }, help: 'hide = remove · freeze = hold 00:00 · restart = re-arm (evergreen).' },
      timerStyle: { showWhen: { field: 'enabled', equals: true } },
    },
  },
};
