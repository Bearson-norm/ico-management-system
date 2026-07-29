import { prisma } from '../lib/prisma';

async function main() {
  // Delete item 1034
  await prisma.procurementTracking.deleteMany({
    where: {
      nomorPr: 'PR03773',
      id: { not: 730 }
    }
  });

  // Restore item 730
  await prisma.procurementTracking.update({
    where: { id: 730 },
    data: {
      qty: 10,
      statusPo: 'PO',
      tanggalTerima: null,
      linkGr: null
    }
  });

  console.log("PR03773 has been reset back to 1 item (qty 10, status PO)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
