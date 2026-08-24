import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 8 (WS-G, Decision D5): support triage defaults to CLOUD when AppSettings
 * has no explicit mode set (matching the new `supportTriageMode @default("cloud")`
 * column default) and no SUPPORT_TRIAGE_PROVIDER env override is present — "no
 * local-model dependency in production" per D5. Local requires an EXPLICIT
 * 'local' row value or SUPPORT_TRIAGE_PROVIDER=local env.
 *
 * Cloud-to-cloud failover (never local) is already provided structurally by
 * getLlmClient's existing withManualFallback/FallbackLlmClient chain
 * (apps/web/app/services/ai/llm.server.ts) when no operator provider pin is
 * set — this test proves runSupportTriage surfaces a failed outcome with
 * provider:'cloud' (never 'local') when that chain is exhausted.
 */

const findUniqueAppSettingsMock = vi.fn();
const findUniqueAiProviderMock = vi.fn(async () => null);

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: { findUnique: findUniqueAppSettingsMock },
    aiProvider: { findUnique: findUniqueAiProviderMock },
  }),
}));

const getLlmClientMock = vi.fn();
vi.mock('~/services/ai/llm.server', () => ({
  getLlmClient: getLlmClientMock,
  attributeServedCost: vi.fn(async () => ({ providerId: 'p1', costCents: 0 })),
  recordAiUsage: vi.fn(async () => {}),
  ConfiguredLlmClient: class {
    constructor(public id: string) {}
    async generateRecipe() {
      throw new Error('pinned provider should not be used in this test');
    }
  },
}));

vi.mock('~/services/observability/ai-usage.service', () => ({
  AiUsageService: class {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueAiProviderMock.mockResolvedValue(null);
});

describe('resolveTriageConfig — D5 cloud default', () => {
  it('defaults to cloud when AppSettings has no explicit mode and no env override', async () => {
    findUniqueAppSettingsMock.mockResolvedValue({ supportTriageMode: null, supportTriageProviderId: null });
    delete process.env.SUPPORT_TRIAGE_PROVIDER;

    const { resolveTriageConfig } = await import('~/services/support/triage.server');
    const config = await resolveTriageConfig();
    expect(config.provider).toBe('cloud');
  });

  it('stays local only when AppSettings explicitly stores "local"', async () => {
    findUniqueAppSettingsMock.mockResolvedValue({ supportTriageMode: 'local', supportTriageProviderId: null });
    delete process.env.SUPPORT_TRIAGE_PROVIDER;

    const { resolveTriageConfig } = await import('~/services/support/triage.server');
    const config = await resolveTriageConfig();
    expect(config.provider).toBe('local');
  });

  it('an env override still wins over the DB default', async () => {
    findUniqueAppSettingsMock.mockResolvedValue({ supportTriageMode: null, supportTriageProviderId: null });
    process.env.SUPPORT_TRIAGE_PROVIDER = 'local';

    const { resolveTriageConfig } = await import('~/services/support/triage.server');
    const config = await resolveTriageConfig();
    expect(config.provider).toBe('local');
    delete process.env.SUPPORT_TRIAGE_PROVIDER;
  });
});

describe('runSupportTriage — cloud-to-cloud failover (never local)', () => {
  it('surfaces ok:false with provider:"cloud" (never "local") when the cloud chain is exhausted', async () => {
    findUniqueAppSettingsMock.mockResolvedValue({ supportTriageMode: null, supportTriageProviderId: null });
    delete process.env.SUPPORT_TRIAGE_PROVIDER;
    // getLlmClient already returns a FallbackLlmClient chaining primary + AppSettings.fallbackAiProviderId
    // (llm.server.ts withManualFallback) — simulate that chain being fully exhausted.
    getLlmClientMock.mockResolvedValue({
      client: { generateRecipe: vi.fn(async () => { throw new Error('primary and fallback both down'); }) },
      providerId: 'p1',
    });

    const { runSupportTriage } = await import('~/services/support/triage.server');
    const outcome = await runSupportTriage({ subject: 's', description: 'd', shopDomain: 'x.myshopify.com' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.provider).toBe('cloud');
      expect(outcome.error).toMatch(/primary and fallback both down/);
    }
  });

  it('never throws even when the cloud chain rejects', async () => {
    findUniqueAppSettingsMock.mockResolvedValue({ supportTriageMode: null, supportTriageProviderId: null });
    getLlmClientMock.mockRejectedValue(new Error('no provider configured'));

    const { runSupportTriage } = await import('~/services/support/triage.server');
    await expect(
      runSupportTriage({ subject: 's', description: 'd', shopDomain: 'x.myshopify.com' }),
    ).resolves.toMatchObject({ ok: false, provider: 'cloud' });
  });
});
