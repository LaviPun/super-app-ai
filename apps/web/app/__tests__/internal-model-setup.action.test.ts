import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROUTER_RUNTIME_CONFIG,
  type RouterRuntimeConfig,
} from '~/schemas/router-runtime-config.server';

const validateAssistantChatTargetMock = vi.fn();
const probeTargetLivenessMock = vi.fn();
const fetchWithTimeoutMock = vi.fn();
const getRouterRuntimeConfigMock = vi.fn();
const saveRouterRuntimeConfigMock = vi.fn();
const resolveRouterTargetConfigMock = vi.fn();
const activityLogMock = vi.fn(async () => {});
const settingsGetMock = vi.fn(async () => ({ designReferenceUrl: null }));
const settingsUpdateMock = vi.fn(async () => undefined);
const getPromptRouterMetricsSnapshotMock = vi.fn(() => ({
  attempts: 0,
  successes: 0,
  failures: 0,
  shadowsRecorded: 0,
  canarySkips: 0,
  circuitSkips: 0,
  harnessModuleTypeCorrections: 0,
  harnessConfidenceClamps: 0,
  byTarget: {
    localMachine: { attempts: 0, successes: 0, failures: 0, fallbacks: 0, schemaRejects: 0, timeoutsOrNetwork: 0, p95LatencyMs: 0 },
    modalRemote: { attempts: 0, successes: 0, failures: 0, fallbacks: 0, schemaRejects: 0, timeoutsOrNetwork: 0, p95LatencyMs: 0 },
  },
}));
const getReleaseGateStateMock = vi.fn(() => ({ tripped: false }));

vi.mock('~/services/ai/assistant-chat-target-probe.server', () => ({
  validateAssistantChatTarget: validateAssistantChatTargetMock,
  probeTargetLiveness: probeTargetLivenessMock,
  fetchWithTimeout: fetchWithTimeoutMock,
}));

vi.mock('~/services/ai/router-runtime-config.server', async () => {
  const actualSchemas = await import('~/schemas/router-runtime-config.server');
  return {
    getRouterRuntimeConfig: getRouterRuntimeConfigMock,
    saveRouterRuntimeConfig: saveRouterRuntimeConfigMock,
    resolveRouterTargetConfig: resolveRouterTargetConfigMock,
    maskToken: (token?: string | null) => (token ? `••••${token.slice(-2)}` : ''),
    DEFAULT_ROUTER_RUNTIME_CONFIG: actualSchemas.DEFAULT_ROUTER_RUNTIME_CONFIG,
  };
});

vi.mock('~/services/ai/prompt-router.server', () => ({
  getPromptRouterMetricsSnapshot: getPromptRouterMetricsSnapshotMock,
  getReleaseGateState: getReleaseGateStateMock,
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    async log(...args: unknown[]) {
      return activityLogMock(...args);
    }
  },
}));

vi.mock('~/services/settings/settings.service', () => ({
  SettingsService: class {
    async get() {
      return settingsGetMock();
    }
    async update(input: unknown) {
      return settingsUpdateMock(input);
    }
  },
}));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: vi.fn(async () => undefined),
}));

function buildConfig(overrides: Partial<RouterRuntimeConfig> = {}): RouterRuntimeConfig {
  return {
    ...DEFAULT_ROUTER_RUNTIME_CONFIG,
    targets: {
      localMachine: { ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine },
      modalRemote: { ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.modalRemote },
    },
    ...overrides,
  };
}

function makeFormRequest(body: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.set(key, value);
  return new Request('http://test/internal/model-setup', { method: 'POST', body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  saveRouterRuntimeConfigMock.mockImplementation(async (cfg: RouterRuntimeConfig) => cfg);
  validateAssistantChatTargetMock.mockResolvedValue({ ok: true, message: 'ok' });
});

afterEach(() => {
  vi.resetModules();
});

describe('handleModelSetupAction', () => {
  it('switchTarget flips activeTarget, records previousTarget, and forces shadowMode=true', async () => {
    const current = buildConfig({
      activeTarget: 'localMachine',
      shadowMode: false,
      previousTarget: undefined,
    });
    getRouterRuntimeConfigMock.mockResolvedValue({ config: current });

    const { handleModelSetupAction } = await import('~/routes/internal.model-setup');
    const response = await handleModelSetupAction(
      makeFormRequest({ intent: 'switchTarget', target: 'modalRemote' }),
    );

    expect(response.status).toBe(200);
    expect(saveRouterRuntimeConfigMock).toHaveBeenCalledTimes(1);
    const saved = saveRouterRuntimeConfigMock.mock.calls[0][0] as RouterRuntimeConfig;
    expect(saved.activeTarget).toBe('modalRemote');
    expect(saved.previousTarget).toBe('localMachine');
    expect(saved.shadowMode).toBe(true);
    const json = (await response.json()) as { toast?: { message: string } };
    expect(json.toast?.message).toContain('Active target switched to modalRemote');
  });

  it('rollback reverts to previousTarget and keeps shadow mode on', async () => {
    const current = buildConfig({
      activeTarget: 'modalRemote',
      previousTarget: 'localMachine',
      shadowMode: false,
    });
    getRouterRuntimeConfigMock.mockResolvedValue({ config: current });

    const { handleModelSetupAction } = await import('~/routes/internal.model-setup');
    const response = await handleModelSetupAction(makeFormRequest({ intent: 'rollback' }));

    expect(response.status).toBe(200);
    expect(saveRouterRuntimeConfigMock).toHaveBeenCalledTimes(1);
    const saved = saveRouterRuntimeConfigMock.mock.calls[0][0] as RouterRuntimeConfig;
    expect(saved.activeTarget).toBe('localMachine');
    expect(saved.shadowMode).toBe(true);
    const json = (await response.json()) as { toast?: { message: string } };
    expect(json.toast?.message).toContain('Rolled back to localMachine');
  });

  it('rollback errors when no previousTarget is recorded', async () => {
    const current = buildConfig({ activeTarget: 'modalRemote', previousTarget: undefined });
    getRouterRuntimeConfigMock.mockResolvedValue({ config: current });

    const { handleModelSetupAction } = await import('~/routes/internal.model-setup');
    const response = await handleModelSetupAction(makeFormRequest({ intent: 'rollback' }));

    expect(response.status).toBe(400);
    expect(saveRouterRuntimeConfigMock).not.toHaveBeenCalled();
    const json = (await response.json()) as { error?: string };
    expect(json.error).toMatch(/No previous target/);
  });

  it('save rejects with the operator-visible message when validateAssistantChatTarget reports a router-only URL', async () => {
    const current = buildConfig();
    getRouterRuntimeConfigMock.mockResolvedValue({ config: current });
    validateAssistantChatTargetMock.mockImplementation(async ({ target }: { target: string }) => {
      if (target === 'modalRemote') {
        return {
          ok: false,
          message:
            'modalRemote URL appears to be the router /route proxy, not a real chat host. Point this at vLLM/Ollama.',
        };
      }
      return { ok: true, message: 'ok' };
    });

    const { handleModelSetupAction } = await import('~/routes/internal.model-setup');
    const response = await handleModelSetupAction(
      makeFormRequest({
        intent: 'save',
        activeTarget: 'localMachine',
        dualTargetEnabled: 'false',
        shadowMode: 'true',
        circuitFailureThreshold: '5',
        circuitCooldownMs: '30000',
        releaseGateSchemaFailRateMax: '0.02',
        releaseGateFallbackRateMax: '0.05',
        localUrl: 'http://127.0.0.1:11434',
        localBackend: 'ollama',
        localModel: 'qwen3:4b-instruct',
        localTimeoutMs: '3000',
        modalUrl: 'https://example.modal.run',
        modalBackend: 'openai',
        modalModel: 'Qwen/Qwen3-4B-Instruct',
        modalTimeoutMs: '3000',
      }),
    );

    expect(response.status).toBe(400);
    expect(saveRouterRuntimeConfigMock).not.toHaveBeenCalled();
    const json = (await response.json()) as { error?: string };
    expect(json.error).toMatch(/strict assistant target validation/);
    expect(json.error).toMatch(/router \/route proxy/);
  });
});
