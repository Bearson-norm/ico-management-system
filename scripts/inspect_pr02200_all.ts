import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    const items = await mtc.procurementTracking.findMany({
      where: {
        nomorPr: 'PR02200'
      },
      orderBy: { id: 'asc' }
    });

    console.log(`=== ALL ROWS FOR PR02200 (${items.length} rows) ===`);
    items.forEach((item, idx) => {
      console.log(`${idx + 1}. [ID:${item.id}] PO: ${item.nomorPo} | Name: "${item.originalName}" | Qty: ${item.qty} | Harga: ${item.harga} | StatusPO: ${item.statusPo}`);
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
