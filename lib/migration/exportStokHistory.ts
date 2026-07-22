/**
 * exportStokHistory.ts
 * ────────────────────
 * Script untuk mengeksport seluruh data stock_movement dari DB ke file CSV
 * di folder exports/StokHistory_EXPORT_<timestamp>.csv.
 *
 * Kolom yang dihasilkan:
 * - No, Tanggal, Waktu, Tipe, ID Sparepart, Nama Item, Qty, Harga (Rp), PIC, No Report, Mesin, Jenis Pembelian, Vendor, Keterangan
 *
 * Cara pakai:
 *   npx ts-node -P tsconfig.scripts.json lib/migration/exportStokHistory.ts
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../generated/mtc';

const prisma = new PrismaClient();

async function main() {
  console.log('Mengeksport data stok history dari database...');

  const movements = await prisma.stockMovement.findMany({
    include: {
      sparepart: true,
      pic: true,
      report: { include: { mesin: true } },
    },
    orderBy: { tanggal: 'desc' },
  });

  console.log(`Ditemukan ${movements.length} transaksi stock movement.`);

  const header = [
    'No',
    'Tanggal',
    'Waktu',
    'Tipe',
    'ID Sparepart',
    'Nama Item',
    'Qty',
    'Harga (Rp)',
    'PIC',
    'No Report',
    'Mesin',
    'Jenis Pembelian',
    'Vendor',
    'Keterangan',
  ].join(',');

  const rows = movements.map((d, i) => {
    let mesinNama = d.report?.mesin?.nama ?? '';
    if (!mesinNama && d.keterangan) {
      const match = d.keterangan.match(/\[Mesin:\s*([^\]]+)\]/i);
      if (match) mesinNama = match[1].trim();
    }

    const tgl = new Date(d.tanggal).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    const wkt = new Date(d.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

    const escapeCsv = (val: string | number | null | undefined) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return [
      i + 1,
      escapeCsv(tgl),
      escapeCsv(wkt),
      escapeCsv(d.tipe),
      escapeCsv(d.sparepartId),
      escapeCsv(d.sparepart?.nama ?? d.namaItem),
      d.qty,
      d.harga ? Number(d.harga) : 0,
      escapeCsv(d.pic?.nama),
      escapeCsv(d.noReport),
      escapeCsv(mesinNama),
      escapeCsv(d.purchaseType),
      escapeCsv(d.vendor),
      escapeCsv(d.keterangan),
    ].join(',');
  });

  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const nowStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const outPath = path.join(exportDir, `StokHistory_EXPORT_${nowStr}.csv`);

  const content = '\uFEFF' + [header, ...rows].join('\n');
  fs.writeFileSync(outPath, content, 'utf8');

  console.log(`✅ Export berhasil disimpah ke: ${outPath}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Export gagal:', e);
  prisma.$disconnect();
  process.exit(1);
});
