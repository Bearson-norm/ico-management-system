import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, err } from '@/lib/utils';
import { requireMtcAuth } from '@/lib/auth';

// POST /api/mtc/opname/[id]/item - Add an unlisted physical item on-the-fly to an active SO session
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireMtcAuth();
    if (!sessionUser) return err('Unauthorized', 401);

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);
    if (session.status === 'POSTED') return err('Sesi sudah di-posting', 400);

    const body = await req.json();
    const { namaItem, kategori, lokasi, uom, qtyFisik, harga, catatan, createMaster } = body;

    if (!namaItem || !String(namaItem).trim()) {
      return err('Nama barang fisik wajib diisi', 400);
    }

    const cleanNama = String(namaItem).trim();
    const cleanKategori = kategori ? String(kategori).trim() : 'Umum';
    const cleanLokasi = lokasi ? String(lokasi).trim() : (session.lokasi || 'Gudang MTC');
    const cleanUom = uom ? String(uom).trim() : 'Pcs';
    const parsedQtyFisik = Math.max(0, parseInt(String(qtyFisik)) || 0);

    let sparepartId: string | null = null;

    // Optional: Auto-create in Master Data if requested
    if (createMaster) {
      // Find category ID
      let dbKat = await prisma.kategori.findFirst({
        where: { nama: { equals: cleanKategori, mode: 'insensitive' } }
      });
      if (!dbKat) {
        dbKat = await prisma.kategori.create({
          data: { nama: cleanKategori, tipe: 'umum' }
        });
      }

      // Generate ID for new sparepart (SPXXXX)
      const lastSp = await prisma.sparepart.findFirst({
        where: { id: { startsWith: 'SP' } },
        orderBy: { id: 'desc' }
      });
      let nextNum = 1;
      if (lastSp) {
        const match = lastSp.id.match(/\d+/);
        if (match) nextNum = parseInt(match[0]) + 1;
      }
      const newSpId = `SP${String(nextNum).padStart(4, '0')}`;

      const newSp = await prisma.sparepart.create({
        data: {
          id: newSpId,
          nama: cleanNama,
          kategoriId: dbKat.id,
          uom: cleanUom,
          lokasi: cleanLokasi,
          harga: harga ? Number(harga) : 0,
          aktif: true
        }
      });
      sparepartId = newSp.id;
    }

    const auditorName = sessionUser.namaLengkap || sessionUser.username || 'Teknisi MTC';

    // Create OpnameItem with isNewItem = true
    const newItem = await prisma.opnameItem.create({
      data: {
        sessionId,
        sparepartId,
        namaItem: cleanNama,
        kategori: cleanKategori,
        lokasi: cleanLokasi,
        uom: cleanUom,
        qtySistem: 0, // Unlisted physical item had 0 system stock
        qtyFisik: parsedQtyFisik,
        selisih: parsedQtyFisik, // Variance is +parsedQtyFisik
        catatan: catatan ? String(catatan).trim() : 'Barang fisik tidak terdaftar (Ditambahkan saat Opname)',
        auditedBy: auditorName,
        isNewItem: true
      }
    });

    return ok({
      item: newItem,
      msg: `Barang fisik "${cleanNama}" (Qty: ${parsedQtyFisik}) berhasil ditambahkan ke sesi Stock Opname!`
    });
  } catch (e: any) {
    console.error('Error adding unlisted opname item:', e);
    return err('Gagal menambahkan barang ke sesi opname: ' + e.message, 500);
  }
}
