/**
 * `frequency-cap` control pack — how often a module is shown to a visitor.
 * Reuses POPUP_FREQUENCY so the vocabulary matches the legacy popup config.
 */
import { z } from 'zod';
import { POPUP_FREQUENCY, LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

export const FrequencyCapPackSchema = z.object({
  frequency: z.enum(POPUP_FREQUENCY).default('ONCE_PER_DAY'),
  maxShowsPerDay: z.number().int().min(0).max(LIMITS.popupMaxShowsPerDayMax).default(0),
});

export const frequencyCapPack: ControlPack<typeof FrequencyCapPackSchema> = {
  id: 'frequency-cap',
  namespace: 'frequencyCap',
  label: 'Frequency',
  tier: 'basic',
  schema: FrequencyCapPackSchema,
  uiSchema: {
    groupLabel: 'Frequency',
    order: ['frequency', 'maxShowsPerDay'],
    fields: {
      maxShowsPerDay: { help: '0 = unlimited shows per day.' },
    },
  },
};
