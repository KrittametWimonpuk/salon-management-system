-- Additive financial state for checkout, close-sale, void, and immutable partial-refund history.
ALTER TABLE "Booking"
    ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "saleClosedAt" TIMESTAMPTZ(3),
    ADD COLUMN "closedByUserId" UUID;

ALTER TABLE "Payment"
    ADD COLUMN "voidedAt" TIMESTAMPTZ(3),
    ADD COLUMN "voidReason" VARCHAR(500);

CREATE TABLE "PaymentRefund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "refundedByUserId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "externalReference" VARCHAR(255),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentRefund_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "Booking_branchId_paymentStatus_saleClosedAt_idx"
    ON "Booking"("branchId", "paymentStatus", "saleClosedAt");
CREATE INDEX "Booking_closedByUserId_idx" ON "Booking"("closedByUserId");
CREATE INDEX "PaymentRefund_paymentId_createdAt_idx" ON "PaymentRefund"("paymentId", "createdAt");
CREATE INDEX "PaymentRefund_refundedByUserId_idx" ON "PaymentRefund"("refundedByUserId");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_refundedByUserId_fkey"
    FOREIGN KEY ("refundedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
