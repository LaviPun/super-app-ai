/**
 * `trigger` control pack — when an interactive module activates.
 * Reuses POPUP_TRIGGERS so v2 stays consistent with the existing popup vocabulary.
 */
import { z } from 'zod';
import { POPUP_TRIGGERS, LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

export const TriggerPackSchema = z.object({
  mode: z.enum(POPUP_TRIGGERS).default('ON_LOAD'),
  /** Delay before showing, for ON_LOAD / TIMED. */
  delaySeconds: z.number().int().min(0).max(LIMITS.popupDelaySecondsMax).default(0),
  /** Scroll depth percent for ON_SCROLL_* modes (informational; mode encodes the bucket). */
  scrollPercent: z.number().int().min(0).max(100).optional(),
  /** Inactivity threshold (seconds) for inactivity-style triggers. */
  inactivitySeconds: z.number().int().min(0).max(LIMITS.popupDelaySecondsMax).optional(),
  /** CSS selector that opens the module for ON_CLICK. */
  clickSelector: z.string().max(120).optional(),
});

export const triggerPack: ControlPack<typeof TriggerPackSchema> = {
  id: 'trigger',
  namespace: 'trigger',
  label: 'Trigger',
  tier: 'basic',
  schema: TriggerPackSchema,
  uiSchema: {
    groupLabel: 'Trigger & Timing',
    order: ['mode', 'delaySeconds', 'scrollPercent', 'inactivitySeconds', 'clickSelector'],
    fields: {
      delaySeconds: { showWhen: { field: 'mode', equals: 'TIMED' } },
      scrollPercent: { tier: 'advanced' },
      inactivitySeconds: { tier: 'advanced' },
      clickSelector: { tier: 'advanced', showWhen: { field: 'mode', equals: 'ON_CLICK' } },
    },
  },
};
