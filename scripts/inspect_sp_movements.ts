import { prisma } from '../lib/prisma';

async function main() {
  const spIds = ['MTC-SP-015', 'MTC-SP-012', 'MTC-SP-307', 'MTC-SP-013'];

  for (const id of spIds) {
    const sp = await prisma.sparepart.findUnique({
      where: { id },
      select: { nama: true }
    });

    const movements = await prisma.stockMovement.findMany({
      where: { sparepartId: id, tipe: 'OUT' },
      select: {
        id: true,
        qty: true,
        tanggal: true,
        purchaseType: true,
        keterangan: true,
        noReport: true,
        createdAt: true
      },
      orderBy: { tanggal: 'desc' },
      take: 10
    });

    console.log(`\n=== Sparepart ${id}: ${sp?.nama} ===`);
    movements.forEach(m => {
      console.log(`  Date: ${m.tanggal.toISOString().split('T')[0]} | Qty: ${m.qty} | PType: ${m.purchaseType || 'NULL'} | NoReport: ${m.noReport || 'NULL'} | Ket: ${m.keterangan || '-'}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
