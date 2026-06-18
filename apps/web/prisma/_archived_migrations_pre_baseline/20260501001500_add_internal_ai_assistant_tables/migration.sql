-- Internal AI assistant persistence (sessions, messages, memory, tool audit)

CREATE TABLE "InternalAiSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'localMachine',
  "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "InternalAiMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "mode" TEXT,
  "backend" TEXT,
  "model" TEXT,
  "latencyMs" INTEGER,
  "tokensIn" INTEGER,
  "tokensOut" INTEGER,
  "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
  "hadFallback" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalAiMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InternalAiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InternalAiMemory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tagsJson" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "InternalAiToolAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT,
  "messageId" TEXT,
  "toolName" TEXT NOT NULL,
  "argsJson" TEXT,
  "resultJson" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalAiToolAudit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InternalAiSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InternalAiToolAudit_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InternalAiMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "InternalAiSession_updatedAt_idx" ON "InternalAiSession"("updatedAt");
CREATE INDEX "InternalAiSession_createdAt_idx" ON "InternalAiSession"("createdAt");

CREATE INDEX "InternalAiMessage_sessionId_createdAt_idx" ON "InternalAiMessage"("sessionId", "createdAt");
CREATE INDEX "InternalAiMessage_createdAt_idx" ON "InternalAiMessage"("createdAt");

CREATE INDEX "InternalAiMemory_isEnabled_updatedAt_idx" ON "InternalAiMemory"("isEnabled", "updatedAt");

CREATE INDEX "InternalAiToolAudit_createdAt_idx" ON "InternalAiToolAudit"("createdAt");
CREATE INDEX "InternalAiToolAudit_toolName_createdAt_idx" ON "InternalAiToolAudit"("toolName", "createdAt");
CREATE INDEX "InternalAiToolAudit_sessionId_createdAt_idx" ON "InternalAiToolAudit"("sessionId", "createdAt");
