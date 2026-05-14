import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
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
