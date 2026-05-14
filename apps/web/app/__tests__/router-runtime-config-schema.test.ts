import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROUTER_RUNTIME_CONFIG,
  RouterRuntimeConfigSchema,
} from '~/schemas/router-runtime-config.server';

describe('RouterRuntimeConfigSchema', () => {
  it('accepts qwen3 backend for local and remote targets', () => {
    const parsed = RouterRuntimeConfigSchema.parse({
      ...DEFAULT_ROUTER_RUNTIME_CONFIG,
      targets: {
        localMachine: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine,
          backend: 'qwen3',
        },
        modalRemote: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.modalRemote,
          backend: 'qwen3',
        },
      },
    });

    expect(parsed.targets.localMachine.backend).toBe('qwen3');
    expect(parsed.targets.modalRemote.backend).toBe('qwen3');
  });

  it('rejects unsupported backend values', () => {
    expect(() =>
      RouterRuntimeConfigSchema.parse({
        ...DEFAULT_ROUTER_RUNTIME_CONFIG,
        targets: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets,
          localMachine: {
            ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine,
            backend: 'qwen4',
          },
        },
      }),
    ).toThrow();
  });
});

describe('getRouterRuntimeConfig parseError handling', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns defaults with a parseError when ciphertext fails to decrypt or parse', async () => {
    vi.stubEnv(
      'ENCRYPTION_KEY',
      Buffer.alloc(32, 7).toString('base64'),
    );
    vi.doMock('~/db.server', () => ({
      getPrisma: () => ({
        appSettings: {
          findUnique: async () => ({ routerRuntimeConfigEnc: 'not-real-ciphertext' }),
        },
      }),
    }));
    const { getRouterRuntimeConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const result = await getRouterRuntimeConfig();
    expect(typeof result.parseError).toBe('string');
    expect(result.parseError && result.parseError.length).toBeGreaterThan(0);
    expect(result.config).toEqual(DEFAULT_ROUTER_RUNTIME_CONFIG);
  });

  it('returns defaults without a parseError when no ciphertext is stored', async () => {
    vi.stubEnv(
      'ENCRYPTION_KEY',
      Buffer.alloc(32, 7).toString('base64'),
    );
    vi.doMock('~/db.server', () => ({
      getPrisma: () => ({
        appSettings: {
          findUnique: async () => null,
        },
      }),
    }));
    const { getRouterRuntimeConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const result = await getRouterRuntimeConfig();
    expect(result.parseError).toBeUndefined();
    expect(result.config).toEqual(DEFAULT_ROUTER_RUNTIME_CONFIG);
  });
});
