import { prisma } from '../lib/prisma';

async function main() {
  const allOuts = await prisma.stockMovement.findMany({
    where: { tipe: 'OUT' },
    select: {
      id: true,
      sparepartId: true,
      namaItem: true,
      qty: true,
      tanggal: true,
      purchaseType: true,
      keterangan: true,
      noReport: true,
    },
    orderBy: { qty: 'desc' },
    take: 30
  });

  console.log(`Total OUT movements in DB: ${await prisma.stockMovement.count({ where: { tipe: 'OUT' } })}`);
  console.log("Top 30 OUT movements overall:");
  allOuts.forEach(m => {
    console.log(`[${m.sparepartId}] ${m.namaItem} | Qty: ${m.qty} | Date: ${m.tanggal.toISOString().split('T')[0]} | PType: ${m.purchaseType || 'NULL'} | Ket: ${m.keterangan || '-'}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
