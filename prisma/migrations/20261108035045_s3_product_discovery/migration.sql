-- CreateEnum
CREATE TYPE "SearchRunStatus" AS ENUM ('SUCCEEDED', 'EMPTY', 'FAILED');

-- CreateEnum
CREATE TYPE "OfferAvailability" AS ENUM ('InStock', 'OutOfStock', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OfferCondition" AS ENUM ('new', 'used', 'refurbished', 'UNKNOWN');

-- AlterTable
ALTER TABLE "repair_requests" ADD COLUMN     "selectedCandidateId" TEXT,
ADD COLUMN     "selectedChannel3ProductId" TEXT;

-- CreateTable
CREATE TABLE "product_search_runs" (
    "id" TEXT NOT NULL,
    "repairRequestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'CHANNEL3',
    "query" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "status" "SearchRunStatus" NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "normalizationVersion" INTEGER NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "product_search_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_candidates" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "channel3ProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brandNames" JSONB,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_observations" (
    "id" TEXT NOT NULL,
    "productCandidateId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "offerUrl" TEXT NOT NULL,
    "priceMinor" INTEGER,
    "currency" TEXT,
    "availability" "OfferAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "condition" "OfferCondition" NOT NULL DEFAULT 'UNKNOWN',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_search_runs_repairRequestId_idx" ON "product_search_runs"("repairRequestId");

-- CreateIndex
CREATE INDEX "product_candidates_channel3ProductId_idx" ON "product_candidates"("channel3ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "product_candidates_searchRunId_channel3ProductId_key" ON "product_candidates"("searchRunId", "channel3ProductId");

-- CreateIndex
CREATE INDEX "offer_observations_productCandidateId_idx" ON "offer_observations"("productCandidateId");

-- AddForeignKey
ALTER TABLE "product_search_runs" ADD CONSTRAINT "product_search_runs_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "repair_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "product_search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_observations" ADD CONSTRAINT "offer_observations_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "product_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
