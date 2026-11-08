-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('AWAITING_CUSTOMER_APPROVAL', 'APPROVED', 'CHANGE_REQUESTED', 'COMPLETED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "repair_contracts" (
    "id" TEXT NOT NULL,
    "repairRequestId" TEXT NOT NULL,
    "selectedQuoteId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'AWAITING_CUSTOMER_APPROVAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalMinor" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_versions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "quoteSnapshotJson" JSONB NOT NULL,
    "productReferenceSnapshotJson" JSONB,
    "scopeSnapshot" TEXT NOT NULL,
    "warrantySnapshot" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerApprovedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_change_requests" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromVersionId" TEXT NOT NULL,
    "proposedVersionId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "customerDecisionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repair_contracts_repairRequestId_key" ON "repair_contracts"("repairRequestId");

-- CreateIndex
CREATE INDEX "contract_versions_contractId_idx" ON "contract_versions"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_versions_contractId_versionNumber_key" ON "contract_versions"("contractId", "versionNumber");

-- CreateIndex
CREATE INDEX "contract_change_requests_contractId_idx" ON "contract_change_requests"("contractId");

-- AddForeignKey
ALTER TABLE "repair_contracts" ADD CONSTRAINT "repair_contracts_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "repair_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "repair_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "repair_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
