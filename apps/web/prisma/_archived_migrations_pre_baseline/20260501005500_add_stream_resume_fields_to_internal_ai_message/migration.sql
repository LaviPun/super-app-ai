ALTER TABLE "InternalAiMessage"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE "InternalAiMessage"
ADD COLUMN "clientRequestId" TEXT;

ALTER TABLE "InternalAiMessage"
ADD COLUMN "responseToMessageId" TEXT;

CREATE INDEX "InternalAiMessage_sessionId_clientRequestId_idx"
ON "InternalAiMessage"("sessionId", "clientRequestId");

CREATE INDEX "InternalAiMessage_responseToMessageId_idx"
ON "InternalAiMessage"("responseToMessageId");
