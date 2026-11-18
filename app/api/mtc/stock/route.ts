import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/utils';
import { deriveSparepartProcurementSummary } from '@/lib/mtc/procurement-utils';
import { PENDING_ARRIVAL_WHERE } from '@/lib/mtc/procurement-server';

// GET /api/mtc/stock — publik (viewer tanpa login), sama seperti V2
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search    = (searchParams.get('search') ?? '').trim();
  const status    = searchParams.get('status') ?? ''; // safe | low | habis
  const kategoriId = searchParams.get('kategoriId');

  // Ambil semua sparepart aktif beserta stok (aggregate dari movements)
  const spareparts = await prisma.sparepart.findMany({
    where: {
      aktif: true,
      ...(search ? { nama: { contains: search, mode: 'insensitive' } } : {}),
      ...(kategoriId ? { kategoriId: parseInt(kategoriId) } : {}),
    },
    include: {
      kategori: true,
      mesins: { select: { id: true, nama: true } },
      procurementTrackings: {
        where: PENDING_ARRIVAL_WHERE,
        orderBy: { tanggalList: 'desc' },
        select: {
          qty: true,
          nomorPr: true,
          nomorPo: true,
          linkReferences: true,
          statusPr: true,
          statusPo: true,
          tanggalTerima: true,
          linkedPartsJson: true,
        }
      },
      potonganFisiks: {
        where: { status: 'aktif' },
        orderBy: [{ tanggalMasuk: 'asc' }, { id: 'asc' }],
        select: { id: true, panjangAwal: true, panjangSisa: true, asal: true, tanggalMasuk: true },
      },
      movements: {
        where: {
          tipe: { in: ['IN', 'OUT'] },
          OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
        },
        select: { tipe: true, qty: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const result = spareparts
    .map((sp) => {
      const totalIn  = sp.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + Math.abs(m.qty), 0);
      
      let currentStock: number;
      let totalPanjangSisa = 0;

      if (sp.tipeUkur === 'bulk') {
        totalPanjangSisa = sp.potonganFisiks.reduce((s, p) => s + p.panjangSisa, 0);
        currentStock = totalPanjangSisa;
      } else {
        currentStock = totalIn - totalOut;
      }

      let stockStatus: 'safe' | 'low' | 'habis';
      if (currentStock <= 0)          stockStatus = 'habis';
      else if (currentStock < sp.minQty) stockStatus = 'low';
      else                               stockStatus = 'safe';

      const activeTrackings = sp.procurementTrackings || [];
      const activeSummary = activeTrackings.length > 0
        ? deriveSparepartProcurementSummary(activeTrackings)
        : null;
      const firstTracking = activeTrackings[0];

      const noPr = activeSummary
        ? (activeSummary.purchasingNoPr || sp.purchasingNoPr || null)
        : (sp.purchasingStatus !== 'NONE' ? sp.purchasingNoPr : null);
      const noPo = activeSummary
        ? (activeSummary.purchasingNoPo || sp.purchasingNoPo || null)
        : (sp.purchasingStatus === 'PO' ? sp.purchasingNoPo : null);
      const linkRef = sp.linkReference || firstTracking?.linkReferences || null;

      let pStatus = activeSummary ? activeSummary.purchasingStatus : (sp.purchasingStatus || 'NONE');
      if (pStatus !== 'NONE' && pStatus !== 'PR' && pStatus !== 'PO') {
        const upper = pStatus.toUpperCase();
        if (upper === 'CANCELLED' || upper === 'REJECTED' || upper === 'RECEIVED' || upper === 'DONE') {
          pStatus = 'NONE';
        } else {
          pStatus = noPo ? 'PO' : 'PR';
        }
      }

      return {
        id:           sp.id,
        nama:         sp.nama,
        kategori:     sp.kategori?.nama ?? '—',
        kategoriId:   sp.kategoriId,
        mesins:       sp.mesins,
        lokasi:       sp.lokasi ?? '—',
        uom:          sp.uom,
        harga:        Number(sp.harga),
        minQty:       sp.minQty,
        tipeUkur:     sp.tipeUkur,
        dapatDibeliUlang: sp.dapatDibeliUlang,
        potonganFisiks: sp.potonganFisiks,
        totalPanjangSisa,
        totalIn,
        totalOut,
        currentStock,
        status:       stockStatus,
        purchasingStatus: pStatus,
        purchasingNoPr: noPr,
        purchasingNoPo: noPo,
        linkReference: linkRef,
      };
    })
    .filter((sp) => {
      if (!status) return true;
      return sp.status === status;
    });

  return ok(result);
}
