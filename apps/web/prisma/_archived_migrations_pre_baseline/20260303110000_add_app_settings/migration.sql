-- Create the AppSettings singleton table. This table was historically introduced
-- via `prisma db push` and never captured in a migration, so a from-scratch
-- replay failed at the first `ALTER TABLE "AppSettings"` (add_category_overrides).
-- This migration is ordered (110000) to run after the init (102905) and before
-- the first ALTER (120001). Only BASE columns are created here; the six columns
-- added by later migrations (categoryOverrides, templateSpecOverrides,
-- defaultAiProvider, routerRuntimeConfigEnc, designReferenceUrl,
-- moduleSystemVersion) are added by their own migrations.
CREATE TABLE "AppSettings" (
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
    "fallbackAiProviderId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
