import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROUTER_RUNTIME_CONFIG,
  RouterRuntimeConfigSchema,
  type RouterRuntimeConfig,
} from '~/schemas/router-runtime-config.server';

const ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', ENCRYPTION_KEY);
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function makeStore(initial: string | null) {
  let stored: string | null = initial;
  const findUnique = vi.fn(async () => (stored === null ? null : { routerRuntimeConfigEnc: stored }));
  const upsert = vi.fn(async ({ create, update }: { create?: { routerRuntimeConfigEnc: string }; update?: { routerRuntimeConfigEnc: string } }) => {
    stored = (update?.routerRuntimeConfigEnc ?? create?.routerRuntimeConfigEnc) ?? stored;
    return { id: 'singleton', routerRuntimeConfigEnc: stored };
  });
  return {
    findUnique,
    upsert,
    snapshot: () => stored,
  };
}

describe('router runtime config round-trip', () => {
  it('encrypts on save and decrypts on load through the real crypto helpers', async () => {
    const store = makeStore(null);
    vi.doMock('~/db.server', () => ({
      getPrisma: () => ({ appSettings: store }),
    }));
    const { saveRouterRuntimeConfig, getRouterRuntimeConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const desired: RouterRuntimeConfig = {
      ...DEFAULT_ROUTER_RUNTIME_CONFIG,
      activeTarget: 'modalRemote',
      shadowMode: false,
      canaryShops: ['canary.myshopify.com'],
      releaseGateSchemaFailRateMax: 0.07,
      releaseGateFallbackRateMax: 0.12,
      targets: {
        ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets,
        modalRemote: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.modalRemote,
          url: 'https://modal.example.com',
          token: 'tok-roundtrip',
          timeoutMs: 4500,
        },
      },
    };

    const saved = await saveRouterRuntimeConfig(desired);
    expect(saved.activeTarget).toBe('modalRemote');
    expect(store.upsert).toHaveBeenCalledTimes(1);

    const reloaded = await getRouterRuntimeConfig();
    expect(reloaded.parseError).toBeUndefined();
    expect(reloaded.config.activeTarget).toBe('modalRemote');
    expect(reloaded.config.releaseGateSchemaFailRateMax).toBeCloseTo(0.07, 5);
    expect(reloaded.config.targets.modalRemote.url).toBe('https://modal.example.com');
    expect(reloaded.config.targets.modalRemote.token).toBe('tok-roundtrip');
    expect(reloaded.config.targets.modalRemote.timeoutMs).toBe(4500);
  });

  it('rejects timeoutMs values outside the 200..10_000 range', () => {
    expect(() =>
      RouterRuntimeConfigSchema.parse({
        ...DEFAULT_ROUTER_RUNTIME_CONFIG,
        targets: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets,
          localMachine: {
            ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine,
            timeoutMs: 50,
          },
        },
      }),
    ).toThrow();

    expect(() =>
      RouterRuntimeConfigSchema.parse({
        ...DEFAULT_ROUTER_RUNTIME_CONFIG,
        targets: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets,
          localMachine: {
            ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine,
            timeoutMs: 20_000,
          },
        },
      }),
    ).toThrow();
  });

  it('returns { config: defaults, parseError: string } when ciphertext is unreadable', async () => {
    const store = makeStore('this-is-not-valid-ciphertext');
    vi.doMock('~/db.server', () => ({
      getPrisma: () => ({ appSettings: store }),
    }));
    const { getRouterRuntimeConfig } = await import(
      '~/services/ai/router-runtime-config.server'
    );
    const result = await getRouterRuntimeConfig();
    expect(result.config).toEqual(DEFAULT_ROUTER_RUNTIME_CONFIG);
    expect(typeof result.parseError).toBe('string');
    expect(result.parseError && result.parseError.length).toBeGreaterThan(0);
  });
});
