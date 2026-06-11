import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('~/db.server');
  vi.resetModules();
});

describe('resolveRouterTargetConfig env dual-target gating', () => {
  it('flips dualTargetEnabled when INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED is set and no DB row exists', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED', '1');
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('MODAL_ROUTER_URL', 'http://modal.test');
    const { resolveRouterTargetConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const resolved = await resolveRouterTargetConfig();
    expect(resolved.dualTargetEnabled).toBe(true);
    expect(resolved.fallback?.target).toBe('modalRemote');
    expect(resolved.fallback?.url).toBe('http://modal.test');
  });

  it('leaves dualTargetEnabled false when the env flag is absent or falsy', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED', '0');
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    const { resolveRouterTargetConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const resolved = await resolveRouterTargetConfig();
    expect(resolved.dualTargetEnabled).toBe(false);
    expect(resolved.fallback).toBeUndefined();
  });

  it('defaults prompt router URL to local internal-ai-router in development when INTERNAL_AI_ROUTER_URL is unset', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.doMock('~/db.server', () => ({
      getPrisma: () => ({
        appSettings: {
          findUnique: async () => null,
        },
      }),
    }));
    const { resolveRouterTargetConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const resolved = await resolveRouterTargetConfig();
    expect(resolved.dualTargetEnabled).toBe(false);
    expect(resolved.url).toBe('http://127.0.0.1:8787');
  });

  it('uses stored localMachine target settings when dual-target is disabled', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://env-router.test');
    vi.stubEnv('NODE_ENV', 'development');
    vi.doMock('~/services/security/crypto.server', () => ({
      decryptJson: () => ({
        ...{
          dualTargetEnabled: false,
          activeTarget: 'localMachine',
          fallbackTarget: 'modalRemote',
          shadowMode: true,
          canaryShops: [],
          circuitFailureThreshold: 5,
          circuitCooldownMs: 30_000,
          releaseGateSchemaFailRateMax: 0.02,
          releaseGateFallbackRateMax: 0.05,
          targets: {
            localMachine: {
              url: 'http://127.0.0.1:11434',
              backend: 'ollama',
              model: 'qwen3:4b-instruct',
              timeoutMs: 3000,
            },
            modalRemote: {
              backend: 'qwen3',
              model: 'Qwen/Qwen3-4B-Instruct',
              timeoutMs: 3000,
            },
          },
        },
      }),
      encryptJson: () => 'enc',
    }));
    vi.doMock('~/db.server', () => ({
      getPrisma: () => ({
        appSettings: {
          findUnique: async () => ({
            routerRuntimeConfigEnc: 'stored-ciphertext',
          }),
        },
      }),
    }));
    const { resolveRouterTargetConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const resolved = await resolveRouterTargetConfig();
    expect(resolved.target).toBe('localMachine');
    expect(resolved.dualTargetEnabled).toBe(false);
    expect(resolved.url).toBe('http://127.0.0.1:11434');
    expect(resolved.timeoutMs).toBe(3000);
  });

  it('emits the debug log when the env flag flips the flag and INTERNAL_AI_ROUTER_DEBUG_LOG is on', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED', 'true');
    vi.stubEnv('INTERNAL_AI_ROUTER_DEBUG_LOG', '1');
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { resolveRouterTargetConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    await resolveRouterTargetConfig();
    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((line) => line.includes('[router-config] dual-target enabled via env'))).toBe(true);
    logSpy.mockRestore();
  });
});
