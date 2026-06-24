import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    const spareparts = await prisma.sparepart.findMany({
      select: {
        id: true,
        nama: true,
        lokasi: true,
      }
    });
    console.log('List of Spareparts in MTC Database:');
    console.log(JSON.stringify(spareparts, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
