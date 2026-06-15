/**
 * `behavior` control pack — close/dismiss behavior for overlay modules.
 */
import { z } from 'zod';
import { LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

export const BehaviorPackSchema = z.object({
  showCloseButton: z.boolean().default(true),
  autoCloseSeconds: z.number().int().min(0).max(LIMITS.popupDelaySecondsMax).default(0),
});

export const behaviorPack: ControlPack<typeof BehaviorPackSchema> = {
  id: 'behavior',
  namespace: 'behavior',
  label: 'Behavior',
  tier: 'basic',
  schema: BehaviorPackSchema,
  uiSchema: {
    groupLabel: 'Close behavior',
    order: ['showCloseButton', 'autoCloseSeconds'],
    fields: {
      autoCloseSeconds: { help: '0 = never auto-close.' },
    },
  },
};
