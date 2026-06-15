/**
 * `content` control pack — headline, body, and call-to-action settings.
 * Shared by every UI-bearing module type (banner, popup, notificationBar, ...).
 */
import { z } from 'zod';
import { LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

const CtaSchema = z.object({
  text: z.string().min(1).max(40),
  url: z.string().url(),
});

export const ContentPackSchema = z.object({
  heading: z.string().min(LIMITS.headingMin).max(LIMITS.headingMax),
  body: z.string().min(0).max(LIMITS.popupBodyMax).optional(),
  primaryCta: CtaSchema.optional(),
  secondaryCta: CtaSchema.optional(),
  /** Optional hero/illustration image. */
  mediaUrl: z.string().url().optional(),
  /** Alt text for the media; required-by-convention when mediaUrl is set (enforced in form, not schema). */
  mediaAlt: z.string().max(160).optional(),
});

export const contentPack: ControlPack<typeof ContentPackSchema> = {
  id: 'content',
  namespace: 'content',
  label: 'Content',
  tier: 'basic',
  schema: ContentPackSchema,
  uiSchema: {
    groupLabel: 'Content',
    order: ['heading', 'body', 'primaryCta', 'secondaryCta', 'mediaUrl', 'mediaAlt'],
    fields: {
      body: { widget: 'textarea', help: 'Optional supporting copy.' },
      secondaryCta: { tier: 'advanced', help: 'Optional dismiss/secondary action.' },
      mediaUrl: { tier: 'advanced' },
      mediaAlt: { tier: 'advanced', showWhen: { field: 'mediaUrl', equals: true } },
    },
  },
};
