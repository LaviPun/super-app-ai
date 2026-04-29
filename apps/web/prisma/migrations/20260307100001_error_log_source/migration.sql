-- AlterTable
ALTER TABLE "ErrorLog" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE INDEX "ErrorLog_source_createdAt_idx" ON "ErrorLog"("source", "createdAt");
