import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.procurementTracking.count();
    console.log(`Jumlah record di procurement_tracking: ${count}`);

    const items = await prisma.procurementTracking.findMany({
      take: 10,
      select: {
        id: true,
        originalName: true,
        harga: true,
        vendor: true,
        nomorPr: true,
      }
    });

    console.log('Daftar 10 item terbaru:');
    console.log(JSON.stringify(items, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
