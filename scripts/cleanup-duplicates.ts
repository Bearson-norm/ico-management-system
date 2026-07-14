import { PrismaClient as MtcPrismaClient } from '../lib/generated/mtc';
import { PrismaClient as GaPrismaClient } from '../lib/generated/ga';

async function cleanupMtc() {
  const prisma = new MtcPrismaClient();
  try {
    console.log("=== RUNNING MTC CLEANUP ===");
    const allItems = await prisma.procurementTracking.findMany({
      include: { sparepart: true }
    });

    console.log(`Total MTC items in database: ${allItems.length}`);

    const groups: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      const docNo = item.nomorPo?.trim() || item.nomorPr?.trim() || 'DRAFT';
      const nameKey = item.originalName.trim().toLowerCase();
      const key = `${docNo}:::${nameKey}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }

    const toDeleteIds: number[] = [];
    let duplicateCount = 0;

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      if (group.length > 1) {
        duplicateCount++;
        console.log(`\nDuplicate Group: "${key}" (Count: ${group.length})`);
        
        const sorted = [...group].sort((a, b) => {
          const aLinked = a.sparepartId ? 1 : 0;
          const bLinked = b.sparepartId ? 1 : 0;
          if (aLinked !== bLinked) return bLinked - aLinked;

          const aDone = a.statusPo === 'DONE' ? 1 : 0;
          const bDone = b.statusPo === 'DONE' ? 1 : 0;
          if (aDone !== bDone) return bDone - aDone;

          return a.id - b.id;
        });

        const keepItem = sorted[0];
        const deleteItems = sorted.slice(1);

        console.log(`  KEEP: ID ${keepItem.id} | Qty: ${keepItem.qty} | Price: ${keepItem.harga} | Linked: ${keepItem.sparepartId || 'No'}`);
        deleteItems.forEach(item => {
          console.log(`  DELETE: ID ${item.id} | Qty: ${item.qty} | Price: ${item.harga} | Linked: ${item.sparepartId || 'No'}`);
          toDeleteIds.push(item.id);
        });
      }
    }

    console.log(`\nFound ${duplicateCount} MTC duplicate groups.`);
    console.log(`Total MTC duplicate records to delete: ${toDeleteIds.length}`);

    if (toDeleteIds.length > 0) {
      const deleted = await prisma.procurementTracking.deleteMany({
        where: { id: { in: toDeleteIds } }
      });
      console.log(`Successfully deleted ${deleted.count} duplicate MTC records!`);
    } else {
      console.log("No MTC duplicates found to delete.");
    }
  } catch (err) {
    console.error("Error during MTC cleanup:", err);
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupGa() {
  const prisma = new GaPrismaClient();
  try {
    console.log("\n=== RUNNING GA CLEANUP ===");
    const allItems = await prisma.gaProcurementTracking.findMany({
      include: { item: true }
    });

    console.log(`Total GA items in database: ${allItems.length}`);

    const groups: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      const docNo = item.nomorPo?.trim() || item.nomorPr?.trim() || 'DRAFT';
      const nameKey = item.originalName.trim().toLowerCase();
      const key = `${docNo}:::${nameKey}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }

    const toDeleteIds: number[] = [];
    let duplicateCount = 0;

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      if (group.length > 1) {
        duplicateCount++;
        console.log(`\nDuplicate Group: "${key}" (Count: ${group.length})`);
        
        const sorted = [...group].sort((a, b) => {
          const aLinked = a.itemId ? 1 : 0;
          const bLinked = b.itemId ? 1 : 0;
          if (aLinked !== bLinked) return bLinked - aLinked;

          const aDone = a.status === 'RECEIVED' || a.grDone ? 1 : 0;
          const bDone = b.status === 'RECEIVED' || b.grDone ? 1 : 0;
          if (aDone !== bDone) return bDone - aDone;

          return a.id - b.id;
        });

        const keepItem = sorted[0];
        const deleteItems = sorted.slice(1);

        console.log(`  KEEP: ID ${keepItem.id} | Qty: ${keepItem.qty} | Price: ${keepItem.harga} | Linked: ${keepItem.itemId || 'No'}`);
        deleteItems.forEach(item => {
          console.log(`  DELETE: ID ${item.id} | Qty: ${item.qty} | Price: ${item.harga} | Linked: ${item.itemId || 'No'}`);
          toDeleteIds.push(item.id);
        });
      }
    }

    console.log(`\nFound ${duplicateCount} GA duplicate groups.`);
    console.log(`Total GA duplicate records to delete: ${toDeleteIds.length}`);

    if (toDeleteIds.length > 0) {
      const deleted = await prisma.gaProcurementTracking.deleteMany({
        where: { id: { in: toDeleteIds } }
      });
      console.log(`Successfully deleted ${deleted.count} duplicate GA records!`);
    } else {
      console.log("No GA duplicates found to delete.");
    }
  } catch (err) {
    console.error("Error during GA cleanup:", err);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await cleanupMtc();
  await cleanupGa();
}

main();
