-- CreateTable
CREATE TABLE "FunctionActivation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "functionKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "activationGid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunctionActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FunctionActivation_shopId_functionKey_key" ON "FunctionActivation"("shopId", "functionKey");

-- AddForeignKey
ALTER TABLE "FunctionActivation" ADD CONSTRAINT "FunctionActivation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
