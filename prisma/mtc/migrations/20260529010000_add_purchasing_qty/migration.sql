-- AlterTable
ALTER TABLE "sparepart" ADD COLUMN IF NOT EXISTS "purchasing_qty" INTEGER NOT NULL DEFAULT 0;
