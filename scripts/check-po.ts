import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    const items = await prisma.procurementTracking.findMany({
      where: {
        OR: [
          { nomorPo: 'P13732' },
          { nomorPr: 'PR04104' }
        ]
      },
      include: {
        sparepart: true
      }
    });
    console.log('--- Procurement Tracking Items ---');
    console.log(JSON.stringify(items, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
