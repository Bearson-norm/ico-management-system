-- Migration: ubah unique constraint mesin dari (nama) menjadi (nama, tipe)
-- Sehingga mesin perbaikan dan mesin BOM bisa punya nama yang sama

-- Hapus unique constraint lama pada kolom nama
DROP INDEX IF EXISTS "mesin_nama_key";

-- Buat unique constraint baru pada kombinasi (nama, tipe)
CREATE UNIQUE INDEX IF NOT EXISTS "mesin_nama_tipe_key" ON "mesin"("nama", "tipe");
