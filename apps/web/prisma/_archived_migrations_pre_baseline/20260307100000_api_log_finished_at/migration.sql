-- AlterTable
ALTER TABLE "ApiLog" ADD COLUMN "finishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ApiLog_finishedAt_idx" ON "ApiLog"("finishedAt");
