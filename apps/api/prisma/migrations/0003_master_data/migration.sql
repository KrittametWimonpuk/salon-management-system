-- Migration ที่สาม: เพิ่ม Master Data (Category, Location, Department, Vendor)
-- และแปลง Asset.category (text) ให้เป็นความสัมพันธ์ (categoryId -> Category)
-- พร้อมเพิ่ม locationId / departmentId / vendorId
--
-- หมายเหตุ: ไม่แก้ไข migration เดิม (0001, 0002) — เพิ่ม migration ใหม่เสมอ
--
-- ขั้นตอนสำคัญ: การเปลี่ยน category จาก text -> relation (NOT NULL) ต้อง "ย้ายข้อมูลเดิม"
-- ก่อนเพิ่ม constraint NOT NULL ไม่งั้น asset ที่มีอยู่แล้วจะพังหมด ลำดับข้างล่างนี้ออกแบบมาให้ปลอดภัย:
--   1. สร้างตาราง Category ก่อน (คอลัมน์ยังไม่บังคับ)
--   2. เพิ่มคอลัมน์ categoryId แบบ "ไม่บังคับ" ก่อน
--   3. สร้างแถว Category จากค่า category (text) เดิมที่มีอยู่ในตาราง Asset ให้ครบทุกค่าที่ต่างกัน
--   4. อัปเดต Asset.categoryId ให้ชี้ไปยัง Category ที่สร้างขึ้นตามชื่อเดิม
--   5. ค่อยเปลี่ยน categoryId เป็น NOT NULL แล้วลบคอลัมน์ category (text) ทิ้ง

-- ===== 1) สร้างตาราง Master Data ทั้ง 4 ตัว =====

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Category_deletedAt_idx" ON "Category"("deletedAt");
-- ห้ามชื่อซ้ำ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) แต่เฉพาะแถวที่ยังไม่ถูกลบ — ใช้ expression index บน LOWER(name)
-- เพราะ Postgres UNIQUE ธรรมดาสนตัวพิมพ์เล็ก/ใหญ่ ไม่ตรงกับ requirement ที่ต้องการ
CREATE UNIQUE INDEX "Category_name_active_key" ON "Category" (LOWER("name")) WHERE "deletedAt" IS NULL;

CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Location_deletedAt_idx" ON "Location"("deletedAt");
CREATE UNIQUE INDEX "Location_name_active_key" ON "Location" (LOWER("name")) WHERE "deletedAt" IS NULL;

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");
CREATE UNIQUE INDEX "Department_name_active_key" ON "Department" (LOWER("name")) WHERE "deletedAt" IS NULL;

CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Vendor_deletedAt_idx" ON "Vendor"("deletedAt");
CREATE UNIQUE INDEX "Vendor_name_active_key" ON "Vendor" (LOWER("name")) WHERE "deletedAt" IS NULL;

-- ===== 2) เพิ่มคอลัมน์ FK ใหม่ให้ Asset (categoryId ยังไม่บังคับ ณ ขั้นนี้) =====

ALTER TABLE "Asset" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "vendorId" TEXT;

-- ===== 3) สร้าง Category จากค่า category (text) เดิมของ Asset ที่มีอยู่ ให้ครบทุกค่าที่ต่างกัน =====
-- TRIM ตัดช่องว่างหัว-ท้ายด้วย เผื่อข้อมูลเก่าก่อน milestone 1.1 (ตอนนั้นยังไม่บังคับ trim ฝั่ง backend)

INSERT INTO "Category" ("id", "name", "updatedAt")
SELECT gen_random_uuid(), sub.category_name, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT TRIM("category") AS category_name FROM "Asset") AS sub
WHERE sub.category_name <> ''
ON CONFLICT DO NOTHING;

-- ===== 4) ผูก Asset เดิมเข้ากับ Category ที่สร้างขึ้นตามชื่อ (จับคู่แบบไม่สนตัวพิมพ์เล็ก/ใหญ่ + ตัดช่องว่าง) =====

UPDATE "Asset" a
SET "categoryId" = c."id"
FROM "Category" c
WHERE LOWER(c."name") = LOWER(TRIM(a."category"));

-- ===== 5) ตอนนี้ทุกแถวควรมี categoryId แล้ว (เพราะ category เดิมบังคับกรอกอยู่แล้ว) จึงบังคับ NOT NULL ได้ =====

ALTER TABLE "Asset" ALTER COLUMN "categoryId" SET NOT NULL;

-- ===== 6) ลบคอลัมน์ category (text) เดิมทิ้ง — ใช้ categoryId แทนแล้ว =====

ALTER TABLE "Asset" DROP COLUMN "category";

-- ===== 7) เพิ่ม Foreign Key constraints =====

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== 8) Index บนคอลัมน์ FK ใหม่ เพื่อ query/join เร็วขึ้น =====

CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");
CREATE INDEX "Asset_departmentId_idx" ON "Asset"("departmentId");
CREATE INDEX "Asset_vendorId_idx" ON "Asset"("vendorId");
