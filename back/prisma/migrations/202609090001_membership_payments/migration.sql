ALTER TABLE "Organization"
  ADD COLUMN "membershipPlan" TEXT,
  ADD COLUMN "membershipStatus" TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN "membershipStartedAt" TIMESTAMP(3),
  ADD COLUMN "membershipEndsAt" TIMESTAMP(3);

CREATE TYPE "PaymentTransactionStatus" AS ENUM ('pending', 'approved', 'declined', 'error', 'voided');

CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "transactionId" TEXT,
  "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'pending',
  "amountInCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "users" INTEGER NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentTransaction_reference_key" ON "PaymentTransaction"("reference");
CREATE UNIQUE INDEX "PaymentTransaction_transactionId_key" ON "PaymentTransaction"("transactionId");
CREATE INDEX "PaymentTransaction_organizationId_status_createdAt_idx" ON "PaymentTransaction"("organizationId", "status", "createdAt");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
