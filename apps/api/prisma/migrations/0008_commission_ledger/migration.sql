-- Additive immutable commission ledger, approval records, and period lifecycle.
CREATE TYPE "CommissionAdjustmentType" AS ENUM ('RECALCULATION', 'REFUND');
CREATE TYPE "CommissionPeriodStatus" AS ENUM ('OPEN', 'APPROVED', 'LOCKED');

CREATE TABLE "CommissionPeriod" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "CommissionPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "approvalReason" VARCHAR(500),
    "lockedByUserId" UUID,
    "lockedAt" TIMESTAMPTZ(3),
    "lockReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CommissionPeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommissionPeriod_range_check" CHECK ("startsAt" < "endsAt")
);

CREATE TABLE "CommissionAdjustment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "commissionHistoryId" UUID NOT NULL,
    "commissionPeriodId" UUID NOT NULL,
    "bookingItemId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "commissionRuleId" UUID NOT NULL,
    "paymentRefundId" UUID,
    "createdByUserId" UUID NOT NULL,
    "type" "CommissionAdjustmentType" NOT NULL,
    "ruleName" VARCHAR(160) NOT NULL,
    "commissionType" "CommissionType" NOT NULL,
    "basis" "CommissionBasis" NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "percentageRate" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "previousAmount" DECIMAL(12,2) NOT NULL,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL,
    "resultingAmount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommissionAdjustment_amount_check" CHECK (
      "baseAmount" >= 0 AND "previousAmount" >= 0 AND "resultingAmount" >= 0
      AND "previousAmount" + "adjustmentAmount" = "resultingAmount"
    )
);

CREATE TABLE "CommissionApproval" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "commissionHistoryId" UUID NOT NULL,
    "commissionPeriodId" UUID NOT NULL,
    "approvedByUserId" UUID NOT NULL,
    "approvedAmount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CommissionApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionPeriod_scope_key"
  ON "CommissionPeriod"("organizationId", "branchId", "startsAt", "endsAt");
CREATE INDEX "CommissionPeriod_scope_status_idx"
  ON "CommissionPeriod"("organizationId", "branchId", "status", "startsAt", "endsAt");
CREATE INDEX "CommissionPeriod_approvedByUserId_idx" ON "CommissionPeriod"("approvedByUserId");
CREATE INDEX "CommissionPeriod_lockedByUserId_idx" ON "CommissionPeriod"("lockedByUserId");

CREATE UNIQUE INDEX "CommissionAdjustment_refund_item_key"
  ON "CommissionAdjustment"("paymentRefundId", "bookingItemId");
CREATE INDEX "CommissionAdjustment_scope_calculated_idx"
  ON "CommissionAdjustment"("organizationId", "branchId", "calculatedAt");
CREATE INDEX "CommissionAdjustment_history_calculated_idx"
  ON "CommissionAdjustment"("commissionHistoryId", "calculatedAt");
CREATE INDEX "CommissionAdjustment_period_employee_idx"
  ON "CommissionAdjustment"("commissionPeriodId", "employeeId");
CREATE INDEX "CommissionAdjustment_bookingItemId_idx" ON "CommissionAdjustment"("bookingItemId");
CREATE INDEX "CommissionAdjustment_commissionRuleId_idx" ON "CommissionAdjustment"("commissionRuleId");
CREATE INDEX "CommissionAdjustment_createdByUserId_idx" ON "CommissionAdjustment"("createdByUserId");

CREATE UNIQUE INDEX "CommissionApproval_history_period_key"
  ON "CommissionApproval"("commissionHistoryId", "commissionPeriodId");
CREATE INDEX "CommissionApproval_scope_approved_idx"
  ON "CommissionApproval"("organizationId", "branchId", "approvedAt");
CREATE INDEX "CommissionApproval_period_idx" ON "CommissionApproval"("commissionPeriodId");
CREATE INDEX "CommissionApproval_approvedByUserId_idx" ON "CommissionApproval"("approvedByUserId");

ALTER TABLE "CommissionPeriod" ADD CONSTRAINT "CommissionPeriod_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPeriod" ADD CONSTRAINT "CommissionPeriod_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPeriod" ADD CONSTRAINT "CommissionPeriod_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionPeriod" ADD CONSTRAINT "CommissionPeriod_lockedByUserId_fkey"
  FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_commissionHistoryId_fkey"
  FOREIGN KEY ("commissionHistoryId") REFERENCES "CommissionHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_commissionPeriodId_fkey"
  FOREIGN KEY ("commissionPeriodId") REFERENCES "CommissionPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_bookingItemId_fkey"
  FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_commissionRuleId_fkey"
  FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_paymentRefundId_fkey"
  FOREIGN KEY ("paymentRefundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionApproval" ADD CONSTRAINT "CommissionApproval_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionApproval" ADD CONSTRAINT "CommissionApproval_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionApproval" ADD CONSTRAINT "CommissionApproval_commissionHistoryId_fkey"
  FOREIGN KEY ("commissionHistoryId") REFERENCES "CommissionHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionApproval" ADD CONSTRAINT "CommissionApproval_commissionPeriodId_fkey"
  FOREIGN KEY ("commissionPeriodId") REFERENCES "CommissionPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionApproval" ADD CONSTRAINT "CommissionApproval_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
