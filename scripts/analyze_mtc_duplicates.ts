import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== ANALISIS DUPLIKAT DI MTC PROCUREMENT TRACKING ===');

    // 1. Total count
    const totalCount = await mtc.procurementTracking.count();
    console.log(`Total seluruh baris procurementTracking: ${totalCount}`);

    // 2. Find duplicate (nomorPr, originalName) combinations
    const allItems = await mtc.procurementTracking.findMany({
      orderBy: { id: 'asc' }
    });

    const prMap: Record<string, any[]> = {};
    for (const item of allItems) {
      const key = `${item.nomorPr || 'NO_PR'}___${item.originalName.toLowerCase().trim()}`;
      if (!prMap[key]) prMap[key] = [];
      prMap[key].push(item);
    }

    const duplicateGroups = Object.entries(prMap).filter(([_, list]) => list.length > 1);
    console.log(`Jumlah kombinasi (nomorPr + originalName) yang DUPLIKAT: ${duplicateGroups.length} kelompok.`);

    console.log('\n--- SAMPEL 10 KELOMPOK DUPLIKAT ---');
    duplicateGroups.slice(0, 10).forEach(([key, list], idx) => {
      console.log(`\nKelompok #${idx + 1}: ${key}`);
      list.forEach(item => {
        console.log(`  - [ID:${item.id}] Qty: ${item.qty} | PR: ${item.nomorPr} | PO: ${item.nomorPo} | StatusPR: ${item.statusPr} | StatusPO: ${item.statusPo} | SheetId: ${item.sheetId || 'NULL'} | CreatedAt: ${item.createdAt}`);
      });
    });

    // 3. Count items created by Odoo sync vs Google Sheets vs Manual
    const sheetCount = allItems.filter(i => i.sheetId != null).length;
    const noSheetCount = allItems.filter(i => i.sheetId == null).length;
    console.log(`\nBaris dari Google Sheets (sheetId != null): ${sheetCount}`);
    console.log(`Baris dari Odoo Auto-Import / Manual (sheetId == null): ${noSheetCount}`);

    // 4. Duplicate PRs with exact same Qty and Name
    const exactDuplicates = Object.entries(prMap).filter(([_, list]) => {
      if (list.length < 2) return false;
      const firstQty = list[0].qty;
      return list.every(i => i.qty === firstQty);
    });
    console.log(`Kombinasi Duplikat Persis (PR + Nama + Qty sama): ${exactDuplicates.length} kelompok.`);

  } catch (e) {
    console.error('Error analyzing duplicates:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
