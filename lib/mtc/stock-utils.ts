export type StockMovementLike = {
  tipe: string;
  qty: number;
  purchaseType?: string | null;
};

export type PotonganFisikLike = {
  panjangSisa: number;
};

export type MtcHistoryFilterParams = {
  tipe?: string;
  kategoriOut?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string;
};

export type MtcTrendFilterParams = {
  sparepartId?: string;
  kategori?: string;
  dateLimit?: Date | null;
};

/**
 * Prisma filter excluding historical sheets imports while keeping rows where
 * `purchaseType` is NULL (PostgreSQL `!=` drops NULLs).
 */
export const NOT_HISTORI_SHEETS_WHERE = {
  OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
};

/**
 * Build a PostgreSQL-safe Prisma exclusion filter on nullable `keterangan`.
 * Plain `NOT: { keterangan: { contains: tag } }` compiles to `NOT (keterangan LIKE ...)`
 * which evaluates to UNKNOWN and drops rows where `keterangan IS NULL`.
 */
export function keteranganNotContains(tag: string) {
  return {
    OR: [
      { keterangan: null },
      { NOT: { keterangan: { contains: tag } } },
    ],
  };
}

export const NOT_SILENT_WHERE = keteranganNotContains('[SILENT]');
export const NOT_OPNAME_WHERE = keteranganNotContains('[OPNAME]');

function buildDateRangeFilter(dateFrom?: string | null, dateTo?: string | null) {
  if (!dateFrom && !dateTo) return null;
  return {
    tanggal: {
      ...(dateFrom ? { gte: new Date(dateFrom + 'T00:00:00') } : {}),
      ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
    },
  };
}

function buildSearchFilter(search?: string) {
  const q = (search ?? '').trim();
  if (!q) return null;
  return {
    OR: [
      { sparepartId: { contains: q, mode: 'insensitive' as const } },
      { namaItem: { contains: q, mode: 'insensitive' as const } },
      { noReport: { contains: q, mode: 'insensitive' as const } },
      { keterangan: { contains: q, mode: 'insensitive' as const } },
      { sparepart: { nama: { contains: q, mode: 'insensitive' as const } } },
      { pic: { nama: { contains: q, mode: 'insensitive' as const } } },
    ],
  };
}

function buildKategoriOutFilter(kategoriOut?: string) {
  if (!kategoriOut) return null;
  if (kategoriOut === 'UNCATEGORIZED' || kategoriOut === 'Belum Dikategorikan') {
    return {
      OR: [{ kategoriOut: null }, { kategoriOut: '' }],
    };
  }
  if (kategoriOut === 'Maintenance') {
    return {
      OR: [
        { kategoriOut: 'Maintenance' },
        { kategoriOut: 'Maintenance Produksi' },
      ],
    };
  }
  return { kategoriOut };
}

/**
 * Build the Prisma `where` clause for `/api/mtc/history` and `/api/mtc/history/export`
 * using `AND` blocks so multiple `OR` clauses (NULL guards, search, category) never collide.
 */
export function buildMtcHistoryWhere(params: MtcHistoryFilterParams) {
  const andConditions: Record<string, unknown>[] = [NOT_SILENT_WHERE];
  const tipe = params.tipe ?? '';

  if (tipe === 'OUT' || tipe === 'IN') {
    andConditions.push({ tipe });
    andConditions.push(NOT_OPNAME_WHERE);
  } else if (tipe === 'ADJUSTMENT') {
    andConditions.push({ keterangan: { contains: '[OPNAME]' } });
  } else if (tipe === 'LOG') {
    andConditions.push({ tipe: 'LOG' });
  }

  const katFilter = buildKategoriOutFilter(params.kategoriOut);
  if (katFilter) andConditions.push(katFilter);

  const dateFilter = buildDateRangeFilter(params.dateFrom, params.dateTo);
  if (dateFilter) andConditions.push(dateFilter);

  const searchFilter = buildSearchFilter(params.search);
  if (searchFilter) andConditions.push(searchFilter);

  return { AND: andConditions };
}

/**
 * Build the Prisma `where` clause for `/api/mtc/trend` OUT usage analytics,
 * excluding `[SILENT]` and `[OPNAME]` adjustments without dropping NULL `keterangan` rows.
 */
export function buildMtcTrendMovementWhere(params: MtcTrendFilterParams) {
  const andConditions: Record<string, unknown>[] = [
    { tipe: 'OUT' },
    params.sparepartId
      ? { sparepartId: params.sparepartId }
      : { sparepartId: { not: null } },
    NOT_SILENT_WHERE,
    NOT_OPNAME_WHERE,
  ];

  if (params.kategori === 'Maintenance') {
    andConditions.push({
      OR: [
        { kategoriOut: 'Maintenance' },
        { kategoriOut: 'Maintenance Produksi' },
        { keterangan: { contains: '[Mesin:' } },
        { noReport: { not: null } },
      ],
    });
  }

  if (params.dateLimit) {
    andConditions.push({ tanggal: { gte: params.dateLimit } });
  }

  return { AND: andConditions };
}

/**
 * Compute total IN, total OUT (via `Math.abs`), and net stock from movements.
 */
export function computeMovementStockTotals(
  movements: StockMovementLike[],
  options?: { excludeHistoriSheets?: boolean }
): { totalIn: number; totalOut: number; netStock: number } {
  const excludeHistori = options?.excludeHistoriSheets !== false;
  let totalIn = 0;
  let totalOut = 0;

  for (const m of movements) {
    if (excludeHistori && m.purchaseType === 'histori-sheets') continue;
    if (m.tipe === 'IN') totalIn += m.qty;
    else if (m.tipe === 'OUT') totalOut += Math.abs(m.qty);
  }

  return {
    totalIn,
    totalOut,
    netStock: totalIn - totalOut,
  };
}

/**
 * Canonical MTC sparepart stock calculation shared by stock list, master, opname,
 * trend, classification, and dashboard views.
 */
export function computeSparepartCurrentStock(params: {
  tipeUkur?: string | null;
  movements?: StockMovementLike[];
  potonganFisiks?: PotonganFisikLike[];
  excludeHistoriSheets?: boolean;
}): number {
  if (params.tipeUkur === 'bulk') {
    return (params.potonganFisiks ?? []).reduce((sum, p) => sum + p.panjangSisa, 0);
  }
  return computeMovementStockTotals(params.movements ?? [], {
    excludeHistoriSheets: params.excludeHistoriSheets,
  }).netStock;
}

/**
 * Guard against accidental `[SILENT] Penyesuaian Stok Master` writes when saving
 * unrelated fields in the Master Sparepart modal or editing a `bulk` item.
 */
export function shouldSendSilentStockAdjustment(
  tipeUkur: string | null | undefined,
  initialStock: unknown,
  nextStock: unknown
): boolean {
  if (tipeUkur === 'bulk') return false;
  if (initialStock === undefined || initialStock === null || String(initialStock).trim() === '') {
    return false;
  }
  if (nextStock === undefined || nextStock === null || String(nextStock).trim() === '') {
    return false;
  }
  const parsedNext = Number(nextStock);
  const parsedInitial = Number(initialStock);
  if (Number.isNaN(parsedNext) || Number.isNaN(parsedInitial)) return false;
  return Math.round(parsedNext) !== Math.round(parsedInitial);
}
