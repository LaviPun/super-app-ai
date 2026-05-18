import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROUTER_RUNTIME_CONFIG } from '~/schemas/router-runtime-config.server';

const requireInternalAdminMock = vi.fn();
const getRouterRuntimeConfigMock = vi.fn();
const resolveRouterTargetConfigMock = vi.fn();
const settingsGetMock = vi.fn();
const getPromptRouterMetricsSnapshotMock = vi.fn();
const getReleaseGateStateMock = vi.fn();

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/ai/router-runtime-config.server', () => ({
  getRouterRuntimeConfig: getRouterRuntimeConfigMock,
  resolveRouterTargetConfig: resolveRouterTargetConfigMock,
  saveRouterRuntimeConfig: vi.fn(),
  maskToken: (value?: string | null) => (value ? `••••${value.slice(-2)}` : ''),
}));

vi.mock('~/services/settings/settings.service', () => ({
  SettingsService: class {
    async get() {
      return settingsGetMock();
    }
  },
}));

vi.mock('~/services/ai/prompt-router.server', () => ({
  getPromptRouterMetricsSnapshot: getPromptRouterMetricsSnapshotMock,
  getReleaseGateState: getReleaseGateStateMock,
}));

describe('internal.model-setup loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INTERNAL_AI_LOCAL_ONLY;
    requireInternalAdminMock.mockResolvedValue(undefined);
    settingsGetMock.mockResolvedValue({ designReferenceUrl: null });
    getRouterRuntimeConfigMock.mockResolvedValue({ config: DEFAULT_ROUTER_RUNTIME_CONFIG, parseError: undefined });
    resolveRouterTargetConfigMock.mockResolvedValue({
      target: 'localMachine',
      url: DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine.url ?? null,
      token: DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine.token ?? null,
      releaseGateSchemaFailRateMax: DEFAULT_ROUTER_RUNTIME_CONFIG.releaseGateSchemaFailRateMax,
      releaseGateFallbackRateMax: DEFAULT_ROUTER_RUNTIME_CONFIG.releaseGateFallbackRateMax,
    });
    getPromptRouterMetricsSnapshotMock.mockReturnValue({
      attempts: 0,
      successes: 0,
      failures: 0,
      shadowsRecorded: 0,
      canarySkips: 0,
      circuitSkips: 0,
      harnessModuleTypeCorrections: 0,
      harnessConfidenceClamps: 0,
      byTarget: {
        localMachine: {
          attempts: 0,
          successes: 0,
          failures: 0,
          fallbacks: 0,
          schemaRejects: 0,
          timeoutsOrNetwork: 0,
          p95LatencyMs: 0,
        },
        modalRemote: {
          attempts: 0,
          successes: 0,
          failures: 0,
          fallbacks: 0,
          schemaRejects: 0,
          timeoutsOrNetwork: 0,
          p95LatencyMs: 0,
        },
      },
    });
    getReleaseGateStateMock.mockReturnValue({ tripped: false, reason: null });
  });

  it('returns parseError and modalProxyWarning from wrapped config', async () => {
    getRouterRuntimeConfigMock.mockResolvedValueOnce({
      config: {
        ...DEFAULT_ROUTER_RUNTIME_CONFIG,
        targets: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets,
          modalRemote: {
            ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.modalRemote,
            url: 'https://example.modal.run',
          },
        },
      },
      parseError: 'unable to decrypt',
    });
    const mod = await import('~/routes/internal.model-setup');
    const res = await mod.loader({
      request: new Request('http://test/internal/model-setup'),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { parseError: string; modalProxyWarning: boolean };
    expect(body.parseError).toBe('unable to decrypt');
    expect(body.modalProxyWarning).toBe(true);
  });

  it('forces assistantLocalOnly=true when env gate is enabled', async () => {
    process.env.INTERNAL_AI_LOCAL_ONLY = '1';
    const mod = await import('~/routes/internal.model-setup');
    const res = await mod.loader({
      request: new Request('http://test/internal/model-setup'),
    });
    const body = (await res.json()) as { assistantLocalOnly: boolean };
    expect(body.assistantLocalOnly).toBe(true);
  });
});
