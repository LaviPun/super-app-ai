import { describe, expect, it, beforeEach } from 'vitest';
import { parseRouterRuntimeConfig } from '~/services/ai/router-runtime-config.server';
import { DEFAULT_ROUTER_RUNTIME_CONFIG } from '~/schemas/router-runtime-config.server';
import { encryptJson } from '~/services/security/crypto.server';

describe('parseRouterRuntimeConfig', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  });

  it('treats missing ciphertext as valid empty stored config', () => {
    const r = parseRouterRuntimeConfig(null);
    expect(r.storedConfigInvalid).toBe(false);
    expect(r.config.dualTargetEnabled).toBe(DEFAULT_ROUTER_RUNTIME_CONFIG.dualTargetEnabled);
  });

  it('flags undecryptable ciphertext instead of pretending stored config is empty-by-choice', () => {
    const r = parseRouterRuntimeConfig('%%%not-valid-ciphertext%%%');
    expect(r.storedConfigInvalid).toBe(true);
    expect(r.config.dualTargetEnabled).toBe(DEFAULT_ROUTER_RUNTIME_CONFIG.dualTargetEnabled);
  });

  it('accepts encrypted valid router config', () => {
    const enc = encryptJson(DEFAULT_ROUTER_RUNTIME_CONFIG);
    const r = parseRouterRuntimeConfig(enc);
    expect(r.storedConfigInvalid).toBe(false);
    expect(r.config.activeTarget).toBe(DEFAULT_ROUTER_RUNTIME_CONFIG.activeTarget);
  });
});
