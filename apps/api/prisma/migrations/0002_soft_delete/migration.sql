-- Migration ที่สอง: เพิ่ม soft delete ให้ Asset
-- (Prisma ปกติสร้างไฟล์นี้ให้อัตโนมัติเมื่อรัน `prisma migrate dev`)
-- หมายเหตุ: ไม่แก้ไข migration เดิม (0001_init) เพราะระบบที่ deploy ไปแล้วรันมันไปแล้ว
-- การเพิ่มการเปลี่ยนแปลง schema ทุกครั้งต้องเป็น migration ใหม่เสมอ

-- AlterTable: เพิ่มคอลัมน์ deletedAt — ไม่เป็น null แปลว่า asset นี้ถูก "ลบ" แล้ว (soft delete)
ALTER TABLE "Asset" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex: ทุก query list/get ของจริงกรองด้วย ownerId + deletedAt เสมอ
-- ทำ index ผสมไว้ล่วงหน้าเพื่อรองรับข้อมูลเยอะขึ้นในอนาคต
CREATE INDEX "Asset_ownerId_deletedAt_idx" ON "Asset"("ownerId", "deletedAt");
