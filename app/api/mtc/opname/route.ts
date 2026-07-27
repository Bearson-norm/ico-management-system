import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, err } from '@/lib/utils';
import { requireMtcAuth } from '@/lib/auth';

// GET /api/mtc/opname - List all Stock Opname sessions
export async function GET(req: NextRequest) {
  try {
    const sessions = await prisma.opnameSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { items: true }
        }
      }
    });

    // Calculate progress & summary stats for each session
    const formatted = await Promise.all(
      sessions.map(async (session) => {
        const items = await prisma.opnameItem.findMany({
          where: { sessionId: session.id },
          select: { qtyFisik: true, qtySistem: true, selisih: true }
        });

        const totalItems = items.length;
        const countedItems = items.filter(i => i.qtyFisik !== null && i.qtyFisik !== undefined).length;
        const progressPct = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;
        
        const totalPlus = items.filter(i => i.selisih > 0).reduce((acc, i) => acc + i.selisih, 0);
        const totalMinus = items.filter(i => i.selisih < 0).reduce((acc, i) => acc + Math.abs(i.selisih), 0);
        const totalMatching = items.filter(i => i.qtyFisik !== null && i.selisih === 0).length;

        return {
          ...session,
          totalItems,
          countedItems,
          progressPct,
          totalPlus,
          totalMinus,
          totalMatching
        };
      })
    );

    return ok(formatted);
  } catch (e: any) {
    console.error('Error fetching opname sessions:', e);
    return err('Gagal mengambil daftar sesi Stock Opname: ' + e.message, 500);
  }
}

// POST /api/mtc/opname - Create a new Stock Opname session & pre-populate items
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireMtcAuth();

    const body = await req.json();
    const { judul, lokasi, catatan } = body;

    if (!judul || !String(judul).trim()) {
      return err('Judul sesi Stock Opname wajib diisi', 400);
    }

    // 1. Fetch current active master spareparts (filtered by location if provided)
    const cleanLokasi = lokasi ? String(lokasi).trim() : '';
    const isAllLocations = !cleanLokasi || cleanLokasi.toLowerCase().includes('semua') || cleanLokasi.toLowerCase().includes('all');

    const spareparts = await prisma.sparepart.findMany({
      where: {
        aktif: true,
        ...(!isAllLocations ? {
          lokasi: { contains: cleanLokasi, mode: 'insensitive' }
        } : {})
      },
      include: {
        kategori: true
      }
    });

    // Fetch all stock movements to calculate currentStock
    const allMovements = await prisma.stockMovement.findMany({
      select: {
        sparepartId: true,
        tipe: true,
        qty: true
      }
    });

    const stockMap = new Map<string, number>();
    allMovements.forEach(m => {
      if (!m.sparepartId) return;
      const current = stockMap.get(m.sparepartId) || 0;
      if (m.tipe === 'IN') stockMap.set(m.sparepartId, current + m.qty);
      else if (m.tipe === 'OUT') stockMap.set(m.sparepartId, current - m.qty);
    });

    // 2. Create the OpnameSession
    const newSession = await prisma.opnameSession.create({
      data: {
        judul: String(judul).trim(),
        lokasi: lokasi ? String(lokasi).trim() : null,
        catatan: catatan ? String(catatan).trim() : null,
        status: 'DRAFT',
        createdById: (sessionUser?.user as any)?.id || null
      }
    });

    // 3. Pre-populate OpnameItems for all matching spareparts
    if (spareparts.length > 0) {
      const itemsData = spareparts.map(sp => {
        const qtySistem = stockMap.get(sp.id) ?? 0;
        return {
          sessionId: newSession.id,
          sparepartId: sp.id,
          namaItem: sp.nama,
          kategori: sp.kategori?.nama || 'Umum',
          lokasi: sp.lokasi || 'Gudang MTC',
          uom: sp.uom || 'Pcs',
          qtySistem,
          qtyFisik: null,
          selisih: 0,
          isNewItem: false
        };
      });

      await prisma.opnameItem.createMany({
        data: itemsData
      });
    }

    return ok({
      id: newSession.id,
      msg: `Sesi Stock Opname "${newSession.judul}" berhasil dibuat dengan ${spareparts.length} item.`
    });
  } catch (e: any) {
    console.error('Error creating opname session:', e);
    return err('Gagal membuat sesi Stock Opname: ' + e.message, 500);
  }
}
