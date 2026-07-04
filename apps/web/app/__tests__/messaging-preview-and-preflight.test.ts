import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';

function campaign(config: Record<string, unknown>): RecipeSpec {
  return {
    type: 'messaging.campaign',
    name: 'Campaign',
    category: 'INTEGRATION',
    requires: [],
    config,
  } as unknown as RecipeSpec;
}

describe('messagingCampaignPreview — deterministic', () => {
  const service = new PreviewService();

  it('renders channel + audience summary + template with sample merge vars for a shipped email campaign', () => {
    const spec = campaign({
      channel: 'email',
      trigger: { kind: 'back_in_stock' },
      audience: { source: 'data_store', storeKey: 'waitlist', consentField: 'emailConsent', recipients: [] },
      templates: [{ channel: 'email', subject: '{{record.product_title}} is back!', body: '<p>{{record.product_title}}</p>' }],
      batchSize: 200,
      respectConsent: true,
    });
    const out = service.render(spec);
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).toContain('sends now'); // email channel badge
      expect(out.html).toContain('waitlist'); // audience store key
      expect(out.html).toContain('back-in-stock');
      expect(out.html).toContain('Aurora Down Jacket'); // sample merge-var substitution
      expect(out.html).not.toContain('needs runtime');
    }
  });

  it('labels an sms campaign as needs_runtime (honest gate, not faked)', () => {
    const spec = campaign({
      channel: 'sms',
      trigger: { kind: 'broadcast' },
      audience: { source: 'data_store', storeKey: 'sms_list', addressField: 'phone', recipients: [] },
      templates: [{ channel: 'sms', body: 'Flash sale {{record.first_name}}' }],
      batchSize: 200,
      respectConsent: true,
    });
    const out = service.render(spec);
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).toContain('needs runtime');
    }
  });
});

describe('classifyModulePublishability — messaging per-channel gate', () => {
  it('email campaign is deployable', () => {
    const result = classifyModulePublishability(campaign({ channel: 'email' }));
    expect(result.status).toBe('deployable');
    expect(result.willDeploy).toBe(true);
  });

  it('slack campaign is deployable', () => {
    const result = classifyModulePublishability(campaign({ channel: 'slack' }));
    expect(result.status).toBe('deployable');
  });

  it('sms campaign is needs_runtime when unconfigured (connector ships, creds missing — honest, not faked)', () => {
    // No SMS provider creds in the test env → sendable check fails → needs_runtime.
    const result = classifyModulePublishability(campaign({ channel: 'sms' }));
    expect(result.status).toBe('needs_runtime');
    expect(result.willDeploy).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/sms/i);
    expect(result.reasons.join(' ')).toMatch(/credential|configured|SMS_PROVIDER/i);
  });

  it('push campaign is needs_runtime when unconfigured (VAPID keys missing)', () => {
    const result = classifyModulePublishability(campaign({ channel: 'push' }));
    expect(result.status).toBe('needs_runtime');
    expect(result.reasons.join(' ')).toMatch(/VAPID|credential|configured/i);
  });

  it('bare type (no config) stays deployable — the type-level audit contract holds', () => {
    const result = classifyModulePublishability({ type: 'messaging.campaign' } as RecipeSpec);
    expect(result.status).toBe('deployable');
  });
});
