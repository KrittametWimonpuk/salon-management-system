-- Phase 1 replaces the starter Asset domain with the Salon domain.
-- Refuse to discard non-demo legacy records silently. Export/migrate them in a
-- dedicated data migration before deploying this schema to a populated system.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Asset" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "User" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Category" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Location" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Department" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Vendor" LIMIT 1) THEN
        RAISE EXCEPTION 'Salon domain migration stopped: legacy tables contain data';
    END IF;
END $$;

DROP TABLE "Asset";
DROP TABLE "Category";
DROP TABLE "Location";
DROP TABLE "Department";
DROP TABLE "Vendor";
DROP TABLE "User";
DROP TYPE "AssetStatus";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingItemStatus" AS ENUM ('SCHEDULED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WALK_IN', 'PHONE', 'ONLINE', 'STAFF');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'E_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('SERVICE_PRICE', 'PAID_AMOUNT');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legalName" VARCHAR(200),
    "timezone" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "addressLine1" VARCHAR(200),
    "addressLine2" VARCHAR(200),
    "district" VARCHAR(120),
    "province" VARCHAR(120),
    "postalCode" VARCHAR(20),
    "countryCode" CHAR(2) NOT NULL,
    "timezone" VARCHAR(64),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(160),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "branchId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "employeeCode" VARCHAR(40) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "hireDate" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBranch" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EmployeeBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "preferredBranchId" UUID,
    "customerNumber" VARCHAR(40) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100),
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "dateOfBirth" DATE,
    "notes" TEXT,
    "lastVisitAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchService" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "priceOverride" DECIMAL(12,2),
    "durationOverrideMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BranchService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "createdByUserId" UUID,
    "bookingNumber" VARCHAR(40) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "source" "BookingSource" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "cancellationReason" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItem" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "serviceName" VARCHAR(160) NOT NULL,
    "status" "BookingItemStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "receivedByUserId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" VARCHAR(255),
    "idempotencyKey" VARCHAR(128),
    "paidAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID,
    "employeeId" UUID,
    "serviceId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "type" "CommissionType" NOT NULL,
    "basis" "CommissionBasis" NOT NULL DEFAULT 'SERVICE_PRICE',
    "percentageRate" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionHistory" (
    "id" UUID NOT NULL,
    "bookingItemId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "commissionRuleId" UUID NOT NULL,
    "paymentId" UUID,
    "ruleName" VARCHAR(160) NOT NULL,
    "type" "CommissionType" NOT NULL,
    "basis" "CommissionBasis" NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "percentageRate" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CommissionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHour" (
    "id" UUID NOT NULL,
    "employeeBranchId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkingHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTimeOff" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "branchId" UUID,
    "reviewedByUserId" UUID,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500),
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EmployeeTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID,
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "valueType" "SettingValueType" NOT NULL,
    "description" VARCHAR(500),
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entityType" VARCHAR(120) NOT NULL,
    "entityId" UUID,
    "metadata" JSONB,
    "ipAddress" INET,
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE INDEX "Branch_organizationId_isActive_deletedAt_idx" ON "Branch"("organizationId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "User_organizationId_status_deletedAt_idx" ON "User"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "User_organizationId_email_idx" ON "User"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Role_organizationId_isActive_deletedAt_idx" ON "Role"("organizationId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Permission_isActive_deletedAt_idx" ON "Permission"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "RolePermission_deletedAt_idx" ON "RolePermission"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "UserRole_userId_deletedAt_idx" ON "UserRole"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "UserRole_branchId_idx" ON "UserRole"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_status_deletedAt_idx" ON "Employee"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Employee_organizationId_employeeCode_idx" ON "Employee"("organizationId", "employeeCode");

-- CreateIndex
CREATE INDEX "Employee_organizationId_email_idx" ON "Employee"("organizationId", "email");

-- CreateIndex
CREATE INDEX "EmployeeBranch_branchId_isActive_deletedAt_idx" ON "EmployeeBranch"("branchId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "EmployeeBranch_employeeId_isActive_deletedAt_idx" ON "EmployeeBranch"("employeeId", "isActive", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBranch_employeeId_branchId_key" ON "EmployeeBranch"("employeeId", "branchId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_customerNumber_idx" ON "Customer"("organizationId", "customerNumber");

-- CreateIndex
CREATE INDEX "Customer_organizationId_phone_deletedAt_idx" ON "Customer"("organizationId", "phone", "deletedAt");

-- CreateIndex
CREATE INDEX "Customer_organizationId_email_deletedAt_idx" ON "Customer"("organizationId", "email", "deletedAt");

-- CreateIndex
CREATE INDEX "Customer_preferredBranchId_idx" ON "Customer"("preferredBranchId");

-- CreateIndex
CREATE INDEX "Service_organizationId_isActive_deletedAt_idx" ON "Service"("organizationId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Service_organizationId_code_idx" ON "Service"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Service_organizationId_name_idx" ON "Service"("organizationId", "name");

-- CreateIndex
CREATE INDEX "BranchService_serviceId_isActive_deletedAt_idx" ON "BranchService"("serviceId", "isActive", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BranchService_branchId_serviceId_key" ON "BranchService"("branchId", "serviceId");

-- CreateIndex
CREATE INDEX "Booking_branchId_startsAt_status_deletedAt_idx" ON "Booking"("branchId", "startsAt", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Booking_customerId_startsAt_idx" ON "Booking"("customerId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_createdByUserId_idx" ON "Booking"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_branchId_bookingNumber_key" ON "Booking"("branchId", "bookingNumber");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_status_idx" ON "BookingItem"("bookingId", "status");

-- CreateIndex
CREATE INDEX "BookingItem_employeeId_startsAt_endsAt_idx" ON "BookingItem"("employeeId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BookingItem_serviceId_idx" ON "BookingItem"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_bookingId_status_idx" ON "Payment"("bookingId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_receivedByUserId_idx" ON "Payment"("receivedByUserId");

-- CreateIndex
CREATE INDEX "Payment_externalReference_idx" ON "Payment"("externalReference");

-- CreateIndex
CREATE INDEX "CommissionRule_organizationId_isActive_effectiveFrom_effect_idx" ON "CommissionRule"("organizationId", "isActive", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "CommissionRule_branchId_employeeId_serviceId_priority_idx" ON "CommissionRule"("branchId", "employeeId", "serviceId", "priority");

-- CreateIndex
CREATE INDEX "CommissionRule_deletedAt_idx" ON "CommissionRule"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionHistory_bookingItemId_key" ON "CommissionHistory"("bookingItemId");

-- CreateIndex
CREATE INDEX "CommissionHistory_employeeId_status_calculatedAt_idx" ON "CommissionHistory"("employeeId", "status", "calculatedAt");

-- CreateIndex
CREATE INDEX "CommissionHistory_commissionRuleId_idx" ON "CommissionHistory"("commissionRuleId");

-- CreateIndex
CREATE INDEX "CommissionHistory_paymentId_idx" ON "CommissionHistory"("paymentId");

-- CreateIndex
CREATE INDEX "WorkingHour_employeeBranchId_dayOfWeek_isActive_deletedAt_idx" ON "WorkingHour"("employeeBranchId", "dayOfWeek", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Holiday_branchId_startsAt_endsAt_deletedAt_idx" ON "Holiday"("branchId", "startsAt", "endsAt", "deletedAt");

-- CreateIndex
CREATE INDEX "EmployeeTimeOff_employeeId_startsAt_endsAt_status_deletedAt_idx" ON "EmployeeTimeOff"("employeeId", "startsAt", "endsAt", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "EmployeeTimeOff_branchId_startsAt_endsAt_idx" ON "EmployeeTimeOff"("branchId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "EmployeeTimeOff_reviewedByUserId_idx" ON "EmployeeTimeOff"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "Setting_organizationId_key_deletedAt_idx" ON "Setting"("organizationId", "key", "deletedAt");

-- CreateIndex
CREATE INDEX "Setting_branchId_key_deletedAt_idx" ON "Setting"("branchId", "key", "deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBranch" ADD CONSTRAINT "EmployeeBranch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBranch" ADD CONSTRAINT "EmployeeBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_preferredBranchId_fkey" FOREIGN KEY ("preferredBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchService" ADD CONSTRAINT "BranchService_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchService" ADD CONSTRAINT "BranchService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionHistory" ADD CONSTRAINT "CommissionHistory_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionHistory" ADD CONSTRAINT "CommissionHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionHistory" ADD CONSTRAINT "CommissionHistory_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionHistory" ADD CONSTRAINT "CommissionHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHour" ADD CONSTRAINT "WorkingHour_employeeBranchId_fkey" FOREIGN KEY ("employeeBranchId") REFERENCES "EmployeeBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeOff" ADD CONSTRAINT "EmployeeTimeOff_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeOff" ADD CONSTRAINT "EmployeeTimeOff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeOff" ADD CONSTRAINT "EmployeeTimeOff_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma Schema Language.
ALTER TABLE "Organization"
    ADD CONSTRAINT "Organization_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "Organization_timezone_check" CHECK (length(btrim("timezone")) > 0),
    ADD CONSTRAINT "Organization_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "Branch"
    ADD CONSTRAINT "Branch_code_check" CHECK (length(btrim("code")) > 0),
    ADD CONSTRAINT "Branch_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "Branch_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$');

ALTER TABLE "User"
    ADD CONSTRAINT "User_email_check" CHECK (length(btrim("email")) > 3 AND position('@' IN "email") > 1),
    ADD CONSTRAINT "User_passwordHash_check" CHECK (length("passwordHash") >= 20);

ALTER TABLE "Role"
    ADD CONSTRAINT "Role_name_check" CHECK (length(btrim("name")) > 0);

ALTER TABLE "Permission"
    ADD CONSTRAINT "Permission_key_check" CHECK ("key" ~ '^[a-z][a-z0-9._:-]*$');

ALTER TABLE "Employee"
    ADD CONSTRAINT "Employee_employeeCode_check" CHECK (length(btrim("employeeCode")) > 0),
    ADD CONSTRAINT "Employee_displayName_check" CHECK (length(btrim("displayName")) > 0);

ALTER TABLE "Customer"
    ADD CONSTRAINT "Customer_customerNumber_check" CHECK (length(btrim("customerNumber")) > 0),
    ADD CONSTRAINT "Customer_firstName_check" CHECK (length(btrim("firstName")) > 0);

ALTER TABLE "Service"
    ADD CONSTRAINT "Service_code_check" CHECK (length(btrim("code")) > 0),
    ADD CONSTRAINT "Service_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "Service_durationMinutes_check" CHECK ("durationMinutes" > 0),
    ADD CONSTRAINT "Service_bufferMinutes_check" CHECK ("bufferBeforeMinutes" >= 0 AND "bufferAfterMinutes" >= 0),
    ADD CONSTRAINT "Service_price_check" CHECK ("price" >= 0);

ALTER TABLE "BranchService"
    ADD CONSTRAINT "BranchService_priceOverride_check" CHECK ("priceOverride" IS NULL OR "priceOverride" >= 0),
    ADD CONSTRAINT "BranchService_durationOverrideMinutes_check" CHECK ("durationOverrideMinutes" IS NULL OR "durationOverrideMinutes" > 0);

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_bookingNumber_check" CHECK (length(btrim("bookingNumber")) > 0),
    ADD CONSTRAINT "Booking_timeRange_check" CHECK ("endsAt" > "startsAt");

ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_serviceName_check" CHECK (length(btrim("serviceName")) > 0),
    ADD CONSTRAINT "BookingItem_timeRange_check" CHECK ("endsAt" > "startsAt"),
    ADD CONSTRAINT "BookingItem_durationMinutes_check" CHECK ("durationMinutes" > 0),
    ADD CONSTRAINT "BookingItem_quantity_check" CHECK ("quantity" > 0),
    ADD CONSTRAINT "BookingItem_amounts_check" CHECK (
        "unitPrice" >= 0
        AND "discountAmount" >= 0
        AND "discountAmount" <= ("unitPrice" * "quantity")
        AND "totalAmount" = (("unitPrice" * "quantity") - "discountAmount")
    );

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0),
    ADD CONSTRAINT "Payment_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "CommissionRule"
    ADD CONSTRAINT "CommissionRule_priority_check" CHECK ("priority" >= 0),
    ADD CONSTRAINT "CommissionRule_effectiveRange_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    ADD CONSTRAINT "CommissionRule_value_check" CHECK (
        ("type" = 'PERCENTAGE' AND "percentageRate" > 0 AND "percentageRate" <= 100 AND "fixedAmount" IS NULL)
        OR
        ("type" = 'FIXED_AMOUNT' AND "fixedAmount" >= 0 AND "percentageRate" IS NULL)
    );

ALTER TABLE "CommissionHistory"
    ADD CONSTRAINT "CommissionHistory_amounts_check" CHECK ("baseAmount" >= 0 AND "commissionAmount" >= 0),
    ADD CONSTRAINT "CommissionHistory_value_check" CHECK (
        ("type" = 'PERCENTAGE' AND "percentageRate" > 0 AND "percentageRate" <= 100 AND "fixedAmount" IS NULL)
        OR
        ("type" = 'FIXED_AMOUNT' AND "fixedAmount" >= 0 AND "percentageRate" IS NULL)
    );

ALTER TABLE "WorkingHour"
    ADD CONSTRAINT "WorkingHour_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
    ADD CONSTRAINT "WorkingHour_timeRange_check" CHECK ("endTime" > "startTime"),
    ADD CONSTRAINT "WorkingHour_effectiveRange_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "Holiday"
    ADD CONSTRAINT "Holiday_name_check" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "Holiday_timeRange_check" CHECK ("endsAt" > "startsAt");

ALTER TABLE "EmployeeTimeOff"
    ADD CONSTRAINT "EmployeeTimeOff_timeRange_check" CHECK ("endsAt" > "startsAt");

ALTER TABLE "Setting"
    ADD CONSTRAINT "Setting_key_check" CHECK ("key" ~ '^[a-z][a-z0-9._:-]*$'),
    ADD CONSTRAINT "Setting_valueType_check" CHECK (
        "valueType" = 'JSON'
        OR ("valueType" = 'STRING' AND jsonb_typeof("value") = 'string')
        OR ("valueType" = 'NUMBER' AND jsonb_typeof("value") = 'number')
        OR ("valueType" = 'BOOLEAN' AND jsonb_typeof("value") = 'boolean')
    );

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_action_check" CHECK (length(btrim("action")) > 0),
    ADD CONSTRAINT "AuditLog_entityType_check" CHECK (length(btrim("entityType")) > 0);

-- Active-row uniqueness for soft-deletable records.
CREATE UNIQUE INDEX "Branch_organizationId_code_active_key"
    ON "Branch" ("organizationId", lower("code")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "User_organizationId_email_active_key"
    ON "User" ("organizationId", lower("email")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Role_organizationId_name_active_key"
    ON "Role" ("organizationId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Permission_key_active_key"
    ON "Permission" (lower("key")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "UserRole_organization_scope_active_key"
    ON "UserRole" ("userId", "roleId") WHERE "branchId" IS NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "UserRole_branch_scope_active_key"
    ON "UserRole" ("userId", "roleId", "branchId") WHERE "branchId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Employee_organizationId_employeeCode_active_key"
    ON "Employee" ("organizationId", lower("employeeCode")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "EmployeeBranch_primary_active_key"
    ON "EmployeeBranch" ("employeeId") WHERE "isPrimary" = true AND "isActive" = true AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Customer_organizationId_customerNumber_active_key"
    ON "Customer" ("organizationId", lower("customerNumber")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Service_organizationId_code_active_key"
    ON "Service" ("organizationId", lower("code")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Setting_organization_key_active_key"
    ON "Setting" ("organizationId", lower("key")) WHERE "branchId" IS NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Setting_branch_key_active_key"
    ON "Setting" ("branchId", lower("key")) WHERE "branchId" IS NOT NULL AND "deletedAt" IS NULL;
