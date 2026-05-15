-- Phase 2D GDPR redact completion:
-- add indexed customerId columns for fast customer-level purges.

ALTER TABLE "DataCapture" ADD COLUMN "customerId" TEXT;
ALTER TABLE "DataStoreRecord" ADD COLUMN "customerId" TEXT;
ALTER TABLE "ModuleEvent" ADD COLUMN "customerId" TEXT;
ALTER TABLE "AttributionLink" ADD COLUMN "customerId" TEXT;

CREATE INDEX "DataCapture_customerId_idx" ON "DataCapture"("customerId");
CREATE INDEX "DataStoreRecord_customerId_idx" ON "DataStoreRecord"("customerId");
CREATE INDEX "ModuleEvent_customerId_idx" ON "ModuleEvent"("customerId");
CREATE INDEX "AttributionLink_customerId_idx" ON "AttributionLink"("customerId");
