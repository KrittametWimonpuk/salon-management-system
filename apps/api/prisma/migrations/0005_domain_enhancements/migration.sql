-- Required tax/category snapshots cannot be inferred for existing records.
-- Stop explicitly so a populated environment receives a reviewed backfill.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Service" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "BookingItem" LIMIT 1) THEN
        RAISE EXCEPTION 'Domain enhancement migration stopped: Service or BookingItem tax/category backfill is required';
    END IF;

    IF EXISTS (SELECT 1 FROM "Booking" WHERE "source" = 'STAFF' LIMIT 1) THEN
        RAISE EXCEPTION 'Domain enhancement migration stopped: STAFF booking sources require manual classification';
    END IF;

    IF EXISTS (SELECT 1 FROM "Payment" WHERE "method" = 'OTHER' LIMIT 1) THEN
        RAISE EXCEPTION 'Domain enhancement migration stopped: OTHER payment methods require manual classification';
    END IF;
END $$;

-- These constraints reference enum values or amount semantics changed below.
ALTER TABLE "CommissionRule" DROP CONSTRAINT "CommissionRule_value_check";
ALTER TABLE "CommissionHistory" DROP CONSTRAINT "CommissionHistory_value_check";
ALTER TABLE "BookingItem" DROP CONSTRAINT "BookingItem_amounts_check";

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('NONE', 'VAT');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- AlterEnum
BEGIN;
CREATE TYPE "BookingSource_new" AS ENUM ('WALK_IN', 'WEBSITE', 'LINE', 'FACEBOOK', 'PHONE');
ALTER TABLE "Booking" ALTER COLUMN "source" TYPE "BookingSource_new" USING (
    CASE "source"::text
        WHEN 'ONLINE' THEN 'WEBSITE'
        ELSE "source"::text
    END::"BookingSource_new"
);
ALTER TYPE "BookingSource" RENAME TO "BookingSource_old";
ALTER TYPE "BookingSource_new" RENAME TO "BookingSource";
DROP TYPE "BookingSource_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "BookingStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus_new" USING (
    CASE "status"::text
        WHEN 'IN_SERVICE' THEN 'IN_PROGRESS'
        ELSE "status"::text
    END::"BookingStatus_new"
);
ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
DROP TYPE "BookingStatus_old";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CommissionType_new" AS ENUM ('PERCENT', 'FIXED', 'TIER', 'MIXED');
ALTER TABLE "CommissionRule" ALTER COLUMN "type" TYPE "CommissionType_new" USING (
    CASE "type"::text WHEN 'PERCENTAGE' THEN 'PERCENT' WHEN 'FIXED_AMOUNT' THEN 'FIXED' END::"CommissionType_new"
);
ALTER TABLE "CommissionHistory" ALTER COLUMN "type" TYPE "CommissionType_new" USING (
    CASE "type"::text WHEN 'PERCENTAGE' THEN 'PERCENT' WHEN 'FIXED_AMOUNT' THEN 'FIXED' END::"CommissionType_new"
);
ALTER TYPE "CommissionType" RENAME TO "CommissionType_old";
ALTER TYPE "CommissionType_new" RENAME TO "CommissionType";
DROP TYPE "CommissionType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'QR', 'CARD', 'BANK_TRANSFER', 'E_WALLET');
ALTER TABLE "Payment" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "PaymentMethod_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID');
ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING (
    CASE "status"::text
        WHEN 'AUTHORIZED' THEN 'PENDING'
        WHEN 'FAILED' THEN 'VOID'
        WHEN 'CANCELLED' THEN 'VOID'
        WHEN 'PARTIALLY_REFUNDED' THEN 'PARTIAL'
        ELSE "status"::text
    END::"PaymentStatus_new"
);
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "PaymentStatus_old";
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN     "subtotalAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "taxMode" "TaxMode" NOT NULL,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "taxType" "TaxType" NOT NULL;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "categoryId" UUID NOT NULL,
ADD COLUMN     "taxMode" "TaxMode" NOT NULL,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "taxType" "TaxType" NOT NULL;

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "color" VARCHAR(7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTagAssignment" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CustomerTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSkill" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "proficiencyLevel" INTEGER,
    "certifiedAt" DATE,
    "expiresAt" DATE,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSkill" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "requiredLevel" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "minimumSpend" DECIMAL(12,2),
    "maximumDiscount" DECIMAL(12,2),
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "usageLimit" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDiscount" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "promotionId" UUID,
    "promotionCode" VARCHAR(40),
    "description" VARCHAR(160) NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookingDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" UUID NOT NULL,
    "commissionRuleId" UUID NOT NULL,
    "minimumAmount" DECIMAL(12,2) NOT NULL,
    "maximumAmount" DECIMAL(12,2),
    "percentageRate" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerTag_organizationId_isActive_deletedAt_idx" ON "CustomerTag"("organizationId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "CustomerTagAssignment_tagId_deletedAt_idx" ON "CustomerTagAssignment"("tagId", "deletedAt");

-- CreateIndex
CREATE INDEX "CustomerTagAssignment_customerId_deletedAt_idx" ON "CustomerTagAssignment"("customerId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTagAssignment_customerId_tagId_key" ON "CustomerTagAssignment"("customerId", "tagId");

-- CreateIndex
CREATE INDEX "ServiceCategory_organizationId_displayOrder_isActive_delete_idx" ON "ServiceCategory"("organizationId", "displayOrder", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Skill_organizationId_isActive_deletedAt_idx" ON "Skill"("organizationId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "EmployeeSkill_skillId_deletedAt_idx" ON "EmployeeSkill"("skillId", "deletedAt");

-- CreateIndex
CREATE INDEX "EmployeeSkill_employeeId_deletedAt_idx" ON "EmployeeSkill"("employeeId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSkill_employeeId_skillId_key" ON "EmployeeSkill"("employeeId", "skillId");

-- CreateIndex
CREATE INDEX "ServiceSkill_skillId_idx" ON "ServiceSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSkill_serviceId_skillId_key" ON "ServiceSkill"("serviceId", "skillId");

-- CreateIndex
CREATE INDEX "Promotion_organizationId_code_isActive_startsAt_endsAt_dele_idx" ON "Promotion"("organizationId", "code", "isActive", "startsAt", "endsAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Promotion_branchId_isActive_startsAt_endsAt_idx" ON "Promotion"("branchId", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BookingDiscount_bookingId_idx" ON "BookingDiscount"("bookingId");

-- CreateIndex
CREATE INDEX "BookingDiscount_promotionId_idx" ON "BookingDiscount"("promotionId");

-- CreateIndex
CREATE INDEX "CommissionTier_commissionRuleId_minimumAmount_maximumAmount_idx" ON "CommissionTier"("commissionRuleId", "minimumAmount", "maximumAmount", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_commissionRuleId_minimumAmount_key" ON "CommissionTier"("commissionRuleId", "minimumAmount");

-- CreateIndex
CREATE INDEX "Service_categoryId_isActive_deletedAt_idx" ON "Service"("categoryId", "isActive", "deletedAt");

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSkill" ADD CONSTRAINT "ServiceSkill_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSkill" ADD CONSTRAINT "ServiceSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDiscount" ADD CONSTRAINT "BookingDiscount_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDiscount" ADD CONSTRAINT "BookingDiscount_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma Schema Language.
ALTER TABLE "CustomerTag"
    ADD CONSTRAINT "CustomerTag_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "CustomerTag_color_check" CHECK ("color" IS NULL OR "color" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "ServiceCategory"
    ADD CONSTRAINT "ServiceCategory_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "ServiceCategory_displayOrder_check" CHECK ("displayOrder" >= 0);

ALTER TABLE "Skill"
    ADD CONSTRAINT "Skill_name_check" CHECK (length(btrim("name")) > 0);

ALTER TABLE "EmployeeSkill"
    ADD CONSTRAINT "EmployeeSkill_proficiencyLevel_check" CHECK ("proficiencyLevel" IS NULL OR "proficiencyLevel" BETWEEN 1 AND 5),
    ADD CONSTRAINT "EmployeeSkill_certificationRange_check" CHECK ("expiresAt" IS NULL OR "certifiedAt" IS NULL OR "expiresAt" >= "certifiedAt");

ALTER TABLE "ServiceSkill"
    ADD CONSTRAINT "ServiceSkill_requiredLevel_check" CHECK ("requiredLevel" IS NULL OR "requiredLevel" BETWEEN 1 AND 5);

ALTER TABLE "Service"
    ADD CONSTRAINT "Service_tax_check" CHECK (
        ("taxType" = 'NONE' AND "taxRate" = 0)
        OR ("taxType" = 'VAT' AND "taxRate" > 0 AND "taxRate" <= 100)
    );

ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_amounts_check" CHECK (
        "unitPrice" >= 0
        AND "discountAmount" >= 0
        AND "discountAmount" <= ("unitPrice" * "quantity")
        AND "subtotalAmount" = (("unitPrice" * "quantity") - "discountAmount")
        AND "taxAmount" >= 0
        AND (
            ("taxType" = 'NONE' AND "taxRate" = 0 AND "taxAmount" = 0 AND "totalAmount" = "subtotalAmount")
            OR
            ("taxType" = 'VAT' AND "taxRate" > 0 AND "taxRate" <= 100 AND "taxMode" = 'INCLUDED' AND "taxAmount" <= "subtotalAmount" AND "totalAmount" = "subtotalAmount")
            OR
            ("taxType" = 'VAT' AND "taxRate" > 0 AND "taxRate" <= 100 AND "taxMode" = 'EXCLUDED' AND "totalAmount" = ("subtotalAmount" + "taxAmount"))
        )
    );

ALTER TABLE "Promotion"
    ADD CONSTRAINT "Promotion_code_check" CHECK (length(btrim("code")) > 0),
    ADD CONSTRAINT "Promotion_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "Promotion_timeRange_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
    ADD CONSTRAINT "Promotion_limits_check" CHECK (
        ("minimumSpend" IS NULL OR "minimumSpend" >= 0)
        AND ("maximumDiscount" IS NULL OR "maximumDiscount" >= 0)
        AND ("usageLimit" IS NULL OR "usageLimit" > 0)
    ),
    ADD CONSTRAINT "Promotion_discountValue_check" CHECK (
        ("discountType" = 'PERCENT' AND "discountValue" > 0 AND "discountValue" <= 100)
        OR ("discountType" = 'FIXED' AND "discountValue" >= 0)
    );

ALTER TABLE "BookingDiscount"
    ADD CONSTRAINT "BookingDiscount_description_check" CHECK (length(btrim("description")) > 0),
    ADD CONSTRAINT "BookingDiscount_amount_check" CHECK ("discountAmount" >= 0),
    ADD CONSTRAINT "BookingDiscount_discountValue_check" CHECK (
        ("discountType" = 'PERCENT' AND "discountValue" > 0 AND "discountValue" <= 100)
        OR ("discountType" = 'FIXED' AND "discountValue" >= 0)
    );

ALTER TABLE "CommissionRule"
    ADD CONSTRAINT "CommissionRule_value_check" CHECK (
        ("type" = 'PERCENT' AND "percentageRate" > 0 AND "percentageRate" <= 100 AND "fixedAmount" IS NULL)
        OR ("type" = 'FIXED' AND "fixedAmount" >= 0 AND "percentageRate" IS NULL)
        OR ("type" = 'TIER' AND "percentageRate" IS NULL AND "fixedAmount" IS NULL)
        OR ("type" = 'MIXED' AND "percentageRate" > 0 AND "percentageRate" <= 100 AND "fixedAmount" >= 0)
    );

ALTER TABLE "CommissionHistory"
    ADD CONSTRAINT "CommissionHistory_value_check" CHECK (
        ("type" = 'PERCENT' AND "percentageRate" > 0 AND "percentageRate" <= 100 AND "fixedAmount" IS NULL)
        OR ("type" = 'FIXED' AND "fixedAmount" >= 0 AND "percentageRate" IS NULL)
        OR ("type" = 'TIER' AND (("percentageRate" > 0 AND "percentageRate" <= 100) OR "fixedAmount" >= 0))
        OR ("type" = 'MIXED' AND "percentageRate" > 0 AND "percentageRate" <= 100 AND "fixedAmount" >= 0)
    );

ALTER TABLE "CommissionTier"
    ADD CONSTRAINT "CommissionTier_range_check" CHECK ("minimumAmount" >= 0 AND ("maximumAmount" IS NULL OR "maximumAmount" > "minimumAmount")),
    ADD CONSTRAINT "CommissionTier_value_check" CHECK (
        ("percentageRate" IS NOT NULL OR "fixedAmount" IS NOT NULL)
        AND ("percentageRate" IS NULL OR ("percentageRate" > 0 AND "percentageRate" <= 100))
        AND ("fixedAmount" IS NULL OR "fixedAmount" >= 0)
    );

-- Case-insensitive active-row uniqueness for configurable master data.
CREATE UNIQUE INDEX "CustomerTag_organizationId_name_active_key"
    ON "CustomerTag" ("organizationId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ServiceCategory_organizationId_name_active_key"
    ON "ServiceCategory" ("organizationId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Skill_organizationId_name_active_key"
    ON "Skill" ("organizationId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Promotion_organization_code_active_key"
    ON "Promotion" ("organizationId", lower("code")) WHERE "branchId" IS NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Promotion_branch_code_active_key"
    ON "Promotion" ("branchId", lower("code")) WHERE "branchId" IS NOT NULL AND "deletedAt" IS NULL;
