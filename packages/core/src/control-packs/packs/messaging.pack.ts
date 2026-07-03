/**
 * `messaging` control pack (basic) — R3.4 / M5: the first-class MESSAGING
 * vocabulary (content + trigger + audience) for bounded email/slack/SMS/push
 * fan-out over a resolved audience.
 *
 * Build-on-what-is-real discipline (specs/031 messaging-surface.md):
 *  - The pack lowers onto the ALREADY-SHIPPED EmailConnector / SlackConnector,
 *    reachable today via the live FlowRunnerService step kinds
 *    SEND_EMAIL_NOTIFICATION / SEND_SLACK_MESSAGE. `email` + `slack` are the real
 *    delivery path (MESSAGING_CHANNELS_SHIPPED).
 *  - `sms` / `push` are modeled in the vocabulary so recipes are forward-compatible,
 *    but gated `needs_runtime` at compile preflight + refused loudly at runtime
 *    (never faked) until their connectors ship.
 *
 * Flat-pin path (post R2.4 prune): the pack `schema` IS the `messaging.campaign`
 * config body (not an `.optional()` sub-key like pricing/rule-engine) — messaging
 * is a dedicated type whose whole config is this pack. It reuses the existing
 * `audience`/`rule-engine` packs by composition for coarse/fine recipient gating.
 */
import { z } from 'zod';
import {
  MESSAGING_CHANNELS,
  MESSAGING_TRIGGER_KINDS,
  MESSAGING_AUDIENCE_SOURCES,
  MESSAGING_LIMITS,
  MESSAGING_DRIP_PRESETS,
  MESSAGING_DRIP_LIMITS,
  FLOW_AUTOMATION_TRIGGERS,
} from '../../allowed-values.js';
import { AudiencePackSchema } from './audience.pack.js';
import { RuleEnginePackSchema } from './rule-engine.pack.js';
import type { ControlPack } from '../types.js';

// Re-export the manifest-centralized enums so consumers can import from the pack
// (mirrors pricing/rule-engine). Single source stays allowed-values.ts.
export {
  MESSAGING_CHANNELS,
  MESSAGING_CHANNELS_SHIPPED,
  MESSAGING_TRIGGER_KINDS,
  MESSAGING_AUDIENCE_SOURCES,
  MESSAGING_LIMITS,
  MESSAGING_DRIP_PRESETS,
  MESSAGING_DRIP_LIMITS,
  MESSAGING_DRIP_PRESET_ENTRY,
  messagingChannelSendability,
} from '../../allowed-values.js';
export type {
  MessagingChannel,
  ShippedMessagingChannel,
  MessagingTriggerKind,
  MessagingAudienceSource,
  MessagingDripPreset,
  MessagingChannelSendability,
} from '../../allowed-values.js';

/**
 * One channel's message. Merge vars are `{{dot.paths}}` resolved at send time
 * against the recipient record + the triggering event (same substitution the
 * live WRITE_TO_STORE `titleExpr` uses).
 */
export const MessageTemplateSchema = z
  .object({
    channel: z.enum(MESSAGING_CHANNELS),
    /** Email only; ignored for sms/push/slack. */
    subject: z.string().max(MESSAGING_LIMITS.subjectMax).optional(),
    /** HTML (email) / text (sms/slack) / notification body (push). `{{merge}}` tokens allowed. */
    body: z.string().min(1).max(MESSAGING_LIMITS.bodyMax),
    /** push only — the notification title. */
    title: z.string().max(MESSAGING_LIMITS.titleMax).optional(),
    /** push/email deep-link. */
    url: z.string().url().optional(),
  })
  .superRefine((t, ctx) => {
    if (t.channel === 'email' && !t.subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subject'],
        message: 'email template requires a subject',
      });
    }
  });
export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;

/** Who receives the message. */
export const MessagingAudienceSchema = z
  .object({
    source: z.enum(MESSAGING_AUDIENCE_SOURCES).default('data_store'),
    /** source:'data_store' — the DataStore key holding subscriber records. */
    storeKey: z.string().min(1).max(MESSAGING_LIMITS.storeKeyMax).optional(),
    /** Which record field holds the address, per channel. Defaults: email→'email', sms/push→'phone'. */
    addressField: z.string().max(MESSAGING_LIMITS.fieldNameMax).optional(),
    /** Which record field holds the per-recipient consent flag (must be truthy to send). */
    consentField: z.string().max(MESSAGING_LIMITS.fieldNameMax).optional(),
    /** source:'literal' — explicit recipients (ops alerts; small). */
    recipients: z
      .array(z.string().max(200))
      .max(MESSAGING_LIMITS.literalRecipientsMax)
      .default([]),
    /** Coarse segment gate (reuse). Fine per-recipient filtering via `ruleEngine` below. */
    segment: AudiencePackSchema.optional(),
    /** R2.1 rule-engine: per-recipient condition filter over record fields. */
    ruleEngine: RuleEnginePackSchema.optional(),
  })
  .superRefine((a, ctx) => {
    if (a.source === 'data_store' && !a.storeKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeKey'],
        message: "source:'data_store' requires storeKey",
      });
    }
    if (a.source === 'literal' && a.recipients.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipients'],
        message: "source:'literal' requires ≥1 recipient",
      });
    }
  });
export type MessagingAudience = z.infer<typeof MessagingAudienceSchema>;

/**
 * One step of a `drip` sequence. Step 0 is the ENTRY send (fired immediately on the
 * preset's entry trigger, delayMs ignored/0). Each later step is delivered `delayMs`
 * after the PREVIOUS step, parked on the durable scheduler (DELAY-park) between steps.
 * A step may override the channel/template (e.g. email entry → SMS reminder later);
 * absent an override it uses the campaign's primary channel + matching template.
 */
export const MessagingDripStepSchema = z.object({
  /** Delay AFTER the previous step before this one sends (ms). Ignored for step 0. */
  delayMs: z
    .number()
    .int()
    .min(MESSAGING_DRIP_LIMITS.stepDelayMsMin)
    .max(MESSAGING_DRIP_LIMITS.stepDelayMsMax)
    .default(MESSAGING_DRIP_LIMITS.stepDelayMsMin),
  /** Which template channel this step uses. Defaults to the campaign's primary channel. */
  channel: z.enum(MESSAGING_CHANNELS).optional(),
  /** Optional human label for the step (admin/preview). */
  label: z.string().max(MESSAGING_LIMITS.titleMax).optional(),
});
export type MessagingDripStep = z.infer<typeof MessagingDripStepSchema>;

/** What fires the campaign. */
export const MessagingTriggerSchema = z
  .object({
    kind: z.enum(MESSAGING_TRIGGER_KINDS).default('broadcast'),
    /** kind:'event' — which live FlowRunnerService trigger fires this campaign. */
    event: z.enum(FLOW_AUTOMATION_TRIGGERS).optional(),
    // kind:'back_in_stock' is a preset resolving to SHOPIFY_WEBHOOK_PRODUCT_UPDATED
    // at runtime (no explicit `event` required).
    /** kind:'drip' — which entry preset the sequence starts from. */
    dripPreset: z.enum(MESSAGING_DRIP_PRESETS).optional(),
    /**
     * kind:'drip' — the ordered steps. Step 0 is the entry send; each later step is
     * delayed relative to the prior one and parked on the durable scheduler.
     */
    steps: z.array(MessagingDripStepSchema).max(MESSAGING_DRIP_LIMITS.stepsMax).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.kind === 'event' && !t.event) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['event'],
        message: "kind:'event' requires an event",
      });
    }
    if (t.kind === 'drip') {
      if (!t.dripPreset) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dripPreset'],
          message: "kind:'drip' requires a dripPreset",
        });
      }
      if (!t.steps || t.steps.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps'],
          message: "kind:'drip' requires at least one step (the entry send)",
        });
      }
    }
  });
export type MessagingTrigger = z.infer<typeof MessagingTriggerSchema>;

export const MessagingPackSchema = z
  .object({
    /** Primary channel of this campaign (drives the shipped-runtime gate at compile + runtime). */
    channel: z.enum(MESSAGING_CHANNELS).default('email'),
    trigger: MessagingTriggerSchema.default({ kind: 'broadcast' }),
    audience: MessagingAudienceSchema,
    /** One template per channel (usually one). */
    templates: z.array(MessageTemplateSchema).min(1).max(MESSAGING_LIMITS.templatesMax),
    /** Per-run fan-out cap (safety; cross-run paging over a large list depends on R3.5). */
    batchSize: z
      .number()
      .int()
      .positive()
      .max(MESSAGING_LIMITS.batchSizeMax)
      .default(200),
    /** Global send guard — every send path also checks this (belt & suspenders). */
    respectConsent: z.boolean().default(true),
  })
  .superRefine((m, ctx) => {
    // The chosen primary channel must have a template.
    if (!m.templates.some((t) => t.channel === m.channel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['templates'],
        message: `no template for primary channel '${m.channel}'`,
      });
    }
  });
export type MessagingPack = z.infer<typeof MessagingPackSchema>;

export const messagingPack: ControlPack<typeof MessagingPackSchema> = {
  id: 'messaging',
  namespace: 'messaging',
  label: 'Messaging Campaign',
  tier: 'basic',
  schema: MessagingPackSchema,
  uiSchema: {
    groupLabel: 'Messaging',
    order: ['channel', 'trigger', 'audience', 'templates', 'batchSize', 'respectConsent'],
    fields: {
      channel: { help: 'email and slack send today; sms and push have connectors but need the merchant provider credentials (SMS SID/token; VAPID keys) configured before they can send.' },
      batchSize: { tier: 'advanced', help: 'Max recipients per run (bounded; large lists page across runs).' },
      respectConsent: { tier: 'advanced', help: 'Skip recipients whose consent field is falsy.' },
    },
  },
};
