-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('GENERATED', 'SELECTED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CompatibilityAttestation" AS ENUM ('CONFIRMED_FOR_DEMO', 'NOT_CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "repair_requests" ADD COLUMN     "selectedQuoteId" TEXT;

-- CreateTable
CREATE TABLE "simulated_repairers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "demoLabel" TEXT NOT NULL DEFAULT 'SIMULATED',
    "demoDescription" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulated_repairers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_quotes" (
    "id" TEXT NOT NULL,
    "repairRequestId" TEXT NOT NULL,
    "repairerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "QuoteStatus" NOT NULL DEFAULT 'GENERATED',
    "componentLabel" TEXT NOT NULL,
    "compatibilityAttestation" "CompatibilityAttestation" NOT NULL,
    "compatibilityNotes" TEXT NOT NULL,
    "partChargeMinor" INTEGER NOT NULL,
    "labourMinor" INTEGER NOT NULL,
    "feesMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "warrantyDays" INTEGER,
    "warrantyText" TEXT NOT NULL,
    "estimatedDurationHours" INTEGER,
    "scopeText" TEXT NOT NULL,
    "exclusionsText" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulated_repairers_userId_key" ON "simulated_repairers"("userId");

-- CreateIndex
CREATE INDEX "repair_quotes_repairRequestId_idx" ON "repair_quotes"("repairRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "repair_quotes_repairRequestId_repairerId_version_key" ON "repair_quotes"("repairRequestId", "repairerId", "version");

-- AddForeignKey
ALTER TABLE "simulated_repairers" ADD CONSTRAINT "simulated_repairers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_quotes" ADD CONSTRAINT "repair_quotes_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "repair_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_quotes" ADD CONSTRAINT "repair_quotes_repairerId_fkey" FOREIGN KEY ("repairerId") REFERENCES "simulated_repairers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
