import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    const items = await mtc.procurementTracking.findMany({
      where: {
        originalName: { contains: 'Kabel Tis', mode: 'insensitive' }
      },
      orderBy: { id: 'asc' }
    });

    console.log(`=== ALL KABEL TIS ITEMS IN DB (${items.length} items) ===`);
    items.forEach((item, idx) => {
      console.log(`${idx + 1}. [ID:${item.id}] PR: ${item.nomorPr} | PO: ${item.nomorPo} | Qty: ${item.qty} | Harga: Rp ${item.harga} | StatusPO: ${item.statusPo}`);
      console.log(`   FullName: "${item.originalName}"`);
      console.log('---');
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
