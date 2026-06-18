-- Add encrypted first-layer router runtime config to AppSettings singleton row.
ALTER TABLE "AppSettings"
ADD COLUMN "routerRuntimeConfigEnc" TEXT;
