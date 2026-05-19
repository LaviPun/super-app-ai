import { describe, expect, it } from 'vitest';
import {
  parsePlatformV2RolloutFlags,
  resolveRemixTrafficTarget,
  shouldExposeFastifyV1Routes,
  shouldRunPublishWorker,
} from '../rollout-cutover.js';

describe('parsePlatformV2RolloutFlags', () => {
  it('defaults all cutover flags to off and job execution to inline', () => {
    const flags = parsePlatformV2RolloutFlags({});
    expect(flags).toEqual({
      frontendNextEnabled: false,
      fastifyApiEnabled: false,
      shopifyEmbeddedNextCutoverEnabled: false,
      jobExecutionMode: 'inline',
      aiGenerationAsyncEnabled: false,
      aiGenerationStreamViaQueueEnabled: false,
      flowAsyncEnabled: false,
      webhookAsyncEnabled: false,
      connectorWorkerEnabled: false,
      publishWorkerEnabled: false,
      previewSandboxEnabled: false,
      intentGraphEnabled: false,
    });
  });

  it('parses truthy env values and job execution mode', () => {
    const flags = parsePlatformV2RolloutFlags({
      FRONTEND_NEXT_ENABLED: 'true',
      FASTIFY_API_ENABLED: '1',
      JOB_EXECUTION_MODE: 'queue',
      PUBLISH_WORKER_ENABLED: 'yes',
    });
    expect(flags.frontendNextEnabled).toBe(true);
    expect(flags.fastifyApiEnabled).toBe(true);
    expect(flags.jobExecutionMode).toBe('queue');
    expect(flags.publishWorkerEnabled).toBe(true);
  });
});

describe('resolveRemixTrafficTarget', () => {
  const baseFlags = parsePlatformV2RolloutFlags({});

  it('keeps traffic on Remix when flags are off', () => {
    expect(
      resolveRemixTrafficTarget({
        pathname: '/internal/jobs',
        flags: baseFlags,
      }),
    ).toBe('remix');
  });

  it('routes internal paths to Next when frontend flag is on', () => {
    expect(
      resolveRemixTrafficTarget({
        pathname: '/internal/ai-assistant',
        flags: parsePlatformV2RolloutFlags({ FRONTEND_NEXT_ENABLED: 'true' }),
      }),
    ).toBe('next-frontend');
  });

  it('routes merchant embedded paths when embedded cutover is on', () => {
    expect(
      resolveRemixTrafficTarget({
        pathname: '/modules',
        flags: parsePlatformV2RolloutFlags({ SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED: 'true' }),
        isEmbeddedMerchantSurface: true,
      }),
    ).toBe('next-frontend');
  });

  it('routes /api/v2 to Fastify when API gateway flag is on', () => {
    expect(
      resolveRemixTrafficTarget({
        pathname: '/api/v2/jobs',
        flags: parsePlatformV2RolloutFlags({ FASTIFY_API_ENABLED: 'true' }),
      }),
    ).toBe('fastify-api');
  });
});

describe('worker gating helpers', () => {
  it('requires queue mode and publish flag for publish worker execution', () => {
    expect(shouldRunPublishWorker(parsePlatformV2RolloutFlags({}))).toBe(false);
    expect(
      shouldRunPublishWorker(
        parsePlatformV2RolloutFlags({ PUBLISH_WORKER_ENABLED: 'true', JOB_EXECUTION_MODE: 'queue' }),
      ),
    ).toBe(true);
    expect(
      shouldRunPublishWorker(
        parsePlatformV2RolloutFlags({ PUBLISH_WORKER_ENABLED: 'true', JOB_EXECUTION_MODE: 'inline' }),
      ),
    ).toBe(false);
  });

  it('gates Fastify v1 routes behind fastifyApiEnabled', () => {
    expect(shouldExposeFastifyV1Routes(parsePlatformV2RolloutFlags({}))).toBe(false);
    expect(shouldExposeFastifyV1Routes(parsePlatformV2RolloutFlags({ FASTIFY_API_ENABLED: 'true' }))).toBe(
      true,
    );
  });
});
