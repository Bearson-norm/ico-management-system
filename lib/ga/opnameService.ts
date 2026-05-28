import { prismaGa } from '@/lib/prisma-ga';
import { getGaCurrentStock, getGaCurrentStockMap } from '@/lib/ga/stockQty';
import {
  buildLokasiProgress,
  formatIncompleteLokasiMessage,
  type LokasiProgress,
} from '@/lib/ga/opnameProgress';

export type { LokasiProgress };
export { buildLokasiProgress, formatIncompleteLokasiMessage };

export type OpnameLineView = {
  id: number;
  itemId: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string;
  uom: string;
  qtySistem: number;
  qtyFisik: number | null;
  picNama: string | null;
  selisih: number | null;
  counted: boolean;
};

export type OpnamePostMode = 'in_out' | 'adj';

export type OpnameSessionView = {
  id: number;
  periodeNama: string;
  lokasi: string | null;
  status: string;
  tanggal: string;
  postedAt: string | null;
  postMode: OpnamePostMode | null;
  createdAt: string;
  lineCount: number;
  countedCount: number;
  varianceCount: number;
};

function mapSession(
  s: {
    id: number;
    periodeNama: string;
    lokasi: string | null;
    status: string;
    tanggal: Date;
    postedAt: Date | null;
    postMode: string | null;
    createdAt: Date;
    lines: { qtyFisik: number | null; qtySistem: number }[];
  }
): OpnameSessionView {
  const counted = s.lines.filter((l) => l.qtyFisik != null);
  const variance = counted.filter((l) => l.qtyFisik !== l.qtySistem);
  return {
    id: s.id,
    periodeNama: s.periodeNama,
    lokasi: s.lokasi,
    status: s.status,
    tanggal: s.tanggal.toISOString().slice(0, 10),
    postedAt: s.postedAt?.toISOString() ?? null,
    postMode: (s.postMode === 'adj' || s.postMode === 'in_out' ? s.postMode : null) as OpnamePostMode | null,
    createdAt: s.createdAt.toISOString(),
    lineCount: s.lines.length,
    countedCount: counted.length,
    varianceCount: variance.length,
  };
}

function mapLine(
  line: {
    id: number;
    itemId: string;
    qtySistem: number;
    qtyFisik: number | null;
    picNama: string | null;
    item: { nama: string; kodeBarang: string | null; lokasi: string | null; uom: string };
  }
): OpnameLineView {
  const counted = line.qtyFisik != null;
  const selisih = counted ? line.qtyFisik! - line.qtySistem : null;
  return {
    id: line.id,
    itemId: line.itemId,
    nama: line.item.nama,
    kodeBarang: line.item.kodeBarang,
    lokasi: line.item.lokasi ?? '—',
    uom: line.item.uom,
    qtySistem: line.qtySistem,
    qtyFisik: line.qtyFisik,
    picNama: line.picNama,
    selisih,
    counted,
  };
}

export async function listOpnameSessions(): Promise<OpnameSessionView[]> {
  const sessions = await prismaGa.gaOpnameSession.findMany({
    orderBy: { createdAt: 'desc' },
    include: { lines: { select: { qtyFisik: true, qtySistem: true } } },
  });

  return sessions.map(mapSession);
}

export async function createOpnameSession(input: {
  periodeNama: string;
  tanggal?: string;
}) {
  const tanggal = input.tanggal
    ? new Date(input.tanggal + 'T12:00:00')
    : new Date();

  const items = await prismaGa.gaItem.findMany({
    where: { aktif: true },
    orderBy: [{ lokasi: 'asc' }, { nama: 'asc' }],
  });

  if (items.length === 0) {
    throw new Error('Tidak ada barang aktif untuk opname');
  }

  const stockMap = await getGaCurrentStockMap(
    prismaGa,
    items.map((i) => i.id)
  );

  const session = await prismaGa.gaOpnameSession.create({
    data: {
      periodeNama: input.periodeNama.trim(),
      lokasi: null,
      status: 'draft',
      tanggal,
      lines: {
        create: items.map((it) => ({
          itemId: it.id,
          qtySistem: stockMap.get(it.id) ?? 0,
          qtyFisik: null,
        })),
      },
    },
    include: {
      lines: {
        include: { item: true },
        orderBy: { item: { nama: 'asc' } },
      },
    },
  });

  const lines = session.lines.map(mapLine);
  return {
    session: mapSession({ ...session, postMode: null }),
    lines,
    lokasiProgress: buildLokasiProgress(lines),
  };
}

export async function getOpnameSession(id: number) {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id },
    include: {
      lines: {
        include: { item: true },
        orderBy: { item: { nama: 'asc' } },
      },
    },
  });
  if (!session) return null;

  const lines = session.lines.map(mapLine);
  return {
    session: mapSession(session),
    lines,
    lokasiProgress: buildLokasiProgress(lines),
  };
}

export async function updateOpnameLines(
  sessionId: number,
  updates: { id: number; qtyFisik: number | null; picNama?: string }[]
) {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status === 'posted') throw new Error('Sesi sudah diposting, tidak bisa diubah');

  await prismaGa.$transaction(async (tx) => {
    for (const u of updates) {
      const line = await tx.gaOpnameLine.findFirst({
        where: { id: u.id, sessionId },
      });
      if (!line) throw new Error(`Baris opname #${u.id} tidak valid`);
      await tx.gaOpnameLine.update({
        where: { id: u.id },
        data: {
          qtyFisik: u.qtyFisik,
          ...(u.picNama !== undefined ? { picNama: u.picNama || null } : {}),
        },
      });
    }
  });

  return getOpnameSession(sessionId);
}

export async function postOpnameSession(
  sessionId: number,
  input: { tanggal: string; picNama: string; postMode: OpnamePostMode }
) {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    include: {
      lines: { include: { item: true } },
    },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status === 'posted') throw new Error('Sesi sudah diposting');

  const lineViews = session.lines.map((l) => mapLine(l));
  const progress = buildLokasiProgress(lineViews);
  const uncounted = session.lines.filter((l) => l.qtyFisik == null);
  if (uncounted.length > 0) {
    const lokasiMsg = formatIncompleteLokasiMessage(progress);
    throw new Error(
      `Masih ada ${uncounted.length} barang belum dihitung di semua gedung. ${lokasiMsg}`
    );
  }

  const adjustments = session.lines
    .map((l) => ({
      line: l,
      diff: (l.qtyFisik ?? 0) - l.qtySistem,
    }))
    .filter((x) => x.diff !== 0);

  const tanggal = new Date(input.tanggal + 'T12:00:00');
  const ketBase = `Opname: ${session.periodeNama}`;

  for (const adj of adjustments) {
    if (adj.diff < 0) {
      const stok = await getGaCurrentStock(prismaGa, adj.line.itemId);
      if (stok < Math.abs(adj.diff)) {
        throw new Error(
          `Stok ${adj.line.item.nama} tidak cukup untuk penyesuaian (sisa: ${stok}, butuh keluar: ${Math.abs(adj.diff)})`
        );
      }
    }
  }

  let inCount = 0;
  let outCount = 0;
  let adjCount = 0;
  const postMode = input.postMode;

  await prismaGa.$transaction(async (tx) => {
    for (const adj of adjustments) {
      const row = adj.line.item;
      if (postMode === 'adj') {
        await tx.gaStockMovement.create({
          data: {
            tipe: 'ADJ',
            item: { connect: { id: adj.line.itemId } },
            namaBarang: row.nama,
            qty: adj.diff,
            harga: row.harga,
            tanggal,
            picNama: input.picNama,
            keterangan: `${ketBase} · penyesuaian ${adj.diff > 0 ? '+' : ''}${adj.diff}`,
          },
        });
        adjCount++;
      } else if (adj.diff > 0) {
        await tx.gaStockMovement.create({
          data: {
            tipe: 'IN',
            item: { connect: { id: adj.line.itemId } },
            namaBarang: row.nama,
            qty: adj.diff,
            qtyDiterima: adj.diff,
            tanggalTerima: tanggal,
            harga: row.harga,
            tanggal,
            picNama: input.picNama,
            keterangan: `${ketBase} · selisih +${adj.diff}`,
          },
        });
        inCount++;
      } else {
        const qty = Math.abs(adj.diff);
        await tx.gaStockMovement.create({
          data: {
            tipe: 'OUT',
            item: { connect: { id: adj.line.itemId } },
            namaBarang: row.nama,
            qty,
            harga: row.harga,
            tanggal,
            tanggalPakai: tanggal,
            picNama: input.picNama,
            keterangan: `${ketBase} · selisih -${qty}`,
          },
        });
        outCount++;
      }
    }

    await tx.gaOpnameSession.update({
      where: { id: sessionId },
      data: { status: 'posted', postedAt: new Date(), postMode },
    });
  });

  return {
    postMode,
    inCount,
    outCount,
    adjCount,
    skipped: session.lines.length - adjustments.length,
  };
}
