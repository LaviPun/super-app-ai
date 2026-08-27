-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "healthchecksApiKeyEnc" TEXT,
ADD COLUMN     "healthchecksCheckSlug" TEXT DEFAULT 'superapp-cron',
ADD COLUMN     "opsAlertThresholdCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "opsAlertThresholdWindowMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "opsSlackWebhookUrlEnc" TEXT,
ADD COLUMN     "sentryLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "uptimeRobotApiKeyEnc" TEXT,
ADD COLUMN     "uptimeRobotMonitorId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE INDEX "Job_status_startedAt_idx" ON "Job"("status", "startedAt");
