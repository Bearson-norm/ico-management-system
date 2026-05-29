-- Add pr_date and po_date columns to sparepart table for procurement lead-time tracking
-- These columns store timestamps when a sparepart's purchasing status changes to PR or PO

ALTER TABLE "sparepart" ADD COLUMN IF NOT EXISTS "pr_date" TIMESTAMP(3);
ALTER TABLE "sparepart" ADD COLUMN IF NOT EXISTS "po_date" TIMESTAMP(3);
