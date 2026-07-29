import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== DRY-RUN PEMBERSIHAN DUPLIKAT PROCUREMENT TRACKING ===');

    const allItems = await mtc.procurementTracking.findMany({
      orderBy: [
        { nomorPr: 'asc' },
        { id: 'asc' }
      ]
    });

    console.log(`Total awal baris: ${allItems.length}`);

    // Group items by (nomorPr, originalName, nomorPo)
    const groups: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      if (!item.nomorPr) continue; // Skip items without PR
      const key = `${item.nomorPr.trim()}___${item.originalName.toLowerCase().trim()}___${(item.nomorPo || '').trim()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    let itemsToDelete: number[] = [];

    for (const [key, list] of Object.entries(groups)) {
      if (list.length <= 1) continue;

      // We have duplicate items for the same PR + Name + PO!
      // Strategy to select the "Keeper":
      // 1. Prefer item with statusPo === 'DONE' or highest qty
      // 2. Prefer item with sheetId or older ID
      const sorted = [...list].sort((a, b) => {
        // Priority 1: statusPo === 'DONE'
        if (a.statusPo === 'DONE' && b.statusPo !== 'DONE') return -1;
        if (b.statusPo === 'DONE' && a.statusPo !== 'DONE') return 1;

        // Priority 2: sheetId != null
        if (a.sheetId != null && b.sheetId == null) return -1;
        if (b.sheetId != null && a.sheetId == null) return 1;

        // Priority 3: Larger ID (more recent update)
        return b.id - a.id;
      });

      const keeper = sorted[0];
      const duplicates = sorted.slice(1);

      duplicates.forEach(dup => {
        itemsToDelete.push(dup.id);
      });
    }

    console.log(`Ditemukan ${itemsToDelete.length} baris duplikat yang dapat dibersihkan!`);
    console.log(`Total baris setelah pembersihan: ${allItems.length - itemsToDelete.length}`);

  } catch (e) {
    console.error('Error in dry run:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
