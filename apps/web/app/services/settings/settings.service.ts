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
};

export class SettingsService {
  async get(): Promise<AppSettingsData> {
    const prisma = getPrisma();
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
    };
  }

  async update(data: Partial<AppSettingsData>): Promise<AppSettingsData> {
    const prisma = getPrisma();
    const row = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...DEFAULTS, ...data },
      update: data,
    });
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
    };
  }
}
