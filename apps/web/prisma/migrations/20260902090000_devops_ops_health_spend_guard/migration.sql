-- DevOps hardening (2026-09): ops health sweep heartbeat/snapshot + AI daily
-- spend soft cap. Additive only — three nullable columns on AppSettings.
ALTER TABLE "AppSettings" ADD COLUMN "cronLastTickAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN "opsHealthSnapshot" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "aiDailySpendCapCents" DOUBLE PRECISION;
