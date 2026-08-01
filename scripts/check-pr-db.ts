import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
const prisma = new MtcPrisma();

async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      OR: [
        { nomorPr: 'PR04625' },
        { nomorPo: 'P14544' }
      ]
    },
    select: {
      id: true,
      originalName: true,
      nomorPo: true,
      vendor: true,
      qty: true,
      statusPo: true,
      harga: true,
      linkGr: true,
      tanggalTerima: true
    }
  });
  console.log("PR04196 Items:");
  console.table(items);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
