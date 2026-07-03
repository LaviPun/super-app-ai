-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "planTier" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "timezone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "aiProviderOverrideId" TEXT,
    "retentionDaysDefault" INTEGER NOT NULL DEFAULT 30,
    "retentionDaysAi" INTEGER,
    "retentionDaysApi" INTEGER,
    "retentionDaysErrors" INTEGER,
    CONSTRAINT "Shop_aiProviderOverrideId_fkey" FOREIGN KEY ("aiProviderOverrideId") REFERENCES "AiProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recipe_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "recipeId" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "activeVersionId" TEXT,
    "sourceType" TEXT,
    "sourceJobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Module_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Module_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Module_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "ModuleVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "specJson" TEXT NOT NULL,
    "compiledJson" TEXT,
    "diffSummary" TEXT,
    "compiledArtifactsRef" TEXT,
    "rollbackOfRevisionId" TEXT,
    "publishedAt" DATETIME,
    "targetThemeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hydratedAt" DATETIME,
    "adminConfigSchemaJson" TEXT,
    "adminDefaultsJson" TEXT,
    "themeEditorSettingsJson" TEXT,
    "uiTokensJson" TEXT,
    "validationReportJson" TEXT,
    "implementationPlanJson" TEXT,
    "previewHtmlJson" TEXT,
    "compiledRuntimePlanJson" TEXT,
    CONSTRAINT "ModuleVersion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "secretsEnc" TEXT NOT NULL,
    "allowlistDomains" TEXT NOT NULL,
    "lastTestedAt" DATETIME,
    "sampleResponseJson" TEXT,
    "mappingJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Connector_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectorEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "defaultHeaders" TEXT,
    "defaultBody" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" DATETIME,
    "lastStatus" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectorEndpoint_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "AiProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT,
    "apiKeyEnc" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "costInPer1kCents" INTEGER,
    "costOutPer1kCents" INTEGER,
    "extraConfig" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "shopId" TEXT,
    "action" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "meta" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AiUsage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiUsage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "route" TEXT,
    "source" TEXT,
    "shopId" TEXT,
    "meta" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiModelPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPer1MTokensCents" INTEGER NOT NULL,
    "outputPer1MTokensCents" INTEGER NOT NULL,
    "cachedInputPer1MTokensCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiModelPrice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT,
    "actor" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "success" BOOLEAN NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ApiLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT,
    "result" TEXT,
    "error" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "FlowStepLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "shopId" TEXT,
    "step" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowStepLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanTierConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "trialDays" INTEGER NOT NULL,
    "quotasJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "shopifySubId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trialEndsAt" DATETIME,
    "currentPeriodEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSubscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "planTier" TEXT,
    "shopId" TEXT,
    "kind" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetentionPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThemeProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThemeProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSettings" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "shopId" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "eventJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FlowSchedule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowDeadLetter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "flowId" TEXT,
    "trigger" TEXT NOT NULL,
    "eventJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT NOT NULL,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FlowDeadLetter_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopApiRateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "currentlyAvailable" REAL,
    "maximumAvailable" REAL,
    "restoreRate" REAL,
    "lastQueryCost" REAL,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "throttledCount" INTEGER NOT NULL DEFAULT 0,
    "lastThrottledAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopApiRateLimit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "schemaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataStore_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataStoreRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataStoreId" TEXT NOT NULL,
    "customerId" TEXT,
    "externalId" TEXT,
    "title" TEXT,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataStoreRecord_dataStoreId_fkey" FOREIGN KEY ("dataStoreId") REFERENCES "DataStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowDef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "specJson" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowDef_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "triggerRef" TEXT,
    "contextJson" TEXT,
    "workflowJson" TEXT,
    "resumeAt" DATETIME,
    "resumeNodeId" TEXT,
    "resumeCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowRun_workflowId_workflowVersion_tenantId_fkey" FOREIGN KEY ("workflowId", "workflowVersion", "tenantId") REFERENCES "WorkflowDef" ("workflowId", "version", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowRunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "durationMs" INTEGER,
    "inputsJson" TEXT,
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectorToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "secretsEnc" TEXT NOT NULL,
    "scopes" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectorToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "revisionId" TEXT,
    "assetType" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "mime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModuleAsset_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleAsset_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageIngestionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputAssetIds" TEXT NOT NULL,
    "detectedSurfaceHint" TEXT,
    "extractionResult" TEXT,
    "generatedUiTree" TEXT,
    "generatedSettingsSchema" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ImageIngestionJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageIngestionJob_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "surfaceType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "filters" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "themeId" TEXT,
    "themeSectionId" TEXT,
    "checkoutProfileId" TEXT,
    "posLocationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModuleInstance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleInstance_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleInstance_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ModuleVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleSettingsValues" (
    "instanceId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "settingsValues" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("instanceId", "revisionId"),
    CONSTRAINT "ModuleSettingsValues_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ModuleInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleSettingsValues_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ModuleVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataCapture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "customerId" TEXT,
    "captureType" TEXT NOT NULL,
    "payloadSchemaVersion" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "piiFlags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataCapture_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DataCapture_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ModuleInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DataCapture_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FunctionRuleSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "functionApi" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FunctionRuleSet_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FunctionRuleSet_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowAsset_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlowAsset_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "instanceId" TEXT,
    "customerId" TEXT,
    "revisionId" TEXT,
    "recipeId" TEXT,
    "category" TEXT,
    "surfaceType" TEXT,
    "target" TEXT,
    "templateContext" TEXT,
    "sessionId" TEXT,
    "visitorId" TEXT,
    "userType" TEXT,
    "eventName" TEXT NOT NULL,
    "eventProperties" TEXT,
    "valueMetrics" TEXT,
    "piiFlags" TEXT,
    "correlationIds" TEXT,
    CONSTRAINT "ModuleEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ModuleInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleMetricsDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "instanceId" TEXT,
    "surfaceType" TEXT,
    "target" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "actions" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "dataCaptures" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModuleMetricsDaily_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleMetricsDaily_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ModuleInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttributionLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT,
    "customerId" TEXT,
    "checkoutToken" TEXT,
    "orderId" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    "source" TEXT,
    CONSTRAINT "AttributionLink_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InternalAiSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'localMachine',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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
    "estimatedCostCents" INTEGER DEFAULT 0,
    "hadFallback" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "clientRequestId" TEXT,
    "responseToMessageId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalAiMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InternalAiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InternalAiMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tagsJson" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Recipe_shopId_idx" ON "Recipe"("shopId");

-- CreateIndex
CREATE INDEX "Recipe_shopId_category_idx" ON "Recipe"("shopId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Module_activeVersionId_key" ON "Module"("activeVersionId");

-- CreateIndex
CREATE INDEX "ModuleVersion_moduleId_status_idx" ON "ModuleVersion"("moduleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleVersion_moduleId_version_key" ON "ModuleVersion"("moduleId", "version");

-- CreateIndex
CREATE INDEX "ConnectorEndpoint_connectorId_sortOrder_idx" ON "ConnectorEndpoint"("connectorId", "sortOrder");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_shopId_createdAt_idx" ON "AiUsage"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_correlationId_idx" ON "AiUsage"("correlationId");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_level_createdAt_idx" ON "ErrorLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_source_createdAt_idx" ON "ErrorLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_requestId_idx" ON "ErrorLog"("requestId");

-- CreateIndex
CREATE INDEX "ErrorLog_correlationId_idx" ON "ErrorLog"("correlationId");

-- CreateIndex
CREATE INDEX "AiModelPrice_providerId_isActive_idx" ON "AiModelPrice"("providerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelPrice_providerId_model_effectiveFrom_key" ON "AiModelPrice"("providerId", "model", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_shopId_createdAt_idx" ON "ApiLog"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_path_createdAt_idx" ON "ApiLog"("path", "createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_finishedAt_idx" ON "ApiLog"("finishedAt");

-- CreateIndex
CREATE INDEX "ApiLog_correlationId_idx" ON "ApiLog"("correlationId");

-- CreateIndex
CREATE INDEX "ApiLog_requestId_idx" ON "ApiLog"("requestId");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_shopId_createdAt_idx" ON "Job"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_requestId_idx" ON "Job"("requestId");

-- CreateIndex
CREATE INDEX "Job_correlationId_idx" ON "Job"("correlationId");

-- CreateIndex
CREATE INDEX "WebhookEvent_shopDomain_topic_idx" ON "WebhookEvent"("shopDomain", "topic");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_shopDomain_topic_eventId_key" ON "WebhookEvent"("shopDomain", "topic", "eventId");

-- CreateIndex
CREATE INDEX "FlowStepLog_jobId_idx" ON "FlowStepLog"("jobId");

-- CreateIndex
CREATE INDEX "FlowStepLog_shopId_idx" ON "FlowStepLog"("shopId");

-- CreateIndex
CREATE INDEX "FlowStepLog_correlationId_idx" ON "FlowStepLog"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTierConfig_name_key" ON "PlanTierConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shopId_key" ON "AppSubscription"("shopId");

-- CreateIndex
CREATE INDEX "RetentionPolicy_scope_kind_isActive_idx" ON "RetentionPolicy"("scope", "kind", "isActive");

-- CreateIndex
CREATE INDEX "RetentionPolicy_shopId_kind_isActive_idx" ON "RetentionPolicy"("shopId", "kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeProfile_shopId_themeId_key" ON "ThemeProfile"("shopId", "themeId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_actor_createdAt_idx" ON "ActivityLog"("actor", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_action_createdAt_idx" ON "ActivityLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_shopId_createdAt_idx" ON "ActivityLog"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_requestId_idx" ON "ActivityLog"("requestId");

-- CreateIndex
CREATE INDEX "ActivityLog_correlationId_idx" ON "ActivityLog"("correlationId");

-- CreateIndex
CREATE INDEX "FlowSchedule_shopId_isActive_idx" ON "FlowSchedule"("shopId", "isActive");

-- CreateIndex
CREATE INDEX "FlowSchedule_nextRunAt_isActive_idx" ON "FlowSchedule"("nextRunAt", "isActive");

-- CreateIndex
CREATE INDEX "FlowDeadLetter_status_nextRetryAt_idx" ON "FlowDeadLetter"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "FlowDeadLetter_shopId_status_idx" ON "FlowDeadLetter"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopApiRateLimit_shopId_key" ON "ShopApiRateLimit"("shopId");

-- CreateIndex
CREATE INDEX "ShopApiRateLimit_updatedAt_idx" ON "ShopApiRateLimit"("updatedAt");

-- CreateIndex
CREATE INDEX "DataStore_shopId_isEnabled_idx" ON "DataStore"("shopId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "DataStore_shopId_key_key" ON "DataStore"("shopId", "key");

-- CreateIndex
CREATE INDEX "DataStoreRecord_dataStoreId_createdAt_idx" ON "DataStoreRecord"("dataStoreId", "createdAt");

-- CreateIndex
CREATE INDEX "DataStoreRecord_dataStoreId_externalId_idx" ON "DataStoreRecord"("dataStoreId", "externalId");

-- CreateIndex
CREATE INDEX "DataStoreRecord_customerId_idx" ON "DataStoreRecord"("customerId");

-- CreateIndex
CREATE INDEX "WorkflowDef_tenantId_status_idx" ON "WorkflowDef"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDef_tenantId_workflowId_version_key" ON "WorkflowDef"("tenantId", "workflowId", "version");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_tenantId_idx" ON "WorkflowRun"("workflowId", "tenantId");

-- CreateIndex
CREATE INDEX "WorkflowRun_tenantId_status_idx" ON "WorkflowRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_resumeAt_idx" ON "WorkflowRun"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_createdAt_idx" ON "WorkflowRun"("createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRunStep_runId_idx" ON "WorkflowRunStep"("runId");

-- CreateIndex
CREATE INDEX "WorkflowRunStep_runId_stepId_idx" ON "WorkflowRunStep"("runId", "stepId");

-- CreateIndex
CREATE INDEX "ConnectorToken_tenantId_idx" ON "ConnectorToken"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorToken_tenantId_provider_key" ON "ConnectorToken"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "ModuleAsset_shopId_idx" ON "ModuleAsset"("shopId");

-- CreateIndex
CREATE INDEX "ModuleAsset_moduleId_idx" ON "ModuleAsset"("moduleId");

-- CreateIndex
CREATE INDEX "ImageIngestionJob_shopId_idx" ON "ImageIngestionJob"("shopId");

-- CreateIndex
CREATE INDEX "ImageIngestionJob_moduleId_idx" ON "ImageIngestionJob"("moduleId");

-- CreateIndex
CREATE INDEX "ImageIngestionJob_status_idx" ON "ImageIngestionJob"("status");

-- CreateIndex
CREATE INDEX "ModuleInstance_shopId_idx" ON "ModuleInstance"("shopId");

-- CreateIndex
CREATE INDEX "ModuleInstance_moduleId_idx" ON "ModuleInstance"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleInstance_revisionId_idx" ON "ModuleInstance"("revisionId");

-- CreateIndex
CREATE INDEX "DataCapture_shopId_idx" ON "DataCapture"("shopId");

-- CreateIndex
CREATE INDEX "DataCapture_instanceId_idx" ON "DataCapture"("instanceId");

-- CreateIndex
CREATE INDEX "DataCapture_moduleId_idx" ON "DataCapture"("moduleId");

-- CreateIndex
CREATE INDEX "DataCapture_customerId_idx" ON "DataCapture"("customerId");

-- CreateIndex
CREATE INDEX "DataCapture_createdAt_idx" ON "DataCapture"("createdAt");

-- CreateIndex
CREATE INDEX "FunctionRuleSet_shopId_idx" ON "FunctionRuleSet"("shopId");

-- CreateIndex
CREATE INDEX "FunctionRuleSet_moduleId_idx" ON "FunctionRuleSet"("moduleId");

-- CreateIndex
CREATE INDEX "FlowAsset_shopId_idx" ON "FlowAsset"("shopId");

-- CreateIndex
CREATE INDEX "FlowAsset_moduleId_idx" ON "FlowAsset"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleEvent_shopId_idx" ON "ModuleEvent"("shopId");

-- CreateIndex
CREATE INDEX "ModuleEvent_moduleId_idx" ON "ModuleEvent"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleEvent_instanceId_idx" ON "ModuleEvent"("instanceId");

-- CreateIndex
CREATE INDEX "ModuleEvent_customerId_idx" ON "ModuleEvent"("customerId");

-- CreateIndex
CREATE INDEX "ModuleEvent_timestamp_idx" ON "ModuleEvent"("timestamp");

-- CreateIndex
CREATE INDEX "ModuleEvent_eventName_idx" ON "ModuleEvent"("eventName");

-- CreateIndex
CREATE INDEX "ModuleMetricsDaily_shopId_idx" ON "ModuleMetricsDaily"("shopId");

-- CreateIndex
CREATE INDEX "ModuleMetricsDaily_moduleId_idx" ON "ModuleMetricsDaily"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleMetricsDaily_date_idx" ON "ModuleMetricsDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleMetricsDaily_date_shopId_moduleId_instanceId_key" ON "ModuleMetricsDaily"("date", "shopId", "moduleId", "instanceId");

-- CreateIndex
CREATE INDEX "AttributionLink_shopId_idx" ON "AttributionLink"("shopId");

-- CreateIndex
CREATE INDEX "AttributionLink_sessionId_idx" ON "AttributionLink"("sessionId");

-- CreateIndex
CREATE INDEX "AttributionLink_customerId_idx" ON "AttributionLink"("customerId");

-- CreateIndex
CREATE INDEX "AttributionLink_orderId_idx" ON "AttributionLink"("orderId");

-- CreateIndex
CREATE INDEX "InternalAiSession_updatedAt_idx" ON "InternalAiSession"("updatedAt");

-- CreateIndex
CREATE INDEX "InternalAiSession_createdAt_idx" ON "InternalAiSession"("createdAt");

-- CreateIndex
CREATE INDEX "InternalAiMessage_sessionId_createdAt_idx" ON "InternalAiMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "InternalAiMessage_sessionId_clientRequestId_idx" ON "InternalAiMessage"("sessionId", "clientRequestId");

-- CreateIndex
CREATE INDEX "InternalAiMessage_responseToMessageId_idx" ON "InternalAiMessage"("responseToMessageId");

-- CreateIndex
CREATE INDEX "InternalAiMessage_createdAt_idx" ON "InternalAiMessage"("createdAt");

-- CreateIndex
CREATE INDEX "InternalAiMemory_isEnabled_updatedAt_idx" ON "InternalAiMemory"("isEnabled", "updatedAt");

-- CreateIndex
CREATE INDEX "InternalAiToolAudit_createdAt_idx" ON "InternalAiToolAudit"("createdAt");

-- CreateIndex
CREATE INDEX "InternalAiToolAudit_toolName_createdAt_idx" ON "InternalAiToolAudit"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "InternalAiToolAudit_sessionId_createdAt_idx" ON "InternalAiToolAudit"("sessionId", "createdAt");

