-- CreateTable
CREATE TABLE "ga_users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "ga_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga_kategori" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_kategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga_item" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kode_barang" TEXT,
    "kategori_id" INTEGER,
    "uom" TEXT NOT NULL DEFAULT 'Pcs',
    "lokasi" TEXT,
    "harga" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "min_qty" INTEGER NOT NULL DEFAULT 0,
    "max_qty" INTEGER,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga_stock_movement" (
    "id" SERIAL NOT NULL,
    "tipe" TEXT NOT NULL,
    "item_id" TEXT,
    "nama_barang" TEXT,
    "qty" INTEGER NOT NULL,
    "qty_diterima" INTEGER,
    "tanggal_terima" TIMESTAMP(3),
    "tanggal_pemakaian" TIMESTAMP(3),
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pic_nama" TEXT,
    "vendor" TEXT,
    "keterangan" TEXT,
    "harga" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga_opname_session" (
    "id" SERIAL NOT NULL,
    "periode_nama" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_opname_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga_opname_line" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty_fisik" INTEGER NOT NULL,
    "qty_sistem" INTEGER NOT NULL,
    "pic_nama" TEXT,

    CONSTRAINT "ga_opname_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ga_users_username_key" ON "ga_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ga_kategori_nama_key" ON "ga_kategori"("nama");

-- CreateIndex
CREATE INDEX "ga_stock_movement_item_id_idx" ON "ga_stock_movement"("item_id");

-- CreateIndex
CREATE INDEX "ga_stock_movement_tipe_idx" ON "ga_stock_movement"("tipe");

-- CreateIndex
CREATE INDEX "ga_stock_movement_tanggal_idx" ON "ga_stock_movement"("tanggal");

-- AddForeignKey
ALTER TABLE "ga_item" ADD CONSTRAINT "ga_item_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "ga_kategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ga_stock_movement" ADD CONSTRAINT "ga_stock_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ga_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ga_opname_line" ADD CONSTRAINT "ga_opname_line_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ga_opname_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ga_opname_line" ADD CONSTRAINT "ga_opname_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ga_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
