import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, err } from '@/lib/utils';

// GET /api/mtc/procurement/catalog
export async function GET(req: NextRequest) {
  try {
    // Ambil seluruh data pelacakan pengadaan yang pernah dibuat, urut berdasarkan tgl terbaru
    const trackingItems = await prisma.procurementTracking.findMany({
      orderBy: {
        tanggalList: 'desc',
      },
    });

    // Lakukan mapping manual untuk menyaring nama unik (case-insensitive)
    // agar hanya menyimpan detail pembelian TERBARU untuk masing-masing barang
    const uniqueCatalogMap = new Map();

    for (const item of trackingItems) {
      if (!item.originalName || !item.originalName.trim()) continue;
      const key = item.originalName.trim().toLowerCase();

      if (!uniqueCatalogMap.has(key)) {
        uniqueCatalogMap.set(key, {
          originalName: item.originalName.trim(),
          sparepartId: item.sparepartId,
          keterangan: item.keterangan || 'consumable',
          productCategory: item.productCategory || 'Sparepart',
          urgency: item.urgency || 'Normal',
          linkReferences: item.linkReferences || '',
          vendor: item.vendor || '',
          harga: item.harga ? Number(item.harga) : 0,
          isStocked: item.isStocked,
        });
      }
    }

    const resultList = Array.from(uniqueCatalogMap.values());
    return ok(resultList);
  } catch (e: any) {
    console.error('[GET /api/mtc/procurement/catalog] Error:', e);
    return err('Gagal memuat katalog riwayat pengadaan', 500);
  }
}
