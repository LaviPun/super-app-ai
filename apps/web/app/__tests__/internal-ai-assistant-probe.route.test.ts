import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROUTER_RUNTIME_CONFIG } from '~/schemas/router-runtime-config.server';

const probeTargetLivenessMock = vi.fn();
const validateAssistantChatTargetMock = vi.fn();
const getRouterRuntimeConfigMock = vi.fn();
const requireInternalAdminMock = vi.fn();

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
});

describe('probeAssistantTargets', () => {
  it('returns probe results for both targets', async () => {
    const mod = await import('~/routes/internal.ai-assistant.probe');
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
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const result = await mod.probeAssistantTargets();
    expect(result.parseError).toBe('bad config: missing field foo');
  });

  it('accepts unwrapped legacy config shape', async () => {
    getRouterRuntimeConfigMock.mockResolvedValueOnce(DEFAULT_ROUTER_RUNTIME_CONFIG);
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const result = await mod.probeAssistantTargets();
    expect(result.parseError).toBeUndefined();
  });

  it('records a parseError when loadConfig throws', async () => {
    getRouterRuntimeConfigMock.mockRejectedValueOnce(new Error('boom'));
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const result = await mod.probeAssistantTargets();
    expect(result.parseError).toContain('boom');
  });
});

describe('probe route loader', () => {
  it('requires internal admin', async () => {
    requireInternalAdminMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const mod = await import('~/routes/internal.ai-assistant.probe');
    await expect(
      mod.loader({ request: new Request('http://test/internal/ai-assistant/probe') } as any),
    ).rejects.toBeInstanceOf(Response);
  });

  it('returns JSON probe payload for an admin', async () => {
    const mod = await import('~/routes/internal.ai-assistant.probe');
    const response = await mod.loader({
      request: new Request('http://test/internal/ai-assistant/probe'),
    } as any);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as { localMachine?: unknown; modalRemote?: unknown };
    expect(body.localMachine).toBeDefined();
    expect(body.modalRemote).toBeDefined();
  });
});
