-- CreateTable
CREATE TABLE "MessagingRecipientSent" (
    "id" TEXT NOT NULL,
    "runToken" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingRecipientSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingRecipientSent_runToken_idx" ON "MessagingRecipientSent"("runToken");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingRecipientSent_runToken_recipientKey_key" ON "MessagingRecipientSent"("runToken", "recipientKey");
