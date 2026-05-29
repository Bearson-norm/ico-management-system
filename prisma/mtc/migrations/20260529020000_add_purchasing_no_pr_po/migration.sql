-- AlterTable
ALTER TABLE "sparepart" ADD COLUMN IF NOT EXISTS "purchasing_no_pr" TEXT;
ALTER TABLE "sparepart" ADD COLUMN IF NOT EXISTS "purchasing_no_po" TEXT;
