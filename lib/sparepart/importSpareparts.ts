import { parse } from 'csv-parse/sync';
import type { PrismaClient } from '../generated/mtc';
import type { SparepartWebMasterRow } from './masterCsv';
import { isWebSparepartMasterShape, recordToWebMasterRow } from './masterCsv';

export type UpsertSparepartWebResult = {
  upserted: number;
  skipped: number;
};

export type ImportSparepartCsvOptions = {
  /**
   * Hapus semua riwayat stok dan master sparepart dulu (data dummy / reset penuh sebelum impor).
   * User, mesin, kategori (termasuk kategori maintenance), laporan — tidak dihapus.
   */
  flush?: boolean;
};

/**
 * Hapus seluruh baris `stock_movement` lalu `sparepart` (termasuk tautan mesin–sparepart lewat CASCADE).
 */
export async function flushSparepartMasterData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.deleteMany();
    await tx.sparepart.deleteMany();
  });
}

/**
 * Upsert sparepart dari baris CSV master web ke tabel `sparepart` + relasi `kategori` (nama unik).
 */
export async function upsertSparepartsFromWebMaster(
  prisma: PrismaClient,
  rows: SparepartWebMasterRow[],
): Promise<UpsertSparepartWebResult> {
  const kats = await prisma.kategori.findMany();
  const katMap = new Map(kats.map((k) => [k.nama, k.id]));

  let upserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.id) {
      skipped++;
      continue;
    }

    let kategoriId: number | null = null;
    if (row.kategoriNama) {
      let kid = katMap.get(row.kategoriNama);
      if (kid == null) {
        const created = await prisma.kategori.create({
          data: { nama: row.kategoriNama, tipe: 'sparepart' },
        });
        kid = created.id;
        katMap.set(created.nama, created.id);
      }
      kategoriId = kid;
    }

    await prisma.sparepart.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        nama: row.nama || row.id,
        kategoriId,
        uom: row.uom || 'Pcs',
        lokasi: row.lokasi,
        harga: row.harga,
        minQty: row.minQty,
        maxLeadTime: row.maxLeadTime,
        avgLeadTime: row.avgLeadTime,
      },
      update: {
        nama: row.nama || row.id,
        kategoriId,
        uom: row.uom || 'Pcs',
        lokasi: row.lokasi,
        harga: row.harga,
        minQty: row.minQty,
        maxLeadTime: row.maxLeadTime,
        avgLeadTime: row.avgLeadTime,
      },
    });
    upserted++;
  }

  return { upserted, skipped };
}

/**
 * Parse isi file CSV lalu upsert. Mendeteksi format web (`id`,`nama`,`kategori`,...) vs tidak dikenal.
 */
export async function importSparepartCsvContent(
  prisma: PrismaClient,
  csvText: string,
  options?: ImportSparepartCsvOptions,
): Promise<UpsertSparepartWebResult & { format: 'web' | 'unknown'; flushed: boolean }> {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  if (!records.length || !isWebSparepartMasterShape(records[0])) {
    return { upserted: 0, skipped: records.length, format: 'unknown', flushed: false };
  }

  const rows: SparepartWebMasterRow[] = [];
  for (const row of records) {
    const r = recordToWebMasterRow(row);
    if (r) rows.push(r);
  }

  let flushed = false;
  if (options?.flush) {
    await flushSparepartMasterData(prisma);
    flushed = true;
  }

  const result = await upsertSparepartsFromWebMaster(prisma, rows);
  return { ...result, format: 'web', flushed };
}
