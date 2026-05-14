import { getPrisma } from '~/db.server';

export interface AppSettingsData {
  appName: string;
  headerColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  adminName: string;
  adminEmail: string | null;
  profilePicUrl: string | null;
  companyName: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  defaultTimezone: string;
  dateFormat: string;
  enableEmailAlerts: boolean;
  alertRecipients: string | null;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  /** JSON: { [category]: { displayName?: string, enabled?: boolean } } */
  categoryOverrides: string | null;
  /** JSON: { [templateId]: RecipeSpec } for recipe-edit "All recipes" overrides */
  templateSpecOverrides: string | null;
  /** When using .env keys: 'openai' | 'claude'; null = use DB active then OpenAI env fallback */
  defaultAiProvider: 'openai' | 'claude' | null;
  /** Optional storefront site URL used as visual design reference for premium prompt guidance. */
  designReferenceUrl: string | null;
}

function coerceDefaultAiProvider(value: string | null | undefined): 'openai' | 'claude' | null {
  if (value === 'openai' || value === 'claude') return value;
  return null;
}

function isMissingDesignReferenceUrlColumnError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('designReferenceUrl');
}

const DEFAULTS: AppSettingsData = {
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
  defaultAiProvider: null,
  designReferenceUrl: null,
};

export class SettingsService {
  async get(): Promise<AppSettingsData> {
    const prisma = getPrisma();
    try {
      const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
      if (!row) return { ...DEFAULTS };
      return {
        appName: row.appName,
        headerColor: row.headerColor,
        logoUrl: row.logoUrl,
        faviconUrl: row.faviconUrl,
        adminName: row.adminName,
        adminEmail: row.adminEmail,
        profilePicUrl: row.profilePicUrl,
        companyName: row.companyName,
        supportEmail: row.supportEmail,
        supportUrl: row.supportUrl,
        privacyUrl: row.privacyUrl,
        termsUrl: row.termsUrl,
        defaultTimezone: row.defaultTimezone,
        dateFormat: row.dateFormat,
        enableEmailAlerts: row.enableEmailAlerts,
        alertRecipients: row.alertRecipients,
        maintenanceMode: row.maintenanceMode,
        maintenanceMessage: row.maintenanceMessage,
        categoryOverrides: row.categoryOverrides,
        templateSpecOverrides: row.templateSpecOverrides,
        defaultAiProvider: coerceDefaultAiProvider(row.defaultAiProvider),
        designReferenceUrl: row.designReferenceUrl,
      };
    } catch (error) {
      if (!isMissingDesignReferenceUrlColumnError(error)) throw error;
      const row = await prisma.appSettings.findUnique({
        where: { id: 'singleton' },
        select: {
          appName: true,
          headerColor: true,
          logoUrl: true,
          faviconUrl: true,
          adminName: true,
          adminEmail: true,
          profilePicUrl: true,
          companyName: true,
          supportEmail: true,
          supportUrl: true,
          privacyUrl: true,
          termsUrl: true,
          defaultTimezone: true,
          dateFormat: true,
          enableEmailAlerts: true,
          alertRecipients: true,
          maintenanceMode: true,
          maintenanceMessage: true,
          categoryOverrides: true,
          templateSpecOverrides: true,
          defaultAiProvider: true,
        },
      });
      if (!row) return { ...DEFAULTS };
      return {
        ...row,
        defaultAiProvider: coerceDefaultAiProvider(row.defaultAiProvider),
        designReferenceUrl: null,
      };
    }
  }

  async update(data: Partial<AppSettingsData>): Promise<AppSettingsData> {
    const prisma = getPrisma();
    const next: Partial<AppSettingsData> = { ...data };
    if (Object.prototype.hasOwnProperty.call(data, 'defaultAiProvider')) {
      next.defaultAiProvider = coerceDefaultAiProvider(data.defaultAiProvider);
    }
    let row;
    try {
      row = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', ...DEFAULTS, ...next },
        update: next,
      });
    } catch (error) {
      if (!isMissingDesignReferenceUrlColumnError(error)) throw error;
      const { designReferenceUrl: _ignored, ...safeNext } = next;
      row = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', ...DEFAULTS, ...safeNext },
        update: safeNext,
      });
    }
    return {
      appName: row.appName,
      headerColor: row.headerColor,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      adminName: row.adminName,
      adminEmail: row.adminEmail,
      profilePicUrl: row.profilePicUrl,
      companyName: row.companyName,
      supportEmail: row.supportEmail,
      supportUrl: row.supportUrl,
      privacyUrl: row.privacyUrl,
      termsUrl: row.termsUrl,
      defaultTimezone: row.defaultTimezone,
      dateFormat: row.dateFormat,
      enableEmailAlerts: row.enableEmailAlerts,
      alertRecipients: row.alertRecipients,
      maintenanceMode: row.maintenanceMode,
      maintenanceMessage: row.maintenanceMessage,
      categoryOverrides: row.categoryOverrides,
      templateSpecOverrides: row.templateSpecOverrides,
      defaultAiProvider: coerceDefaultAiProvider(row.defaultAiProvider),
      designReferenceUrl: row.designReferenceUrl,
    };
  }
}
