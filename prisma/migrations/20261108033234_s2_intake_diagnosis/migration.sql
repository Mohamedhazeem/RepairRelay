-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('DRAFT', 'INTAKE_SUBMITTED', 'DIAGNOSIS_PENDING', 'DIAGNOSIS_READY', 'DIAGNOSIS_INCONCLUSIVE', 'DIAGNOSIS_FAILED', 'PARTS_SEARCH_PENDING', 'PARTS_AVAILABLE', 'PARTS_EMPTY', 'PARTS_SEARCH_FAILED', 'QUOTES_PENDING', 'QUOTES_AVAILABLE', 'CONTRACT_SELECTED', 'CONTRACT_APPROVED', 'REPAIR_IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'CUSTOMER_REVIEW', 'REWORK_IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviceModelConfidence" AS ENUM ('USER_SELECTED', 'AI_SUGGESTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RepairCategory" AS ENUM ('DISPLAY_REPLACEMENT', 'BATTERY_REPLACEMENT', 'CHARGING_PORT_REPLACEMENT', 'CAMERA_REPLACEMENT', 'DIAGNOSTIC_ONLY', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('INTAKE', 'BEFORE', 'AFTER', 'COMPONENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConfidenceBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'UNASSESSED');

-- CreateTable
CREATE TABLE "repair_requests" (
    "id" TEXT NOT NULL,
    "publicReference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceBrand" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "modelIdentifier" TEXT,
    "deviceModelConfidence" "DeviceModelConfidence" NOT NULL DEFAULT 'USER_SELECTED',
    "symptoms" TEXT NOT NULL,
    "repairCategory" "RepairCategory",
    "status" "RepairStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_assets" (
    "id" TEXT NOT NULL,
    "repairRequestId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assetKind" "AssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "uploaded_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosis_reports" (
    "id" TEXT NOT NULL,
    "repairRequestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "deviceModelAssessment" JSONB NOT NULL,
    "visibleObservations" JSONB NOT NULL,
    "suspectedCauses" JSONB NOT NULL,
    "likelyRepairCategory" TEXT,
    "confidenceBand" "ConfidenceBand" NOT NULL,
    "unknowns" JSONB NOT NULL,
    "recommendedQuestions" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "rawOutputRedacted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "diagnosis_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "payloadAllowlistedJson" JSONB,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repair_requests_publicReference_key" ON "repair_requests"("publicReference");

-- CreateIndex
CREATE INDEX "repair_requests_customerId_idx" ON "repair_requests"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_assets_storageKey_key" ON "uploaded_assets"("storageKey");

-- CreateIndex
CREATE INDEX "uploaded_assets_repairRequestId_idx" ON "uploaded_assets"("repairRequestId");

-- CreateIndex
CREATE INDEX "diagnosis_reports_repairRequestId_idx" ON "diagnosis_reports"("repairRequestId");

-- CreateIndex
CREATE INDEX "audit_events_aggregateType_aggregateId_idx" ON "audit_events"("aggregateType", "aggregateId");

-- AddForeignKey
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "repair_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_reports" ADD CONSTRAINT "diagnosis_reports_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "repair_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
