/**
 * `countdown` control pack — optional urgency timer for popups/banners.
 */
import { z } from 'zod';
import { LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

export const CountdownPackSchema = z.object({
  enabled: z.boolean().default(false),
  seconds: z.number().int().min(0).max(LIMITS.popupCountdownSecondsMax).default(0),
  label: z.string().max(LIMITS.popupCountdownLabelMax).default(''),
});

export const countdownPack: ControlPack<typeof CountdownPackSchema> = {
  id: 'countdown',
  namespace: 'countdown',
  label: 'Countdown',
  tier: 'basic',
  schema: CountdownPackSchema,
  uiSchema: {
    groupLabel: 'Countdown timer',
    order: ['enabled', 'seconds', 'label'],
    fields: {
      seconds: { showWhen: { field: 'enabled', equals: true } },
      label: { showWhen: { field: 'enabled', equals: true }, placeholder: 'Offer expires in' },
    },
  },
};
