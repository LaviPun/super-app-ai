/**
 * `audience` control pack (advanced) — who should see the module.
 * These are NEW controls v1 lacked; persisted as `config.audience` on types
 * whose recipe branch opts in (see recipe.ts).
 */
import { z } from 'zod';
import type { ControlPack } from '../types.js';

const VISITORS = ['any', 'new', 'returning'] as const;

export const AudiencePackSchema = z.object({
  loggedInOnly: z.boolean().default(false),
  visitor: z.enum(VISITORS).default('any'),
  customerTags: z.array(z.string().min(1).max(40)).max(20).default([]),
  minCartValue: z.number().nonnegative().optional(),
  minOrderCount: z.number().int().nonnegative().optional(),
});

export const audiencePack: ControlPack<typeof AudiencePackSchema> = {
  id: 'audience',
  namespace: 'audience',
  label: 'Audience',
  tier: 'advanced',
  schema: AudiencePackSchema,
  uiSchema: {
    groupLabel: 'Audience targeting',
    order: ['visitor', 'loggedInOnly', 'customerTags', 'minCartValue', 'minOrderCount'],
    fields: {
      customerTags: { help: 'Only show to customers with any of these tags.' },
      minCartValue: { help: 'Only show when cart subtotal is at least this amount.' },
      minOrderCount: { help: 'Only show to customers with at least this many past orders.' },
    },
  },
};
