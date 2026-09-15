-- AlterTable: add kategori_out column to stock_movement
ALTER TABLE "stock_movement" ADD COLUMN "kategori_out" TEXT;

-- CreateIndex
CREATE INDEX "stock_movement_kategori_out_idx" ON "stock_movement"("kategori_out");
