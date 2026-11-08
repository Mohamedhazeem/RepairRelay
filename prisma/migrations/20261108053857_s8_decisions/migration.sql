-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('ACCEPT', 'REQUEST_REWORK', 'CANCEL');

-- CreateTable
CREATE TABLE "customer_decisions" (
    "id" TEXT NOT NULL,
    "repairJobId" TEXT NOT NULL,
    "evidenceSubmissionId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_decisions_evidenceSubmissionId_key" ON "customer_decisions"("evidenceSubmissionId");

-- CreateIndex
CREATE INDEX "customer_decisions_repairJobId_idx" ON "customer_decisions"("repairJobId");

-- AddForeignKey
ALTER TABLE "customer_decisions" ADD CONSTRAINT "customer_decisions_repairJobId_fkey" FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
