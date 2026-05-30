-- CreateTable
CREATE TABLE "procurement_tracking" (
    "id" SERIAL NOT NULL,
    "fb_index" INTEGER,
    "original_name" TEXT NOT NULL,
    "sparepart_id" TEXT,
    "keterangan" TEXT,
    "penggunaan_bulan" INTEGER,
    "kontrak_3_bulan" BOOLEAN NOT NULL DEFAULT false,
    "tanggal_list" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qty" INTEGER NOT NULL,
    "product_category" TEXT,
    "reason" TEXT,
    "urgency" TEXT DEFAULT 'Normal',
    "link_references" TEXT,
    "vendor" TEXT,
    "harga" DECIMAL(14,2),
    "nomor_pr" TEXT,
    "status_pr" TEXT NOT NULL DEFAULT 'DRAFT',
    "status_pa" TEXT,
    "status_po" TEXT,
    "nomor_po" TEXT,
    "po_approved" BOOLEAN NOT NULL DEFAULT false,
    "eta_foom" TIMESTAMP(3),
    "link_gr" TEXT,
    "tanggal_terima" TIMESTAMP(3),
    "is_stocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_tracking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "procurement_tracking" ADD CONSTRAINT "procurement_tracking_sparepart_id_fkey" FOREIGN KEY ("sparepart_id") REFERENCES "sparepart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
