import { describe, expect, it } from 'vitest';
import {
  buildNextFrontendRedirectUrl,
  getPlatformV2CutoverConfig,
  resolvePlatformV2TrafficTarget,
} from '~/services/platform-v2/rollout-cutover.server';

/** Isolated env so suite-wide `process.env` from `.env` does not flip cutover flags. */
const LEGACY_ENV = {
  NODE_ENV: 'test' as const,
  FRONTEND_NEXT_ENABLED: 'false',
  FRONTEND_NEXT_BASE_URL: '',
  FASTIFY_API_ENABLED: 'false',
  SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED: 'false',
};

describe('platform v2 rollout cutover (Remix)', () => {
  it('defaults to legacy Remix traffic', () => {
    const config = getPlatformV2CutoverConfig(LEGACY_ENV);
    expect(config.frontendNextEnabled).toBe(false);
    expect(
      resolvePlatformV2TrafficTarget({
        pathname: '/internal/jobs',
        config,
      }),
    ).toBe('remix');
  });

  it('builds Next redirect URLs when base URL is configured', () => {
    const config = getPlatformV2CutoverConfig({
      ...LEGACY_ENV,
      FRONTEND_NEXT_ENABLED: 'true',
      FRONTEND_NEXT_BASE_URL: 'http://127.0.0.1:3002',
    });
    expect(buildNextFrontendRedirectUrl('/internal/jobs', config)).toBe('http://127.0.0.1:3002/internal/jobs');
  });
});
