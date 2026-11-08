-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYPAL');

-- CreateEnum
CREATE TYPE "ProviderEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_CREATED', 'ORDER_CREATE_PENDING', 'ORDER_CREATED', 'BUYER_APPROVAL_PENDING', 'BUYER_CANCELLED', 'AUTHORIZATION_PENDING', 'AUTHORIZED', 'AUTHORIZATION_DECLINED', 'AUTHORIZATION_UNKNOWN', 'AUTHORIZATION_EXPIRED', 'CAPTURE_PENDING', 'CAPTURED', 'CAPTURE_FAILED', 'CAPTURE_UNKNOWN', 'VOID_PENDING', 'VOIDED', 'VOID_FAILED', 'VOID_UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentOperationType" AS ENUM ('CREATE_ORDER', 'AUTHORIZE', 'CAPTURE', 'VOID', 'RECONCILE');

-- CreateEnum
CREATE TYPE "PaymentOperationStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "repairContractId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYPAL',
    "providerEnvironment" "ProviderEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'NOT_CREATED',
    "paypalOrderId" TEXT,
    "paypalAuthorizationId" TEXT,
    "paypalCaptureId" TEXT,
    "rawOrderStatus" TEXT,
    "rawAuthorizationStatus" TEXT,
    "rawCaptureStatus" TEXT,
    "authorizationExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_operations" (
    "id" TEXT NOT NULL,
    "paymentAttemptId" TEXT NOT NULL,
    "operationType" "PaymentOperationType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentOperationStatus" NOT NULL DEFAULT 'STARTED',
    "requestHash" TEXT,
    "providerRequestId" TEXT,
    "providerResponseRedacted" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paypalOrderId_key" ON "payment_attempts"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paypalAuthorizationId_key" ON "payment_attempts"("paypalAuthorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paypalCaptureId_key" ON "payment_attempts"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "payment_attempts_repairContractId_idx" ON "payment_attempts"("repairContractId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_operations_idempotencyKey_key" ON "payment_operations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_operations_paymentAttemptId_idx" ON "payment_operations"("paymentAttemptId");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_repairContractId_fkey" FOREIGN KEY ("repairContractId") REFERENCES "repair_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
