-- Widen AiUsage.costCents from Int to Float so sub-cent per-call cost is preserved.
-- Integer cents rounded cheap-model calls (< 1¢) to 0, making a month of cheap
-- traffic read as $0 despite real spend. Float keeps aggregate cost accurate.
-- SQLite requires a table rebuild to change a column type.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "shopId" TEXT,
    "action" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costCents" REAL NOT NULL,
    "meta" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AiUsage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiUsage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AiUsage" ("id", "providerId", "shopId", "action", "tokensIn", "tokensOut", "costCents", "meta", "correlationId", "createdAt", "requestCount")
SELECT "id", "providerId", "shopId", "action", "tokensIn", "tokensOut", "costCents", "meta", "correlationId", "createdAt", "requestCount" FROM "AiUsage";
DROP TABLE "AiUsage";
ALTER TABLE "new_AiUsage" RENAME TO "AiUsage";
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
CREATE INDEX "AiUsage_shopId_createdAt_idx" ON "AiUsage"("shopId", "createdAt");
CREATE INDEX "AiUsage_correlationId_idx" ON "AiUsage"("correlationId");

PRAGMA foreign_keys=ON;
