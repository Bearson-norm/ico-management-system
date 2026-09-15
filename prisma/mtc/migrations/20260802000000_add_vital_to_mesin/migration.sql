-- AlterTable: add vital column to mesin
ALTER TABLE "mesin" ADD COLUMN "vital" BOOLEAN NOT NULL DEFAULT false;
