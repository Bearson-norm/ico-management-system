import type { PrismaClient as GaClient } from '@/lib/generated/ga';
import { GA_STOCK_MOVEMENT_TIPES } from '@/lib/ga/stockQty';

type Tx = Omit<GaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export type AuditGenerateSource = 'cron' | 'manual';

export type AuditGenerateResult = {
  snapshotId: number;
  periode: string;
  cutoffAt: string;
  lineCount: number;
  regenerated: boolean;
};

/** Parts tanggal di zona Asia/Jakarta */
export function getJakartaYmd(date: Date = new Date()): { y: number; m: number; d: number } {
  const s = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** Midnight Asia/Jakarta sebagai Instant UTC */
export function jakartaDateTime(y: number, m: number, d: number, h = 0, min = 0, sec = 0): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(
    `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sec)}+07:00`
  );
}

export function periodeFromJakarta(date: Date = new Date()): string {
  const { y, m } = getJakartaYmd(date);
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function monthBoundsJakarta(periode: string): { monthStart: Date; nextMonthStart: Date } {
  const [ys, ms] = periode.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Periode tidak valid: ${periode}`);
  }
  const monthStart = jakartaDateTime(y, m, 1);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextMonthStart = jakartaDateTime(nextY, nextM, 1);
  return { monthStart, nextMonthStart };
}

/** Stok tanpa clamp ke 0 — untuk audit agar selisih tidak tersembunyi */
export function signedStockFromMovements(
  movements: { tipe: string; qty: number }[]
): { saldo: number; totalIn: number; totalOut: number; totalAdj: number } {
  let saldo = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalAdj = 0;
  for (const mv of movements) {
    if (mv.tipe === 'IN') {
      saldo += mv.qty;
      totalIn += mv.qty;
    } else if (mv.tipe === 'OUT') {
      saldo -= mv.qty;
      totalOut += mv.qty;
    } else if (mv.tipe === 'ADJ') {
      saldo += mv.qty;
      totalAdj += mv.qty;
    }
  }
  return { saldo, totalIn, totalOut, totalAdj };
}

export async function generateGaAuditSnapshot(
  db: Tx | GaClient,
  options: {
    periode?: string;
    cutoffAt?: Date;
    source?: AuditGenerateSource;
    force?: boolean;
  } = {}
): Promise<AuditGenerateResult> {
  const now = options.cutoffAt ?? new Date();
  const periode = options.periode ?? periodeFromJakarta(now);
  const source = options.source ?? 'manual';
  const force = options.force === true;
  const { monthStart } = monthBoundsJakarta(periode);
  const cutoffAt = now < monthStart ? monthStart : now;

  const existing = await db.gaAuditSnapshot.findUnique({ where: { periode } });
  if (existing && !force) {
    throw Object.assign(new Error(`Snapshot periode ${periode} sudah ada`), {
      code: 'SNAPSHOT_EXISTS',
      snapshotId: existing.id,
    });
  }

  const items = await db.gaItem.findMany({
    where: { aktif: true },
    select: { id: true, nama: true, uom: true, lokasi: true },
    orderBy: { nama: 'asc' },
  });

  const itemIds = items.map((i) => i.id);

  const openingMovements =
    itemIds.length === 0
      ? []
      : await db.gaStockMovement.findMany({
          where: {
            itemId: { in: itemIds },
            tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] },
            tanggal: { lt: monthStart },
          },
          select: { itemId: true, tipe: true, qty: true },
        });

  const periodMovements =
    itemIds.length === 0
      ? []
      : await db.gaStockMovement.findMany({
          where: {
            itemId: { in: itemIds },
            tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] },
            tanggal: { gte: monthStart, lt: cutoffAt },
          },
          select: { itemId: true, tipe: true, qty: true },
        });

  const openingByItem = new Map<string, { tipe: string; qty: number }[]>();
  for (const row of openingMovements) {
    if (!row.itemId) continue;
    const list = openingByItem.get(row.itemId) ?? [];
    list.push({ tipe: row.tipe, qty: row.qty });
    openingByItem.set(row.itemId, list);
  }

  const periodByItem = new Map<string, { tipe: string; qty: number }[]>();
  for (const row of periodMovements) {
    if (!row.itemId) continue;
    const list = periodByItem.get(row.itemId) ?? [];
    list.push({ tipe: row.tipe, qty: row.qty });
    periodByItem.set(row.itemId, list);
  }

  // Opname posted terakhir dalam periode (sampai cutoff)
  const opnameSessions = await db.gaOpnameSession.findMany({
    where: {
      status: 'posted',
      OR: [
        { postedAt: { gte: monthStart, lt: cutoffAt } },
        { postedAt: null, tanggal: { gte: monthStart, lt: cutoffAt } },
      ],
    },
    orderBy: [{ postedAt: 'desc' }, { tanggal: 'desc' }],
    include: { lines: true },
  });

  const opnameByItem = new Map<string, { qtyFisik: number | null; sessionId: number }>();
  for (const session of opnameSessions) {
    for (const line of session.lines) {
      if (opnameByItem.has(line.itemId)) continue;
      opnameByItem.set(line.itemId, {
        qtyFisik: line.qtyFisik,
        sessionId: session.id,
      });
    }
  }

  const lineData = items.map((item) => {
    const saldoAwal = signedStockFromMovements(openingByItem.get(item.id) ?? []).saldo;
    const periodAgg = signedStockFromMovements(periodByItem.get(item.id) ?? []);
    const stokSistem = saldoAwal + periodAgg.totalIn - periodAgg.totalOut + periodAgg.totalAdj;
    const opname = opnameByItem.get(item.id);
    const qtyFisik = opname?.qtyFisik ?? null;
    const selisih = qtyFisik == null ? null : qtyFisik - stokSistem;
    const jumlahTransaksi = (periodByItem.get(item.id) ?? []).length;

    return {
      itemId: item.id,
      namaItem: item.nama,
      uom: item.uom,
      lokasi: item.lokasi,
      saldoAwal,
      totalIn: periodAgg.totalIn,
      totalOut: periodAgg.totalOut,
      totalAdj: periodAgg.totalAdj,
      stokSistem,
      qtyFisik,
      selisih,
      opnameSessionId: opname?.sessionId ?? null,
      jumlahTransaksi,
    };
  });

  const snapshot = await db.$transaction(async (tx) => {
    if (existing && force) {
      await tx.gaAuditSnapshotLine.deleteMany({ where: { snapshotId: existing.id } });
      await tx.gaAuditSnapshot.delete({ where: { id: existing.id } });
    }

    return tx.gaAuditSnapshot.create({
      data: {
        periode,
        cutoffAt,
        source,
        lines: { create: lineData },
      },
      include: { _count: { select: { lines: true } } },
    });
  });

  return {
    snapshotId: snapshot.id,
    periode: snapshot.periode,
    cutoffAt: snapshot.cutoffAt.toISOString(),
    lineCount: snapshot._count.lines,
    regenerated: Boolean(existing && force),
  };
}
