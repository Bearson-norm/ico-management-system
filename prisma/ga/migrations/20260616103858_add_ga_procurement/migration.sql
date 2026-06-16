-- CreateTable
CREATE TABLE "ga_procurement_tracking" (
    "id" SERIAL NOT NULL,
    "original_name" TEXT NOT NULL,
    "item_id" TEXT,
    "qty" INTEGER NOT NULL,
    "harga" DECIMAL(14,2),
    "vendor" TEXT,
    "nomor_pr" TEXT,
    "nomor_po" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "tanggal_pesan" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tanggal_terima" TIMESTAMP(3),
    "is_stocked" BOOLEAN NOT NULL DEFAULT true,
    "keterangan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_procurement_tracking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ga_procurement_tracking" ADD CONSTRAINT "ga_procurement_tracking_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ga_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
