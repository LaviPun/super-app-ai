-- CreateTable
CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportFixProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "explanation" TEXT NOT NULL,
    "recipeJson" TEXT NOT NULL,
    "validationJson" TEXT,
    "appliedVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportFixProposal_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "appName" TEXT NOT NULL DEFAULT 'SuperApp AI',
    "headerColor" TEXT NOT NULL DEFAULT '#000000',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "adminName" TEXT NOT NULL DEFAULT 'Admin',
    "adminEmail" TEXT,
    "profilePicUrl" TEXT,
    "companyName" TEXT,
    "supportEmail" TEXT,
    "supportUrl" TEXT,
    "privacyUrl" TEXT,
    "termsUrl" TEXT,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "enableEmailAlerts" BOOLEAN NOT NULL DEFAULT false,
    "alertRecipients" TEXT,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "categoryOverrides" TEXT,
    "templateSpecOverrides" TEXT,
    "defaultAiProvider" TEXT,
    "fallbackAiProviderId" TEXT,
    "designReferenceUrl" TEXT,
    "routerRuntimeConfigEnc" TEXT,
    "moduleSystemVersion" TEXT NOT NULL DEFAULT 'v1',
    "supportTriageMode" TEXT NOT NULL DEFAULT 'local',
    "supportTriageProviderId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("adminEmail", "adminName", "alertRecipients", "appName", "categoryOverrides", "companyName", "dateFormat", "defaultAiProvider", "defaultTimezone", "designReferenceUrl", "enableEmailAlerts", "fallbackAiProviderId", "faviconUrl", "headerColor", "id", "logoUrl", "maintenanceMessage", "maintenanceMode", "moduleSystemVersion", "privacyUrl", "profilePicUrl", "routerRuntimeConfigEnc", "supportEmail", "supportUrl", "templateSpecOverrides", "termsUrl", "updatedAt") SELECT "adminEmail", "adminName", "alertRecipients", "appName", "categoryOverrides", "companyName", "dateFormat", "defaultAiProvider", "defaultTimezone", "designReferenceUrl", "enableEmailAlerts", "fallbackAiProviderId", "faviconUrl", "headerColor", "id", "logoUrl", "maintenanceMessage", "maintenanceMode", "moduleSystemVersion", "privacyUrl", "profilePicUrl", "routerRuntimeConfigEnc", "supportEmail", "supportUrl", "templateSpecOverrides", "termsUrl", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE TABLE "new_SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "moduleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'MERCHANT',
    "shopperEmail" TEXT,
    "needsIntervention" BOOLEAN NOT NULL DEFAULT false,
    "assignee" TEXT,
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
INSERT INTO "new_SupportTicket" ("aiCategory", "aiConfidence", "aiEscalate", "aiSeverity", "aiSummary", "aiTriageError", "correlationId", "createdAt", "description", "id", "moduleId", "shopId", "status", "subject", "triagedAt", "updatedAt") SELECT "aiCategory", "aiConfidence", "aiEscalate", "aiSeverity", "aiSummary", "aiTriageError", "correlationId", "createdAt", "description", "id", "moduleId", "shopId", "status", "subject", "triagedAt", "updatedAt" FROM "SupportTicket";
DROP TABLE "SupportTicket";
ALTER TABLE "new_SupportTicket" RENAME TO "SupportTicket";
CREATE INDEX "SupportTicket_shopId_status_idx" ON "SupportTicket"("shopId", "status");
CREATE INDEX "SupportTicket_shopId_createdAt_idx" ON "SupportTicket"("shopId", "createdAt");
CREATE INDEX "SupportTicket_shopId_source_idx" ON "SupportTicket"("shopId", "source");
CREATE INDEX "SupportTicket_needsIntervention_createdAt_idx" ON "SupportTicket"("needsIntervention", "createdAt");
CREATE INDEX "SupportTicket_correlationId_idx" ON "SupportTicket"("correlationId");
CREATE TABLE "new_SupportTicketMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SupportTicketMessage" ("body", "createdAt", "id", "metaJson", "role", "ticketId") SELECT "body", "createdAt", "id", "metaJson", "role", "ticketId" FROM "SupportTicketMessage";
DROP TABLE "SupportTicketMessage";
ALTER TABLE "new_SupportTicketMessage" RENAME TO "SupportTicketMessage";
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketEvent_type_createdAt_idx" ON "SupportTicketEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SupportFixProposal_ticketId_createdAt_idx" ON "SupportFixProposal"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportFixProposal_status_createdAt_idx" ON "SupportFixProposal"("status", "createdAt");
