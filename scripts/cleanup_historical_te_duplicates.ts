import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== CLEANING UP HISTORICAL TE... REQUISITION DUPLICATES ===');

    // 1. Find all TE... items with null PO and status != DONE
    const teItems = await mtc.procurementTracking.findMany({
      where: {
        nomorPr: { startsWith: 'TE' },
        nomorPo: null,
      }
    });

    console.log(`Found ${teItems.length} old TE... requisition items without PO.`);

    // 2. Check if a newer PR... or PO... exists with the exact same originalName (or clean name)
    const toDeleteIds: number[] = [];

    for (const te of teItems) {
      const cleanName = te.originalName.toLowerCase().trim();
      const matchingPoItem = await mtc.procurementTracking.findFirst({
        where: {
          id: { not: te.id },
          originalName: { equals: te.originalName, mode: 'insensitive' },
          nomorPo: { not: null }
        }
      });

      if (matchingPoItem) {
        console.log(`TE Item [ID:${te.id}] "${te.originalName}" (PR:${te.nomorPr}) has PO Match [ID:${matchingPoItem.id}] (PO:${matchingPoItem.nomorPo}). Marking for cleanup.`);
        toDeleteIds.push(te.id);
      }
    }

    console.log(`Total TE items matching existing POs: ${toDeleteIds.length}`);

    if (toDeleteIds.length > 0) {
      const res = await mtc.procurementTracking.deleteMany({
        where: {
          id: { in: toDeleteIds }
        }
      });
      console.log(`Successfully deleted ${res.count} obsolete TE... duplicate items!`);
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
