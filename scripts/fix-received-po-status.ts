import { PrismaClient } from '../lib/generated/mtc';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Mulai memperbaiki status sparepart yang sudah diterima...');

    const activePurchasingSpareparts = await prisma.sparepart.findMany({
      where: {
        purchasingStatus: { not: 'NONE' }
      },
      select: {
        id: true,
        nama: true,
        purchasingStatus: true,
        purchasingNoPo: true,
        purchasingNoPr: true,
      }
    });

    console.log(`Ditemukan ${activePurchasingSpareparts.length} sparepart dengan status bukan 'NONE' di database:`);
    console.log(JSON.stringify(activePurchasingSpareparts, null, 2));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
