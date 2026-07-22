/**
 * migrateStokHistory.ts
 * ─────────────────────
 * Script untuk mengimport file CSV "StokHistory_SEMUA_*.csv" ke tabel
 * stock_movement di database MTC.
 *
 * Cara pakai:
 *   1. Salin file CSV ke folder  exports/  (nama apapun yang diawali "StokHistory")
 *   2. Jalankan salah satu dari:
 *        npx ts-node -P tsconfig.scripts.json lib/migration/migrateStokHistory.ts
 *        DRY_RUN=1 npx ts-node -P tsconfig.scripts.json lib/migration/migrateStokHistory.ts
 *
 * Opsi ENV:
 *   DRY_RUN=1          → Preview saja, tidak insert ke DB
 *   FLUSH_MOVEMENTS=1  → Hapus semua stock_movement sebelum import (HATI-HATI!)
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '../generated/mtc';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';
const FLUSH   = process.env.FLUSH_MOVEMENTS === '1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse tanggal dari format D/M/YYYY dan waktu HH.MM atau HH:MM
 */
function parseTanggalWaktu(
  tanggal: string | undefined,
  waktu: string | undefined,
): Date | null {
  if (!tanggal?.trim()) return null;

  const dMatch = tanggal.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dMatch) return null;

  const day   = parseInt(dMatch[1]);
  const month = parseInt(dMatch[2]) - 1;
  const year  = parseInt(dMatch[3]);

  let hour = 12, minute = 0;
  if (waktu?.trim()) {
    const tMatch = waktu.trim().match(/^(\d{1,2})[\.:](\d{2})$/);
    if (tMatch) {
      hour   = parseInt(tMatch[1]);
      minute = parseInt(tMatch[2]);
    }
  }

  const d = new Date(year, month, day, hour, minute, 0);
  return isNaN(d.getTime()) ? null : d;
}

function parseQty(raw: string | undefined): number {
  const n = parseInt((raw ?? '').replace(/[^\d-]/g, ''));
  return isNaN(n) ? 1 : Math.abs(n);
}

function parseHarga(raw: string | undefined): number {
  const cleaned = (raw ?? '').replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Mulai migrasi Stok History...');
  if (DRY_RUN) console.warn('⚠️  DRY_RUN aktif – tidak ada data yang akan disimpan ke DB.');

  const exportsDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) {
    console.error('❌ Folder "exports/" tidak ditemukan di root proyek.');
    process.exit(1);
  }

  // Cari file CSV yang namanya diawali "StokHistory" (case-insensitive)
  const files = fs.readdirSync(exportsDir).filter(
    f => f.toLowerCase().startsWith('stokhistory') && f.toLowerCase().endsWith('.csv'),
  );

  if (files.length === 0) {
    console.error(
      '❌ Tidak ada file CSV ditemukan di exports/.\n' +
      '   Salin file CSV ke: exports/StokHistory_SEMUA.csv (nama apapun yang diawali "StokHistory")',
    );
    process.exit(1);
  }

  const filePath = path.join(exportsDir, files[0]);
  console.log(`📂 Membaca file: ${files[0]}`);

  const rawCsv = fs.readFileSync(filePath, 'utf-8');

  // Parse CSV – relax_quotes untuk vendor dengan koma
  const records = parse(rawCsv, {
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as string[][];

  if (records.length < 2) {
    console.error('❌ CSV kosong atau hanya berisi header.');
    process.exit(1);
  }

  const header = records[0];
  console.log(`📋 Header   : ${header.join(' | ')}`);

  // Format kolom CSV (0-indexed):
  // 0=No | 1=Tanggal | 2=Waktu | 3=Tipe | 4=ID Sparepart | 5=Nama Item
  // 6=Qty | 7=Harga (Rp) | 8=PIC | 9=No Report | 10=Jenis Pembelian | 11=Vendor | 12=Keterangan

  const dataRows = records.slice(1);
  console.log(`📊 Total baris: ${dataRows.length}`);

  // ── Prefetch master data ──────────────────────────────────────────────────

  const allTeknisi = await prisma.teknisi.findMany({ select: { id: true, nama: true } });
  const teknisiMap = new Map<string, number>(
    allTeknisi.map(t => [t.nama.toLowerCase().trim(), t.id]),
  );

  const allSpareparts = await prisma.sparepart.findMany({ select: { id: true } });
  const sparepartSet  = new Set<string>(allSpareparts.map(s => s.id));

  // ── Flush jika diminta ────────────────────────────────────────────────────

  if (FLUSH && !DRY_RUN) {
    console.warn('🗑️  FLUSH_MOVEMENTS aktif: menghapus semua stock_movement...');
    const deleted = await prisma.stockMovement.deleteMany({});
    console.log(`   Dihapus: ${deleted.count} record.`);
  }

  // ── Deduplication: bangun set key dari data existing ─────────────────────

  const existingMovements = await prisma.stockMovement.findMany({
    select: { tipe: true, sparepartId: true, namaItem: true, qty: true, tanggal: true },
  });

  const buildKey = (
    tipe: string,
    sparepartId: string | null,
    namaItem: string | null,
    qty: number,
    tanggal: Date,
  ): string => {
    const tKey = `${tanggal.getFullYear()}-${tanggal.getMonth()}-${tanggal.getDate()}-${tanggal.getHours()}-${tanggal.getMinutes()}`;
    return `${tipe}|${sparepartId ?? ''}|${(namaItem ?? '').toLowerCase()}|${qty}|${tKey}`;
  };

  const existingKeys = new Set<string>(
    existingMovements
      .filter(m => m.tanggal != null)
      .map(m =>
        buildKey(m.tipe, m.sparepartId, m.namaItem, m.qty, new Date(m.tanggal!)),
      ),
  );

  // ── Proses baris satu per satu ────────────────────────────────────────────

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;
  const newTeknisiCreated: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row    = dataRows[i];
    const rowNum = i + 2; // nomor baris di file (header = baris 1)

    try {
      if (row.length < 6 || !row[1]?.trim()) { skipped++; continue; }

      const tipe         = (row[3] ?? '').trim().toUpperCase();
      const sparepartId  = (row[4] ?? '').trim() || null;
      const namaItem     = (row[5] ?? '').trim() || null;
      const qty          = parseQty(row[6]);
      const harga        = parseHarga(row[7]);
      const picRaw       = (row[8] ?? '').trim() || null;
      const noReport     = (row[9] ?? '').trim() || null;
      const purchaseType = (row[10] ?? '').trim() || null;
      const vendor       = (row[11] ?? '').trim() || null;
      const keterangan   = (row[12] ?? '').trim() || null;
      const tanggal      = parseTanggalWaktu(row[1], row[2]);

      // Validasi tipe
      if (!['IN', 'OUT', 'LOG'].includes(tipe)) {
        console.warn(`  ⚠️  Baris ${rowNum}: Tipe tidak dikenal "${tipe}", dilewati.`);
        skipped++;
        continue;
      }

      // Validasi tanggal
      if (!tanggal) {
        console.warn(`  ⚠️  Baris ${rowNum}: Tanggal tidak valid "${row[1]}", dilewati.`);
        skipped++;
        continue;
      }

      // Resolve sparepartId ke master (jika tidak ditemukan, tetap import tanpa link)
      const resolvedSparepartId =
        sparepartId && sparepartSet.has(sparepartId) ? sparepartId : null;

      if (sparepartId && !resolvedSparepartId) {
        console.warn(
          `  ⚠️  Baris ${rowNum}: Sparepart ID "${sparepartId}" tidak ada di master → ` +
          `diimport sebagai namaItem saja.`,
        );
      }

      // Resolve PIC → Teknisi (auto-create jika belum ada)
      let picId: number | null = null;
      if (picRaw) {
        const key = picRaw.toLowerCase();
        if (teknisiMap.has(key)) {
          picId = teknisiMap.get(key)!;
        } else if (!DRY_RUN) {
          const newT = await prisma.teknisi.create({ data: { nama: picRaw } });
          teknisiMap.set(key, newT.id);
          picId = newT.id;
          newTeknisiCreated.push(picRaw);
          console.log(`  ➕ Teknisi baru: "${picRaw}"`);
        } else {
          console.log(`  [DRY] Akan membuat teknisi baru: "${picRaw}"`);
        }
      }

      // Cek duplikat
      const dedupKey = buildKey(tipe, resolvedSparepartId, namaItem, qty, tanggal);
      if (existingKeys.has(dedupKey)) {
        skipped++;
        continue;
      }

      if (!DRY_RUN) {
        await prisma.stockMovement.create({
          data: {
            tipe,
            sparepartId: resolvedSparepartId,
            namaItem,
            qty,
            harga,
            picId,
            noReport: noReport || null,
            purchaseType,
            vendor,
            keterangan,
            tanggal,
          },
        });
        existingKeys.add(dedupKey);
      } else {
        console.log(
          `  [DRY] ${tipe} | ${resolvedSparepartId ?? namaItem ?? '-'} | qty=${qty} | harga=${harga} | ${tanggal.toISOString()}`,
        );
      }

      inserted++;
    } catch (e: any) {
      console.error(`  ❌ Baris ${rowNum} error: ${e.message}`);
      errors++;
    }
  }

  // ── Ringkasan ─────────────────────────────────────────────────────────────

  console.log('\n════════════════════════════════════════');
  console.log('✅ Migrasi Stok History Selesai!');
  console.log(`   ✔ Diinsert  : ${inserted} record`);
  console.log(`   ⏭ Dilewati  : ${skipped} baris (duplikat / tidak valid)`);
  if (errors > 0) console.log(`   ❌ Error     : ${errors} baris`);
  if (newTeknisiCreated.length > 0)
    console.log(`   ➕ Teknisi baru dibuat: ${newTeknisiCreated.join(', ')}`);
  if (DRY_RUN)
    console.log('\n⚠️  DRY_RUN: Tidak ada data yang benar-benar disimpan ke DB.');
  console.log('════════════════════════════════════════');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
