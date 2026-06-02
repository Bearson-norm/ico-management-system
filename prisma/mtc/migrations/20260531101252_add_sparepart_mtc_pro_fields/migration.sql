-- AlterTable
ALTER TABLE "sparepart" ADD COLUMN     "alasan" TEXT,
ADD COLUMN     "link_reference" TEXT,
ADD COLUMN     "nama_alias" TEXT,
ADD COLUMN     "odoo_notes" TEXT;

-- AlterTable
ALTER TABLE "procurement_tracking" ADD COLUMN     "odoo_notes" TEXT;
