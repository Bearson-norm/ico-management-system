import { prisma } from '../lib/prisma';

async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      nomorPr: 'PR04196'
    },
    select: {
      id: true,
      originalName: true,
      nomorPo: true,
      vendor: true,
      qty: true,
      statusPo: true,
      harga: true
    }
  });
  console.log("PR04196 Items:");
  console.table(items);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
