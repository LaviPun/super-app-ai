-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "appName" TEXT NOT NULL DEFAULT 'SuperApp AI',
    "headerColor" TEXT NOT NULL DEFAULT '#000000',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "adminName" TEXT NOT NULL DEFAULT 'Admin',
    "adminEmail" TEXT,
    "profilePicUrl" TEXT,
    "companyName" TEXT,
    "supportEmail" TEXT,
    "supportUrl" TEXT,
    "privacyUrl" TEXT,
    "termsUrl" TEXT,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "enableEmailAlerts" BOOLEAN NOT NULL DEFAULT false,
    "alertRecipients" TEXT,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "categoryOverrides" TEXT,
    "templateSpecOverrides" TEXT,
    "defaultAiProvider" TEXT,
    "fallbackAiProviderId" TEXT,
    "designReferenceUrl" TEXT,
    "routerRuntimeConfigEnc" TEXT,
    "moduleSystemVersion" TEXT NOT NULL DEFAULT 'v1',
    "supportTriageMode" TEXT NOT NULL DEFAULT 'local',
    "supportTriageProviderId" TEXT,
    "emailProvider" TEXT,
    "emailFrom" TEXT,
    "emailApiUrl" TEXT,
    "emailApiKeyEnc" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassEnc" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("adminEmail", "adminName", "alertRecipients", "appName", "categoryOverrides", "companyName", "dateFormat", "defaultAiProvider", "defaultTimezone", "designReferenceUrl", "enableEmailAlerts", "fallbackAiProviderId", "faviconUrl", "headerColor", "id", "logoUrl", "maintenanceMessage", "maintenanceMode", "moduleSystemVersion", "privacyUrl", "profilePicUrl", "routerRuntimeConfigEnc", "supportEmail", "supportTriageMode", "supportTriageProviderId", "supportUrl", "templateSpecOverrides", "termsUrl", "updatedAt") SELECT "adminEmail", "adminName", "alertRecipients", "appName", "categoryOverrides", "companyName", "dateFormat", "defaultAiProvider", "defaultTimezone", "designReferenceUrl", "enableEmailAlerts", "fallbackAiProviderId", "faviconUrl", "headerColor", "id", "logoUrl", "maintenanceMessage", "maintenanceMode", "moduleSystemVersion", "privacyUrl", "profilePicUrl", "routerRuntimeConfigEnc", "supportEmail", "supportTriageMode", "supportTriageProviderId", "supportUrl", "templateSpecOverrides", "termsUrl", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
