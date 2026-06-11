import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInternalAdminMock = vi.fn();
const upsertDefaultOpenAIMock = vi.fn();
const upsertDefaultClaudeMock = vi.fn();
const setActiveMock = vi.fn();
const activityLogMock = vi.fn(async () => undefined);

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/settings/settings.service', () => ({
  SettingsService: class {
    get = vi.fn(async () => ({
      appName: 'SuperApp AI',
      headerColor: '#000000',
      logoUrl: null,
      faviconUrl: null,
      adminName: 'Admin',
      adminEmail: null,
      profilePicUrl: null,
      companyName: null,
      supportEmail: null,
      supportUrl: null,
      privacyUrl: null,
      termsUrl: null,
      defaultTimezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      enableEmailAlerts: false,
      alertRecipients: null,
      maintenanceMode: false,
      maintenanceMessage: null,
      defaultAiProvider: null,
    }));
    update = vi.fn(async () => undefined);
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    upsertDefaultOpenAI = upsertDefaultOpenAIMock;
    upsertDefaultClaude = upsertDefaultClaudeMock;
    setActive = setActiveMock;
    getDefaultProvidersForSettings = vi.fn(async () => ({}));
    list = vi.fn(async () => []);
    getActive = vi.fn(async () => null);
  },
}));

function buildFormRequest(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://test/internal/settings', { method: 'POST', body: form });
}

describe('internal.settings ai actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
  });

  it('saveOpenAI writes provider defaults via AiProviderService', async () => {
    const mod = await import('~/routes/internal.settings');
    const res = await mod.action({
      request: buildFormRequest({
        intent: 'saveOpenAI',
        openaiApiKey: 'sk-test',
        openaiModel: 'gpt-4o-mini',
      }),
    });
    expect(upsertDefaultOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    });
    expect(res.status).toBe(200);
  });

  it('saveClaude includes skills and codeExecution in extraConfig', async () => {
    const mod = await import('~/routes/internal.settings');
    const res = await mod.action({
      request: buildFormRequest({
        intent: 'saveClaude',
        claudeApiKey: 'ck-test',
        claudeModel: 'claude-sonnet-4',
        claudeSkills: 'pptx, xlsx',
        claudeCodeExecution: 'true',
      }),
    });
    expect(upsertDefaultClaudeMock).toHaveBeenCalledWith({
      apiKey: 'ck-test',
      model: 'claude-sonnet-4',
      extraConfig: { skills: ['pptx', 'xlsx'], codeExecution: true },
    });
    expect(res.status).toBe(200);
  });
});
