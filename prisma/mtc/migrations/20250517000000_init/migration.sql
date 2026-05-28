-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teknisi" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teknisi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesin" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "area" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mesin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kategori" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "tipe" TEXT NOT NULL DEFAULT 'umum',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sparepart" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori_id" INTEGER,
    "uom" TEXT NOT NULL DEFAULT 'Pcs',
    "lokasi" TEXT,
    "harga" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "min_qty" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sparepart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_counter" (
    "tipe" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "report_counter_pkey" PRIMARY KEY ("tipe")
);

-- CreateTable
CREATE TABLE "maintenance_report" (
    "id" SERIAL NOT NULL,
    "no_report" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT,
    "finish_time" TEXT,
    "durasi_menit" INTEGER,
    "shift" INTEGER,
    "mesin_id" INTEGER NOT NULL,
    "keluhan" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "action_taken" TEXT NOT NULL,
    "kategori_id" INTEGER,
    "pic_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" SERIAL NOT NULL,
    "tipe" TEXT NOT NULL,
    "sparepart_id" TEXT,
    "nama_item" TEXT,
    "qty" INTEGER NOT NULL,
    "harga" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lokasi" TEXT,
    "pic_id" INTEGER,
    "no_report" TEXT,
    "purchase_type" TEXT,
    "vendor" TEXT,
    "keterangan" TEXT,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MesinToSparepart" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "teknisi_nama_key" ON "teknisi"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "mesin_nama_key" ON "mesin"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "kategori_nama_key" ON "kategori"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_report_no_report_key" ON "maintenance_report"("no_report");

-- CreateIndex
CREATE INDEX "maintenance_report_tipe_idx" ON "maintenance_report"("tipe");

-- CreateIndex
CREATE INDEX "maintenance_report_tanggal_idx" ON "maintenance_report"("tanggal");

-- CreateIndex
CREATE INDEX "maintenance_report_mesin_id_idx" ON "maintenance_report"("mesin_id");

-- CreateIndex
CREATE INDEX "maintenance_report_pic_id_idx" ON "maintenance_report"("pic_id");

-- CreateIndex
CREATE INDEX "stock_movement_sparepart_id_idx" ON "stock_movement"("sparepart_id");

-- CreateIndex
CREATE INDEX "stock_movement_tipe_idx" ON "stock_movement"("tipe");

-- CreateIndex
CREATE INDEX "stock_movement_tanggal_idx" ON "stock_movement"("tanggal");

-- CreateIndex
CREATE INDEX "stock_movement_no_report_idx" ON "stock_movement"("no_report");

-- CreateIndex
CREATE UNIQUE INDEX "_MesinToSparepart_AB_unique" ON "_MesinToSparepart"("A", "B");

-- CreateIndex
CREATE INDEX "_MesinToSparepart_B_index" ON "_MesinToSparepart"("B");

-- AddForeignKey
ALTER TABLE "sparepart" ADD CONSTRAINT "sparepart_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "kategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_report" ADD CONSTRAINT "maintenance_report_mesin_id_fkey" FOREIGN KEY ("mesin_id") REFERENCES "mesin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_report" ADD CONSTRAINT "maintenance_report_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "kategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_report" ADD CONSTRAINT "maintenance_report_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "teknisi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sparepart_id_fkey" FOREIGN KEY ("sparepart_id") REFERENCES "sparepart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "teknisi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_no_report_fkey" FOREIGN KEY ("no_report") REFERENCES "maintenance_report"("no_report") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MesinToSparepart" ADD CONSTRAINT "_MesinToSparepart_A_fkey" FOREIGN KEY ("A") REFERENCES "mesin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MesinToSparepart" ADD CONSTRAINT "_MesinToSparepart_B_fkey" FOREIGN KEY ("B") REFERENCES "sparepart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
