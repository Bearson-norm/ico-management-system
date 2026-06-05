import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.procurementTracking.count();
    console.log(`Jumlah record di procurement_tracking: ${count}`);

    const items = await prisma.procurementTracking.findMany({
      where: {
        nomorPr: { in: ['PR03593', 'PR03388', 'PR04017'] }
      },
      select: {
        id: true,
        originalName: true,
        nomorPr: true,
        nomorPo: true,
        tanggalList: true,
        tanggalTerima: true,
        etaFoom: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    console.log('Detail item PR yang dicari:');
    console.log(JSON.stringify(items, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
