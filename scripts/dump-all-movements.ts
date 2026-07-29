import { PrismaClient } from '../lib/generated/mtc';
const prisma = new PrismaClient();

async function main() {
  // Hitung per tipe
  const counts = await prisma.stockMovement.groupBy({
    by: ['tipe'],
    _count: { _all: true },
    orderBy: { tipe: 'asc' },
  });

  console.log('\n=== JUMLAH PER TIPE ===');
  counts.forEach(c => console.log(`  ${c.tipe}: ${c._count._all} transaksi`));

  const total = await prisma.stockMovement.count();
  console.log(`  TOTAL: ${total}`);

  // Ambil semua termasuk LOG
  const rows = await prisma.stockMovement.findMany({
    orderBy: [{ tipe: 'asc' }, { createdAt: 'desc' }],
    include: { sparepart: { select: { nama: true } } },
  });

  console.log('\n=== SEMUA DATA (IN, OUT, LOG) ===');
  rows.forEach((r, i) => {
    const tgl = r.createdAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const nama = r.sparepart?.nama || r.namaItem || '(tanpa nama)';
    console.log(`${String(i + 1).padStart(4)}. [${r.tipe.padEnd(3)}] ${tgl.padEnd(26)} qty: ${String(r.qty).padStart(5)} | ${nama}`);
    if (r.keterangan) console.log(`        ↳ ${r.keterangan.substring(0, 100)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
