import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    const items = await mtc.procurementTracking.findMany({
      where: {
        originalName: { contains: '4.6x400', mode: 'insensitive' }
      },
      orderBy: { id: 'asc' }
    });

    console.log(`Found ${items.length} items with '4.6x400':`);
    items.forEach((item, idx) => {
      console.log(`${idx + 1}. [ID:${item.id}] PR: ${item.nomorPr} | PO: ${item.nomorPo} | Name: "${item.originalName}" | Qty: ${item.qty} | Harga: Rp ${item.harga} | StatusPO: ${item.statusPo}`);
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
