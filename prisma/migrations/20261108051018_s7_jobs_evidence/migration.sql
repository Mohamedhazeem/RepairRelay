-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AWAITING_EVIDENCE', 'CUSTOMER_REVIEW', 'REWORK_REQUESTED', 'REWORK_IN_PROGRESS', 'ACCEPTED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EvidenceAssetType" AS ENUM ('BEFORE', 'AFTER', 'COMPONENT_LABEL', 'OTHER');

-- CreateEnum
CREATE TYPE "ComponentIdentityBasis" AS ENUM ('LABEL_PHOTO', 'TECHNICIAN_DECLARATION', 'OTHER');

-- CreateTable
CREATE TABLE "repair_jobs" (
    "id" TEXT NOT NULL,
    "repairRequestId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "repairerId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "evidenceSubmittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_submissions" (
    "id" TEXT NOT NULL,
    "repairJobId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'DRAFT',
    "componentDeclaration" TEXT NOT NULL,
    "componentIdentityBasis" "ComponentIdentityBasis" NOT NULL,
    "functionalChecksJson" JSONB NOT NULL,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_assets" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "uploadedAssetId" TEXT NOT NULL,
    "evidenceType" "EvidenceAssetType" NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_assessments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "completeness" TEXT NOT NULL,
    "flags" JSONB NOT NULL,
    "reasoningSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repair_jobs_repairRequestId_key" ON "repair_jobs"("repairRequestId");

-- CreateIndex
CREATE INDEX "repair_jobs_repairerId_idx" ON "repair_jobs"("repairerId");

-- CreateIndex
CREATE INDEX "evidence_submissions_repairJobId_idx" ON "evidence_submissions"("repairJobId");

-- CreateIndex
CREATE INDEX "evidence_assets_submissionId_idx" ON "evidence_assets"("submissionId");

-- CreateIndex
CREATE INDEX "evidence_assessments_submissionId_idx" ON "evidence_assessments"("submissionId");

-- AddForeignKey
ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "repair_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_submissions" ADD CONSTRAINT "evidence_submissions_repairJobId_fkey" FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_assets" ADD CONSTRAINT "evidence_assets_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "evidence_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_assessments" ADD CONSTRAINT "evidence_assessments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "evidence_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
