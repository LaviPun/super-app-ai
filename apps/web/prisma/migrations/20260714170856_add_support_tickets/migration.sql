-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "moduleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "aiSeverity" TEXT,
    "aiCategory" TEXT,
    "aiSummary" TEXT,
    "aiConfidence" REAL,
    "aiEscalate" BOOLEAN,
    "aiTriageError" TEXT,
    "triagedAt" DATETIME,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportTicket_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SupportTicket_shopId_status_idx" ON "SupportTicket"("shopId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_shopId_createdAt_idx" ON "SupportTicket"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_correlationId_idx" ON "SupportTicket"("correlationId");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");
