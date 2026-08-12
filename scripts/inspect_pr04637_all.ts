import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      OR: [
        { nomorPr: 'PR04637' },
        { nomorPr: 'PR04566' },
        { nomorPr: 'PR04569' }
      ]
    },
    include: { sparepart: true }
  });

  console.log(`\nFound ${items.length} items for PR04637, PR04566, PR04569:`);
  for (const item of items) {
    console.log({
      id: item.id,
      nomorPr: item.nomorPr,
      nomorPo: item.nomorPo,
      originalName: item.originalName,
      qty: item.qty,
      sparepartNama: item.sparepart?.nama || null,
      statusPo: item.statusPo
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
