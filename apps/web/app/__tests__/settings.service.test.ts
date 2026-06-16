import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '~/services/settings/settings.service';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appSettings: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

function appSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'singleton',
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
    categoryOverrides: null,
    templateSpecOverrides: null,
    defaultAiProvider: 'openai',
    designReferenceUrl: null,
    ...overrides,
  };
}

describe('SettingsService.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the stored default AI provider on unrelated partial updates', async () => {
    prismaMock.appSettings.upsert.mockResolvedValueOnce(appSettingsRow({ appName: 'Renamed' }));

    const settings = await new SettingsService().update({ appName: 'Renamed' });

    expect(settings.defaultAiProvider).toBe('openai');
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { appName: 'Renamed' },
      }),
    );
  });

  it('clears the default AI provider when explicitly set to null', async () => {
    prismaMock.appSettings.upsert.mockResolvedValueOnce(appSettingsRow({ defaultAiProvider: null }));

    const settings = await new SettingsService().update({ defaultAiProvider: null });

    expect(settings.defaultAiProvider).toBeNull();
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { defaultAiProvider: null },
      }),
    );
  });
});
