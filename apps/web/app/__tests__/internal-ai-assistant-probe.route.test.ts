import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { AppError } from '~/services/errors/app-error.server';
import { DEFAULT_ROUTER_RUNTIME_CONFIG } from '~/schemas/router-runtime-config.server';

const probeTargetLivenessMock = vi.fn();
const validateAssistantChatTargetMock = vi.fn();
const getRouterRuntimeConfigMock = vi.fn();
const requireInternalAdminMock = vi.fn();
const isInternalAiLocalOnlyEnabledMock = vi.fn(() => false);
const enforceInternalAiRateLimitMock = vi.fn();

vi.mock('~/services/ai/assistant-chat-target-probe.server', () => ({
  probeTargetLiveness: probeTargetLivenessMock,
  validateAssistantChatTarget: validateAssistantChatTargetMock,
}));

vi.mock('~/services/ai/router-runtime-config.server', () => ({
  getRouterRuntimeConfig: getRouterRuntimeConfigMock,
}));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/env.server', () => ({
  isInternalAiLocalOnlyEnabled: () => isInternalAiLocalOnlyEnabledMock(),
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceInternalAiRateLimit: enforceInternalAiRateLimitMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  probeTargetLivenessMock.mockImplementation(async (input: { url?: string }) => ({
    ok: Boolean(input.url),
    message: input.url ? 'healthy' : 'not configured',
  }));
  validateAssistantChatTargetMock.mockImplementation(async (input: { target: string }) => ({
    ok: true,
    message: `${input.target} chat ok`,
  }));
  requireInternalAdminMock.mockResolvedValue({ adminId: 'admin-1' });
  getRouterRuntimeConfigMock.mockResolvedValue({ config: DEFAULT_ROUTER_RUNTIME_CONFIG });
  isInternalAiLocalOnlyEnabledMock.mockReturnValue(false);
  enforceInternalAiRateLimitMock.mockResolvedValue(undefined);
});

describe('probeAssistantTargets', () => {
  it('returns probe results for both targets', async () => {
    const mod = await import('~/services/ai/assistant-probe-route.server');
    const result = await mod.probeAssistantTargets();
    expect(result.localMachine).toBeDefined();
    expect(result.modalRemote).toBeDefined();
    expect(result.localMachine.health.message).toContain('healthy');
    expect(result.modalRemote.chatProbe.message).toContain('modalRemote');
    expect(probeTargetLivenessMock).toHaveBeenCalledTimes(2);
    expect(validateAssistantChatTargetMock).toHaveBeenCalledTimes(2);
  });

  it('passes parseError through when getRouterRuntimeConfig returns wrapped config with parseError', async () => {
    getRouterRuntimeConfigMock.mockResolvedValueOnce({
      config: DEFAULT_ROUTER_RUNTIME_CONFIG,
      parseError: 'bad config: missing field foo',
    });
    const mod = await import('~/services/ai/assistant-probe-route.server');
    const result = await mod.probeAssistantTargets();
    expect(result.parseError).toBe('bad config: missing field foo');
  });

  it('accepts unwrapped legacy config shape', async () => {
    getRouterRuntimeConfigMock.mockResolvedValueOnce(DEFAULT_ROUTER_RUNTIME_CONFIG);
    const mod = await import('~/services/ai/assistant-probe-route.server');
    const result = await mod.probeAssistantTargets();
    expect(result.parseError).toBeUndefined();
  });

  it('records a parseError when loadConfig throws', async () => {
    getRouterRuntimeConfigMock.mockRejectedValueOnce(new Error('boom'));
    const mod = await import('~/services/ai/assistant-probe-route.server');
    const result = await mod.probeAssistantTargets();
    expect(result.parseError).toContain('boom');
  });

  it('skips modal probe calls while INTERNAL_AI_LOCAL_ONLY is enabled', async () => {
    isInternalAiLocalOnlyEnabledMock.mockReturnValue(true);
    const mod = await import('~/services/ai/assistant-probe-route.server');
    const result = await mod.probeAssistantTargets();
    expect(result.modalRemote.health.message).toContain('disabled');
    expect(result.modalRemote.chatProbe.message).toContain('disabled');
    expect(probeTargetLivenessMock).toHaveBeenCalledTimes(1);
    expect(validateAssistantChatTargetMock).toHaveBeenCalledTimes(1);
  });
});

describe('probe route loader', () => {
  it('requires internal admin', async () => {
    requireInternalAdminMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const args = { request: new Request('http://test/internal/ai-assistant/probe') } as LoaderFunctionArgs;
    await expect(
      mod.loader(args),
    ).rejects.toBeInstanceOf(Response);
  });

  it('returns JSON probe payload for an admin', async () => {
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const args = {
      request: new Request('http://test/internal/ai-assistant/probe'),
    } as LoaderFunctionArgs;
    const response = await mod.loader(args);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as { localMachine?: unknown; modalRemote?: unknown };
    expect(body.localMachine).toBeDefined();
    expect(body.modalRemote).toBeDefined();
  });

  it('returns 429 when probe rate limit is exceeded', async () => {
    enforceInternalAiRateLimitMock.mockRejectedValueOnce(
      new AppError({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: { retryAfterSec: '15' },
      }),
    );
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const args = {
      request: new Request('http://test/internal/ai-assistant/probe'),
    } as LoaderFunctionArgs;
    const response = await mod.loader(args);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('15');
  });
});
