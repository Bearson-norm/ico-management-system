import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    const todayItems = await prisma.procurementTracking.findMany({
      where: {
        createdAt: {
          gte: new Date('2026-06-06T00:00:00.000Z')
        }
      }
    });
    console.log(`Ditemukan ${todayItems.length} item yang dibuat setelah 2026-06-06:`);
    console.log(JSON.stringify(todayItems, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
