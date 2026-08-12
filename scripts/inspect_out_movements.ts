import { prisma } from '../lib/prisma';

async function main() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const movements = await prisma.stockMovement.findMany({
    where: {
      tipe: 'OUT',
      tanggal: { gte: thirtyDaysAgo }
    },
    select: {
      id: true,
      sparepartId: true,
      namaItem: true,
      qty: true,
      purchaseType: true,
      keterangan: true,
      noReport: true,
      createdAt: true,
    },
    orderBy: { qty: 'desc' },
    take: 20
  });

  console.log("Top 20 OUT movements in last 30 days:");
  movements.forEach(m => {
    console.log(`[${m.sparepartId}] ${m.namaItem} | Qty: ${m.qty} | PType: ${m.purchaseType || 'NULL'} | NoReport: ${m.noReport || 'NULL'} | Ket: ${m.keterangan || '-'}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
