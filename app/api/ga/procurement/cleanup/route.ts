import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// Pola nama akun analitik Odoo yang bukan nama produk nyata
function looksLikeAccountName(name: string): boolean {
  const t = name.trim();
  
  const PATTERNS = [
    /^SUPPLIES\s+FACTORY\s+RELATED$/i,
    /^REPAIR\s+AND\s+MAINTENANCE/i,
    /^OFFICE\s+SUPPLIES$/i,
    /^FACTORY\s+SUPPLIES$/i,
    /^GENERAL\s+SUPPLIES$/i,
    /^MAINTENANCE\s+SUPPLIES$/i,
    /^CLEANING\s+SUPPLIES$/i,
    /^CONSUMABLE/i,
    /^Barang\s+GA$/i,
  ];
  
  for (const p of PATTERNS) {
    if (p.test(t)) return true;
  }
  
  // All caps + 3+ kata + panjang > 15 = kemungkinan nama akun analitik
  const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
  const wordCount = t.split(/\s+/).length;
  if (isAllCaps && wordCount >= 3 && t.length > 15) return true;
  
  return false;
}

// GET: preview — lihat apa saja yang akan dihapus
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (secret !== 'ga-cleanup-2026') {
    const session = await requireGaEditor();
    if (!session) return err('Akses ditolak', 403);
  }

  try {
    const all = await prismaGa.gaProcurementTracking.findMany({
      select: { id: true, originalName: true, nomorPr: true, qty: true, itemId: true }
    });

    const toDelete = all.filter(t => looksLikeAccountName(t.originalName));
    const toKeep = all.filter(t => !looksLikeAccountName(t.originalName));

    return ok({
      total: all.length,
      toDelete: toDelete.length,
      toKeep: toKeep.length,
      deleteList: toDelete.map(t => ({ id: t.id, name: t.originalName, pr: t.nomorPr })),
    });
  } catch (e: any) {
    return err(e.message, 500);
  }
}

// DELETE: eksekusi hapus semua record nama akun analitik
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (secret !== 'ga-cleanup-2026') {
    const session = await requireGaEditor();
    if (!session) return err('Akses ditolak', 403);
  }

  try {
    const all = await prismaGa.gaProcurementTracking.findMany({
      select: { id: true, originalName: true, itemId: true }
    });

    const toDelete = all.filter(t => looksLikeAccountName(t.originalName));

    if (toDelete.length === 0) {
      return ok({ deleted: 0, msg: 'Tidak ada yang perlu dihapus.' });
    }

    const ids = toDelete.map(t => t.id);
    const affectedItemIds = [...new Set(toDelete.map(t => t.itemId).filter(Boolean))] as string[];

    // Hapus tracking records
    const deleted = await prismaGa.gaProcurementTracking.deleteMany({
      where: { id: { in: ids } }
    });

    // Hapus master GaItem yatim piatu yang nama-nya juga nama akun
    let deletedItemCount = 0;
    for (const itemId of affectedItemIds) {
      const usedCount = await prismaGa.gaProcurementTracking.count({ where: { itemId } });
      const stockCount = await prismaGa.gaStockMovement.count({ where: { itemId } });
      if (usedCount === 0 && stockCount === 0) {
        const item = await prismaGa.gaItem.findUnique({ where: { id: itemId }, select: { nama: true } });
        if (item && looksLikeAccountName(item.nama)) {
          await prismaGa.gaItem.delete({ where: { id: itemId } });
          deletedItemCount++;
        }
      }
    }

    return ok({
      deleted: deleted.count,
      deletedMasterItems: deletedItemCount,
      msg: `Berhasil menghapus ${deleted.count} record pengadaan invalid dan ${deletedItemCount} master item.`,
    });
  } catch (e: any) {
    console.error('[DELETE /api/ga/procurement/cleanup]', e);
    return err(e.message, 500);
  }
}
