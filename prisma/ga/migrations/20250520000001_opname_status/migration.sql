-- AlterTable
ALTER TABLE "ga_opname_session" ADD COLUMN "lokasi" TEXT;
ALTER TABLE "ga_opname_session" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "ga_opname_session" ADD COLUMN "posted_at" TIMESTAMP(3);

-- AlterTable: qty fisik boleh null (belum dihitung)
ALTER TABLE "ga_opname_line" ALTER COLUMN "qty_fisik" DROP NOT NULL;

-- Unique: satu barang sekali per sesi
CREATE UNIQUE INDEX "ga_opname_line_session_id_item_id_key" ON "ga_opname_line"("session_id", "item_id");
