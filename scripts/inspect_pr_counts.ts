import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== DISTRIBUTION OF ITEMS IN PROCUREMENT TRACKING ===');

    const total = await mtc.procurementTracking.count();
    console.log(`Total rows: ${total}`);

    // Group by nomorPr
    const prGroups = await mtc.procurementTracking.groupBy({
      by: ['nomorPr'],
      _count: { id: true }
    });

    console.log(`Total unique PR numbers: ${prGroups.length}`);

    // Sort by count desc
    prGroups.sort((a, b) => b._count.id - a._count.id);

    console.log('\nTop 15 PR numbers with highest item counts:');
    prGroups.slice(0, 15).forEach(g => {
      console.log(`PR: ${g.nomorPr || 'NULL'} -> ${g._count.id} items`);
    });

    // Check items with NULL nomorPr
    const nullPrCount = await mtc.procurementTracking.count({
      where: { nomorPr: null }
    });
    console.log(`\nItems with NULL nomorPr: ${nullPrCount}`);

    // Check sample items for top PR
    const topPr = prGroups[0].nomorPr;
    if (topPr) {
      const sample = await mtc.procurementTracking.findMany({
        where: { nomorPr: topPr },
        take: 10
      });
      console.log(`\nSample items for top PR ${topPr}:`);
      sample.forEach(s => {
        console.log(`- [ID:${s.id}] Name: ${s.originalName} | Qty: ${s.qty} | PO: ${s.nomorPo} | StatusPR: ${s.statusPr} | StatusPO: ${s.statusPo}`);
      });
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
