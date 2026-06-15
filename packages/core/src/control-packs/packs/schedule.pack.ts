/**
 * `schedule` control pack (advanced) — when the module is active, incl. day-parting.
 * NEW controls v1 lacked; persisted as `config.schedule` on opted-in recipe branches.
 */
import { z } from 'zod';
import type { ControlPack } from '../types.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const SchedulePackSchema = z.object({
  /** ISO-8601 datetime; module hidden before this. */
  startAt: z.string().max(40).optional(),
  /** ISO-8601 datetime; module hidden after this. */
  endAt: z.string().max(40).optional(),
  timezone: z.string().max(60).optional(),
  /** Day-parting: days of week the module may show (empty = all days). */
  daysOfWeek: z.array(z.enum(DAYS)).max(7).default([]),
  /** Day-parting: hour-of-day window [start, end), 0-23. */
  dayStartHour: z.number().int().min(0).max(23).optional(),
  dayEndHour: z.number().int().min(0).max(23).optional(),
});

export const schedulePack: ControlPack<typeof SchedulePackSchema> = {
  id: 'schedule',
  namespace: 'schedule',
  label: 'Schedule',
  tier: 'advanced',
  schema: SchedulePackSchema,
  uiSchema: {
    groupLabel: 'Schedule & day-parting',
    order: ['startAt', 'endAt', 'timezone', 'daysOfWeek', 'dayStartHour', 'dayEndHour'],
    fields: {
      startAt: { widget: 'datetime', placeholder: 'YYYY-MM-DDTHH:mm' },
      endAt: { widget: 'datetime', placeholder: 'YYYY-MM-DDTHH:mm' },
      daysOfWeek: { help: 'Empty = every day.' },
    },
  },
};
