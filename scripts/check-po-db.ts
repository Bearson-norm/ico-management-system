import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    const item = await prisma.procurementTracking.findFirst({
      where: {
        nomorPo: 'P12989'
      }
    });
    console.log("=== DB RECORD FOR P12989 ===");
    console.log(JSON.stringify(item, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
