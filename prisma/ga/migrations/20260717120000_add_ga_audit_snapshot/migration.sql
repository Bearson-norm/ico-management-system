-- CreateTable
CREATE TABLE "ga_audit_snapshot" (
    "id" SERIAL NOT NULL,
    "periode" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cutoff_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cron',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_audit_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga_audit_snapshot_line" (
    "id" SERIAL NOT NULL,
    "snapshot_id" INTEGER NOT NULL,
    "item_id" TEXT NOT NULL,
    "nama_item" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'Pcs',
    "lokasi" TEXT,
    "saldo_awal" INTEGER NOT NULL,
    "total_in" INTEGER NOT NULL,
    "total_out" INTEGER NOT NULL,
    "total_adj" INTEGER NOT NULL,
    "stok_sistem" INTEGER NOT NULL,
    "qty_fisik" INTEGER,
    "selisih" INTEGER,
    "opname_session_id" INTEGER,
    "jumlah_transaksi" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ga_audit_snapshot_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ga_audit_snapshot_periode_key" ON "ga_audit_snapshot"("periode");

-- CreateIndex
CREATE INDEX "ga_audit_snapshot_line_snapshot_id_idx" ON "ga_audit_snapshot_line"("snapshot_id");

-- CreateIndex
CREATE INDEX "ga_audit_snapshot_line_item_id_idx" ON "ga_audit_snapshot_line"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "ga_audit_snapshot_line_snapshot_id_item_id_key" ON "ga_audit_snapshot_line"("snapshot_id", "item_id");

-- AddForeignKey
ALTER TABLE "ga_audit_snapshot_line" ADD CONSTRAINT "ga_audit_snapshot_line_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ga_audit_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
