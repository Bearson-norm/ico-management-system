import { prisma } from '../lib/prisma';

async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      nomorPr: 'PR03773'
    },
    select: {
      id: true,
      originalName: true,
      nomorPo: true,
      vendor: true,
      qty: true,
      statusPo: true,
      tanggalTerima: true,
      linkGr: true,
      harga: true
    }
  });
  console.log("PR03773 Items:");
  console.table(items);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
