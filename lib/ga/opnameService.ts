import { prismaGa } from '@/lib/prisma-ga';
import { GA_STOCK_MOVEMENT_TIPES, getGaCurrentStockMap, getGaSignedStockAsOf } from '@/lib/ga/stockQty';
import {
  buildLokasiProgress,
  formatIncompleteLokasiMessage,
  type LokasiProgress,
} from '@/lib/ga/opnameProgress';
import type { PrismaClient as GaClient } from '@/lib/generated/ga';

type Tx = Omit<GaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

function opnameKetBase(periodeNama: string) {
  return `Opname: ${periodeNama}`;
}

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

/**
 * Opname posted terakhir yang tanggal hitungnya >= tanggal transaksi.
 * Jika ada, stok pada tanggal itu sudah dipaksa sama dengan hasil hitung fisik —
 * transaksi susulan ber-tanggal sebelum opname akan membuat stok terkoreksi dobel.
 */
export async function findPostedOpnameOnOrAfterDate(tanggal: Date) {
  return prismaGa.gaOpnameSession.findFirst({
    where: { status: 'posted', tanggal: { gte: tanggal } },
    orderBy: { tanggal: 'desc' },
    select: { id: true, periodeNama: true, tanggal: true, postedAt: true },
  });
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

export type OpnameSessionDetail = {
  session: OpnameSessionView;
  lines: OpnameLineView[];
  lokasiProgress: LokasiProgress[];
  /** Jumlah baris qtySistem yang baru disinkron dari stok live; 0 jika tidak ada perubahan / bukan draft. */
  qtySistemUpdated: number;
};

export async function getOpnameSession(
  id: number,
  extras: { qtySistemUpdated?: number } = {}
): Promise<OpnameSessionDetail | null> {
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
    qtySistemUpdated: extras.qtySistemUpdated ?? 0,
  };
}

/**
 * Perbarui kolom Sistem (qtySistem) sesi opname draft dari stok live Database Barang.
 * Dipanggil saat sesi draft dibuka (GET), keyed `itemId` — bukan nama SKU.
 *
 * @param sessionId - `ga_opname_session.id`
 * @returns Detail sesi seperti `getOpnameSession`; `null` jika sesi tidak ada.
 *
 * Side effects: menulis `ga_opname_line.qty_sistem` saja, dan hanya jika angkanya berbeda.
 * Tidak mengubah qty fisik, PIC, status, atau daftar baris.
 * Gotcha: `waiting_approval` dan `posted` dilewati (posted pakai Recalculate).
 */
export async function syncDraftQtySistem(
  sessionId: number
): Promise<OpnameSessionDetail | null> {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      lines: { select: { id: true, itemId: true, qtySistem: true } },
    },
  });
  if (!session) return null;
  if (session.status !== 'draft') {
    return getOpnameSession(sessionId);
  }

  const itemIds = session.lines.map((l) => l.itemId);
  const stockMap = await getGaCurrentStockMap(prismaGa, itemIds);

  const toUpdate = session.lines.filter((l) => {
    const live = stockMap.get(l.itemId) ?? 0;
    return l.qtySistem !== live;
  });

  if (toUpdate.length > 0) {
    await prismaGa.$transaction(async (tx) => {
      for (const l of toUpdate) {
        await tx.gaOpnameLine.update({
          where: { id: l.id },
          data: { qtySistem: stockMap.get(l.itemId) ?? 0 },
        });
      }
    });
  }

  return getOpnameSession(sessionId, { qtySistemUpdated: toUpdate.length });
}

export async function updateOpnameSessionStatus(
  sessionId: number,
  status: 'draft' | 'waiting_approval' | 'posted'
) {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status === 'posted' && status !== 'draft') {
    throw new Error('Sesi sudah diposting, tidak bisa diubah statusnya secara langsung');
  }

  await prismaGa.gaOpnameSession.update({
    where: { id: sessionId },
    data: { status },
  });

  return getOpnameSession(sessionId);
}

async function deleteOpnameMovementsScoped(
  tx: Tx,
  periodeNama: string,
  itemIds: string[],
  _tanggal?: Date
) {
  if (itemIds.length === 0) return;
  await tx.gaStockMovement.deleteMany({
    where: {
      keterangan: { startsWith: opnameKetBase(periodeNama) },
      itemId: { in: itemIds },
    },
  });
}

export async function unpostOpnameSession(sessionId: number) {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      periodeNama: true,
      status: true,
      tanggal: true,
      lines: { select: { itemId: true } },
    },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');

  const itemIds = session.lines.map((l) => l.itemId);

  await prismaGa.$transaction(async (tx) => {
    await deleteOpnameMovementsScoped(tx, session.periodeNama, itemIds, session.tanggal);

    await tx.gaOpnameSession.update({
      where: { id: sessionId },
      data: {
        status: 'draft',
        postedAt: null,
        postMode: null,
      },
    });
  });

  return getOpnameSession(sessionId);
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
  if (session.status === 'posted' || session.status === 'waiting_approval') {
    throw new Error('Sesi dalam status ' + session.status + ', angka hitung fisik terkunci');
  }

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

type OpnameLineWithItem = {
  id: number;
  itemId: string;
  qtyFisik: number | null;
  qtySistem: number;
  item: { nama: string; harga: unknown };
};

async function writeOpnameAdjustments(
  tx: Tx,
  args: {
    lines: OpnameLineWithItem[];
    stockMap: Map<string, number>;
    postMode: OpnamePostMode;
    tanggal: Date;
    picNama: string;
    ketBase: string;
  }
) {
  let inCount = 0;
  let outCount = 0;
  let adjCount = 0;

  const adjustments = args.lines
    .map((l) => {
      const bookStock = args.stockMap.get(l.itemId) ?? 0;
      const qtyFisik = l.qtyFisik ?? 0;
      return { line: l, bookStock, diff: qtyFisik - bookStock };
    })
    .filter((x) => x.diff !== 0);

  for (const adj of adjustments) {
    if (args.postMode === 'in_out' && adj.diff < 0) {
      const keluar = Math.abs(adj.diff);
      if (adj.bookStock < keluar) {
        throw new Error(
          `Stok ${adj.line.item.nama} tidak cukup untuk penyesuaian (buku as-of: ${adj.bookStock}, butuh keluar: ${keluar}). Gunakan mode ADJ atau perbaiki transaksi.`
        );
      }
    }
  }

  for (const adj of adjustments) {
    const row = adj.line.item;
    const harga = row.harga ?? 0;
    if (args.postMode === 'adj') {
      await tx.gaStockMovement.create({
        data: {
          tipe: 'ADJ',
          item: { connect: { id: adj.line.itemId } },
          namaBarang: row.nama,
          qty: adj.diff,
          harga: harga as never,
          tanggal: args.tanggal,
          picNama: args.picNama,
          keterangan: `${args.ketBase} · penyesuaian ${adj.diff > 0 ? '+' : ''}${adj.diff}`,
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
          tanggalTerima: args.tanggal,
          harga: harga as never,
          tanggal: args.tanggal,
          picNama: args.picNama,
          keterangan: `${args.ketBase} · selisih +${adj.diff}`,
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
          harga: harga as never,
          tanggal: args.tanggal,
          tanggalPakai: args.tanggal,
          picNama: args.picNama,
          keterangan: `${args.ketBase} · selisih -${qty}`,
        },
      });
      outCount++;
    }
  }

  return {
    inCount,
    outCount,
    adjCount,
    adjusted: adjustments.length,
    skipped: args.lines.length - adjustments.length,
  };
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

  const tanggal = new Date(input.tanggal + 'T12:00:00');
  const ketBase = opnameKetBase(session.periodeNama);
  const itemIds = session.lines.map((l) => l.itemId);
  const postMode = input.postMode;

  const result = await prismaGa.$transaction(async (tx) => {
    const stockMap = await getGaSignedStockAsOf(tx, itemIds, tanggal);

    for (const l of session.lines) {
      const qtySistem = stockMap.get(l.itemId) ?? 0;
      if (l.qtySistem !== qtySistem) {
        await tx.gaOpnameLine.update({
          where: { id: l.id },
          data: { qtySistem },
        });
      }
    }

    const counts = await writeOpnameAdjustments(tx, {
      lines: session.lines,
      stockMap,
      postMode,
      tanggal,
      picNama: input.picNama,
      ketBase,
    });

    await tx.gaOpnameSession.update({
      where: { id: sessionId },
      data: { status: 'posted', postedAt: new Date(), postMode, tanggal },
    });

    return counts;
  });

  return {
    postMode,
    inCount: result.inCount,
    outCount: result.outCount,
    adjCount: result.adjCount,
    skipped: result.skipped,
  };
}

export type OpnameBackdateMovementView = {
  id: number;
  itemId: string;
  namaBarang: string;
  tipe: string;
  qty: number;
  tanggal: string;
  createdAt: string;
};

export type OpnameBackdateSummary = {
  count: number;
  itemCount: number;
  movements: OpnameBackdateMovementView[];
};

export async function findBackdateMovementsForOpname(
  sessionId: number
): Promise<OpnameBackdateSummary> {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    select: {
      periodeNama: true,
      tanggal: true,
      postedAt: true,
      status: true,
      lines: { select: { itemId: true } },
    },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status !== 'posted' || !session.postedAt) {
    return { count: 0, itemCount: 0, movements: [] };
  }

  const itemIds = session.lines.map((l) => l.itemId);
  if (itemIds.length === 0) return { count: 0, itemCount: 0, movements: [] };

  const ketBase = opnameKetBase(session.periodeNama);
  const where = {
    itemId: { in: itemIds },
    tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] },
    tanggal: { lte: session.tanggal },
    createdAt: { gt: session.postedAt },
    NOT: { keterangan: { startsWith: ketBase } },
  };

  const [totalCount, distinctItems, rows] = await Promise.all([
    prismaGa.gaStockMovement.count({ where }),
    prismaGa.gaStockMovement.findMany({
      where,
      select: { itemId: true },
      distinct: ['itemId'],
    }),
    prismaGa.gaStockMovement.findMany({
      where,
      select: {
        id: true,
        itemId: true,
        namaBarang: true,
        tipe: true,
        qty: true,
        tanggal: true,
        createdAt: true,
        item: { select: { nama: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }),
  ]);

  const movements: OpnameBackdateMovementView[] = rows
    .filter((r): r is typeof r & { itemId: string } => r.itemId != null)
    .map((r) => ({
      id: r.id,
      itemId: r.itemId,
      namaBarang: r.item?.nama ?? r.namaBarang ?? r.itemId,
      tipe: r.tipe,
      qty: r.qty,
      tanggal: r.tanggal.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
    }));

  return {
    count: totalCount,
    itemCount: distinctItems.filter((r) => r.itemId != null).length,
    movements,
  };
}

export type OpnameRecalculateLinePreview = {
  lineId: number;
  itemId: string;
  nama: string;
  qtyFisik: number;
  qtySistemLama: number;
  qtySistemBaru: number;
  adjLama: number;
  adjBaru: number;
  changed: boolean;
};

export type OpnameRecalculatePreview = {
  sessionId: number;
  periodeNama: string;
  tanggal: string;
  postMode: OpnamePostMode;
  backdate: OpnameBackdateSummary;
  lines: OpnameRecalculateLinePreview[];
  changedLineCount: number;
  adjustedCount: number;
  blockedByNewerOpname: string | null;
};

async function assertNoNewerPostedOpname(
  sessionId: number,
  tanggal: Date,
  itemIds: string[]
): Promise<string | null> {
  const newer = await prismaGa.gaOpnameSession.findFirst({
    where: {
      id: { not: sessionId },
      status: 'posted',
      tanggal: { gt: tanggal },
      lines: { some: { itemId: { in: itemIds } } },
    },
    select: { id: true, periodeNama: true, tanggal: true },
    orderBy: { tanggal: 'desc' },
  });
  if (!newer) return null;
  const tgl = newer.tanggal.toISOString().slice(0, 10);
  return `Ada opname posted lebih baru (#${newer.id} "${newer.periodeNama}", ${tgl}). Recalculate ditolak agar tidak saling timpa.`;
}

export async function previewRecalculateOpnameSession(
  sessionId: number
): Promise<OpnameRecalculatePreview> {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    include: { lines: { include: { item: true } } },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status !== 'posted') {
    throw new Error('Recalculate hanya untuk sesi yang sudah diposting');
  }

  const itemIds = session.lines.map((l) => l.itemId);
  const ketBase = opnameKetBase(session.periodeNama);
  const postMode: OpnamePostMode =
    session.postMode === 'adj' || session.postMode === 'in_out' ? session.postMode : 'adj';

  const blockedByNewerOpname = await assertNoNewerPostedOpname(
    sessionId,
    session.tanggal,
    itemIds
  );

  const stockMap = await getGaSignedStockAsOf(prismaGa, itemIds, session.tanggal, {
    excludeKeteranganPrefix: ketBase,
    excludeItemIds: itemIds,
  });

  const backdate = await findBackdateMovementsForOpname(sessionId);

  const lines: OpnameRecalculateLinePreview[] = session.lines.map((l) => {
    const qtyFisik = l.qtyFisik ?? 0;
    const qtySistemLama = l.qtySistem;
    const qtySistemBaru = stockMap.get(l.itemId) ?? 0;
    const adjLama = qtyFisik - qtySistemLama;
    const adjBaru = qtyFisik - qtySistemBaru;
    return {
      lineId: l.id,
      itemId: l.itemId,
      nama: l.item.nama,
      qtyFisik,
      qtySistemLama,
      qtySistemBaru,
      adjLama,
      adjBaru,
      changed: qtySistemLama !== qtySistemBaru || adjLama !== adjBaru,
    };
  });

  const changedLineCount = lines.filter((l) => l.changed).length;
  const adjustedCount = lines.filter((l) => l.adjBaru !== 0).length;

  return {
    sessionId: session.id,
    periodeNama: session.periodeNama,
    tanggal: session.tanggal.toISOString().slice(0, 10),
    postMode,
    backdate,
    lines,
    changedLineCount,
    adjustedCount,
    blockedByNewerOpname,
  };
}

export async function recalculateOpnameSession(
  sessionId: number,
  input: { picNama?: string } = {}
) {
  const session = await prismaGa.gaOpnameSession.findUnique({
    where: { id: sessionId },
    include: { lines: { include: { item: true } } },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status !== 'posted') {
    throw new Error('Recalculate hanya untuk sesi yang sudah diposting');
  }

  const uncounted = session.lines.filter((l) => l.qtyFisik == null);
  if (uncounted.length > 0) {
    throw new Error(`Masih ada ${uncounted.length} barang tanpa qty fisik`);
  }

  const itemIds = session.lines.map((l) => l.itemId);
  const blocked = await assertNoNewerPostedOpname(sessionId, session.tanggal, itemIds);
  if (blocked) throw new Error(blocked);

  const ketBase = opnameKetBase(session.periodeNama);
  const postMode: OpnamePostMode =
    session.postMode === 'adj' || session.postMode === 'in_out' ? session.postMode : 'adj';

  const picFromMovement = await prismaGa.gaStockMovement.findFirst({
    where: {
      keterangan: { startsWith: ketBase },
      itemId: { in: itemIds },
      picNama: { not: null },
    },
    select: { picNama: true },
    orderBy: { id: 'desc' },
  });
  const picNama =
    (input.picNama && input.picNama.trim()) ||
    picFromMovement?.picNama ||
    'Recalculate';

  const backdate = await findBackdateMovementsForOpname(sessionId);

  const result = await prismaGa.$transaction(async (tx) => {
    await deleteOpnameMovementsScoped(tx, session.periodeNama, itemIds, session.tanggal);

    const stockMap = await getGaSignedStockAsOf(tx, itemIds, session.tanggal, {
      excludeKeteranganPrefix: ketBase,
      excludeItemIds: itemIds,
    });

    for (const l of session.lines) {
      const qtySistem = stockMap.get(l.itemId) ?? 0;
      await tx.gaOpnameLine.update({
        where: { id: l.id },
        data: { qtySistem },
      });
    }

    const counts = await writeOpnameAdjustments(tx, {
      lines: session.lines.map((l) => ({
        ...l,
        qtySistem: stockMap.get(l.itemId) ?? 0,
      })),
      stockMap,
      postMode,
      tanggal: session.tanggal,
      picNama,
      ketBase,
    });

    await tx.gaOpnameSession.update({
      where: { id: sessionId },
      data: { postedAt: new Date(), postMode },
    });

    return counts;
  });

  return {
    postMode,
    inCount: result.inCount,
    outCount: result.outCount,
    adjCount: result.adjCount,
    adjusted: result.adjusted,
    skipped: result.skipped,
    backdateCount: backdate.count,
    changedLines: result.adjusted,
    detail: await getOpnameSession(sessionId),
  };
}
