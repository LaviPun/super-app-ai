-- Phase 3.1: cross-record correlation ids for end-to-end tracing.
--
-- Adds optional requestId/correlationId columns to API logs, jobs, error logs,
-- AI usage rows, and flow step logs so a single merchant-facing operation can
-- be reconstructed from any starting point. All columns are nullable so existing
-- rows backfill to NULL safely; backfilling is intentionally left to runtime.
--
-- SQLite has no schema-altering DDL for adding indexes inline, so each
-- ALTER TABLE / CREATE INDEX is emitted as a separate statement.

-- AlterTable: ApiLog
ALTER TABLE "ApiLog" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "ApiLog_correlationId_idx" ON "ApiLog"("correlationId");

-- AlterTable: Job
ALTER TABLE "Job" ADD COLUMN "requestId" TEXT;
ALTER TABLE "Job" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "Job_requestId_idx" ON "Job"("requestId");
CREATE INDEX "Job_correlationId_idx" ON "Job"("correlationId");

-- AlterTable: ErrorLog
ALTER TABLE "ErrorLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "ErrorLog" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "ErrorLog_requestId_idx" ON "ErrorLog"("requestId");
CREATE INDEX "ErrorLog_correlationId_idx" ON "ErrorLog"("correlationId");

-- AlterTable: AiUsage
ALTER TABLE "AiUsage" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "AiUsage_correlationId_idx" ON "AiUsage"("correlationId");

-- AlterTable: FlowStepLog
ALTER TABLE "FlowStepLog" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "FlowStepLog_correlationId_idx" ON "FlowStepLog"("correlationId");

-- AlterTable: ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "ActivityLog_requestId_idx" ON "ActivityLog"("requestId");
CREATE INDEX "ActivityLog_correlationId_idx" ON "ActivityLog"("correlationId");
