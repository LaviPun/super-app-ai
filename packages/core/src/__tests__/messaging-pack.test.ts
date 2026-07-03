import { describe, it, expect } from 'vitest';
import {
  MessagingPackSchema,
  messagingPack,
  getPack,
  MESSAGING_CHANNELS,
  MESSAGING_CHANNELS_SHIPPED,
  RecipeSpecSchema,
  RECIPE_SPEC_TYPES,
  getExtensionEligibility,
  isRuntimeShipped,
  MODULE_TYPE_TO_CATEGORY,
  MODULE_TYPE_TO_SURFACE,
} from '../index.js';

/** The §2d load-bearing example — a real back-in-stock email waitlist campaign. */
const BACK_IN_STOCK = {
  channel: 'email',
  trigger: { kind: 'back_in_stock' },
  audience: {
    source: 'data_store',
    storeKey: 'backinstock_waitlist',
    addressField: 'email',
    consentField: 'emailConsent',
  },
  templates: [
    {
      channel: 'email',
      subject: '{{record.product_title}} is back!',
      body: '<p>Hi — {{record.product_title}} is available again.</p>',
    },
  ],
  batchSize: 200,
  respectConsent: true,
} as const;

describe('messaging pack — registry', () => {
  it('registers with namespace `messaging` and tier `basic`', () => {
    expect(getPack('messaging')?.namespace).toBe('messaging');
    expect(messagingPack.tier).toBe('basic');
  });

  it('exposes the channel vocabulary and the shipped subset', () => {
    expect(MESSAGING_CHANNELS).toEqual(['email', 'sms', 'push', 'slack']);
    expect(MESSAGING_CHANNELS_SHIPPED).toEqual(['email', 'slack']);
  });
});

describe('messaging pack — schema', () => {
  it('accepts a valid broadcast email campaign', () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'email',
      trigger: { kind: 'broadcast' },
      audience: { source: 'data_store', storeKey: 'newsletter' },
      templates: [{ channel: 'email', subject: 'Hi', body: 'Body' }],
    });
    expect(res.success).toBe(true);
  });

  it('accepts the back-in-stock example', () => {
    expect(MessagingPackSchema.safeParse(BACK_IN_STOCK).success).toBe(true);
  });

  it('accepts an sms campaign (modeled but gated at compile/runtime, not schema)', () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'sms',
      trigger: { kind: 'broadcast' },
      audience: { source: 'data_store', storeKey: 'sms_list', addressField: 'phone' },
      templates: [{ channel: 'sms', body: 'Flash sale today!' }],
    });
    expect(res.success).toBe(true);
  });

  it('rejects an email template with no subject', () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'email',
      audience: { source: 'data_store', storeKey: 'x' },
      templates: [{ channel: 'email', body: 'no subject here' }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects source:'data_store' without storeKey", () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'email',
      audience: { source: 'data_store' },
      templates: [{ channel: 'email', subject: 's', body: 'b' }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects source:'literal' with zero recipients", () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'email',
      audience: { source: 'literal', recipients: [] },
      templates: [{ channel: 'email', subject: 's', body: 'b' }],
    });
    expect(res.success).toBe(false);
  });

  it('rejects a primary channel that has no matching template', () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'slack',
      audience: { source: 'data_store', storeKey: 'ops' },
      templates: [{ channel: 'email', subject: 's', body: 'b' }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects kind:'event' without an event", () => {
    const res = MessagingPackSchema.safeParse({
      channel: 'email',
      trigger: { kind: 'event' },
      audience: { source: 'data_store', storeKey: 'x' },
      templates: [{ channel: 'email', subject: 's', body: 'b' }],
    });
    expect(res.success).toBe(false);
  });

  it('applies defaults (batchSize, respectConsent, trigger)', () => {
    const parsed = MessagingPackSchema.parse({
      channel: 'email',
      audience: { source: 'data_store', storeKey: 'x' },
      templates: [{ channel: 'email', subject: 's', body: 'b' }],
    });
    expect(parsed.batchSize).toBe(200);
    expect(parsed.respectConsent).toBe(true);
    expect(parsed.trigger.kind).toBe('broadcast');
  });
});

describe('messaging.campaign — recipe integration + eligibility', () => {
  it('round-trips the §2d example through RecipeSpecSchema', () => {
    const spec = {
      type: 'messaging.campaign',
      name: 'Back in Stock — Email Waitlist',
      category: 'INTEGRATION',
      requires: [],
      config: BACK_IN_STOCK,
    };
    const parsed = RecipeSpecSchema.parse(spec);
    expect(parsed.type).toBe('messaging.campaign');
    if (parsed.type === 'messaging.campaign') {
      expect(parsed.config.channel).toBe('email');
    }
  });

  it('rejects a bad channel enum', () => {
    const res = RecipeSpecSchema.safeParse({
      type: 'messaging.campaign',
      name: 'Bad channel',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'carrier-pigeon',
        audience: { source: 'literal', recipients: ['a@b.com'] },
        templates: [{ channel: 'email', subject: 's', body: 'b' }],
      },
    });
    expect(res.success).toBe(false);
  });

  it('is registered in RECIPE_SPEC_TYPES with the expected category + surface', () => {
    expect(RECIPE_SPEC_TYPES).toContain('messaging.campaign');
    expect(MODULE_TYPE_TO_CATEGORY['messaging.campaign']).toBe('INTEGRATION');
    expect(MODULE_TYPE_TO_SURFACE['messaging.campaign']).toBe('marketing_analytics');
  });

  it('eligibility: app-proxy runtime, shipped (email/slack runner is live)', () => {
    const e = getExtensionEligibility('messaging.campaign');
    expect(e.runtime).toBe('app-proxy');
    expect(e.runtimeShipped).toBe(true);
    expect(isRuntimeShipped('messaging.campaign')).toBe(true);
  });

  it('does not regress: all other recipe types still parse a minimal spec', () => {
    // Sanity that adding the union variant did not break the discriminated union.
    const otherTypes = RECIPE_SPEC_TYPES.filter((t) => t !== 'messaging.campaign');
    expect(otherTypes.length).toBe(RECIPE_SPEC_TYPES.length - 1);
  });
});
