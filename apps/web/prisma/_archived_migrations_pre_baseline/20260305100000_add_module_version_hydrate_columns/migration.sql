-- AlterTable: add hydrate envelope columns to ModuleVersion
ALTER TABLE "ModuleVersion" ADD COLUMN "hydratedAt" DATETIME;
ALTER TABLE "ModuleVersion" ADD COLUMN "adminConfigSchemaJson" TEXT;
ALTER TABLE "ModuleVersion" ADD COLUMN "adminDefaultsJson" TEXT;
ALTER TABLE "ModuleVersion" ADD COLUMN "themeEditorSettingsJson" TEXT;
ALTER TABLE "ModuleVersion" ADD COLUMN "uiTokensJson" TEXT;
ALTER TABLE "ModuleVersion" ADD COLUMN "validationReportJson" TEXT;
ALTER TABLE "ModuleVersion" ADD COLUMN "compiledRuntimePlanJson" TEXT;
