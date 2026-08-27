-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "qaPromotedBlockingIssueIds" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "stage" TEXT;

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "generationCorrelationId" TEXT;

-- CreateTable
CREATE TABLE "AiGenerationOption" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "shopId" TEXT,
    "idx" INTEGER NOT NULL,
    "approach" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "explanation" TEXT,
    "recipeJson" TEXT,
    "error" TEXT,
    "score" DOUBLE PRECISION,
    "badgesJson" TEXT,
    "qaIssuesJson" TEXT,
    "generationMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGenerationOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerationOption_shopId_createdAt_idx" ON "AiGenerationOption"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiGenerationOption_jobId_idx_key" ON "AiGenerationOption"("jobId", "idx");

-- CreateIndex
CREATE INDEX "Module_generationCorrelationId_idx" ON "Module"("generationCorrelationId");

-- AddForeignKey
ALTER TABLE "AiGenerationOption" ADD CONSTRAINT "AiGenerationOption_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
