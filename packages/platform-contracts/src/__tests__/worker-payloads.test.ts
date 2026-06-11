import { describe, expect, it } from 'vitest';
import {
  AiGenerationPayloadSchema,
  PublishPreflightPayloadSchema,
  WebhookPayloadSchema,
} from '../worker-payloads.js';

describe('worker payload schemas', () => {
  it('parses ai generation payload', () => {
    const parsed = AiGenerationPayloadSchema.parse({
      jobId: 'job_1',
      shopId: 'shop_1',
      intentKey: 'promo.banner',
      prompt: 'hello',
    });
    expect(parsed.outputSchema).toBe('RecipeSpecV1');
  });

  it('parses webhook payload', () => {
    expect(
      WebhookPayloadSchema.safeParse({
        jobId: 'job_1',
        shopId: 'shop_1',
        topic: 'orders/create',
        webhookId: 'wh_1',
        payload: {},
        receivedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it('parses publish preflight payload', () => {
    expect(
      PublishPreflightPayloadSchema.safeParse({
        jobId: 'job_1',
        shopId: 'shop_1',
        moduleId: 'mod_1',
        revisionId: 'rev_1',
        target: 'theme',
        recipeSpec: { modules: [] },
        idempotencyKey: 'idem_1',
      }).success,
    ).toBe(true);
  });
});
