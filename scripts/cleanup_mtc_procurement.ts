import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

const NON_MTC_KEYWORDS = [
  'lollipop', 'lolipop', 'neon box', 'vapestore', 'vape store', 'wus vape', 'montir vape',
  'media placement', 'sponsorship', 'marketing supplies', 'promo', 'billboard', 'booth',
  'event', 'influencer', 'endorse', 'branding', 'flyer', 'brosur', 'banner'
];

function isNonMtcItem(name: string | null | undefined, keterangan: string | null | undefined): boolean {
  const combined = `${name || ''} ${keterangan || ''}`.toLowerCase();
  return NON_MTC_KEYWORDS.some(k => combined.includes(k));
}

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== AUDIT KATEGORI & DUPLIKAT PROCUREMENT TRACKING MTC ===');

    const totalBefore = await mtc.procurementTracking.count();
    console.log(`Total awal seluruh baris: ${totalBefore}`);

    const allItems = await mtc.procurementTracking.findMany();

    // 1. Identify non-MTC marketing/store items
    const nonMtcItems = allItems.filter(i => isNonMtcItem(i.originalName, i.keterangan));
    console.log(`Ditemukan ${nonMtcItems.length} baris non-MTC (Marketing/Store/Promo) yang akan dibersihkan dari MTC.`);

    // 2. Identify exact duplicates per (nomorPr, originalName, nomorPo)
    const prMap: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      if (isNonMtcItem(item.originalName, item.keterangan)) continue; // skip non-MTC
      const key = `${(item.nomorPr || 'NO_PR').trim()}___${item.originalName.toLowerCase().trim()}___${(item.nomorPo || '').trim()}`;
      if (!prMap[key]) prMap[key] = [];
      prMap[key].push(item);
    }

    const duplicateIds: number[] = [];
    for (const [key, list] of Object.entries(prMap)) {
      if (list.length <= 1) continue;

      // Keep 1 best record
      const sorted = [...list].sort((a, b) => {
        if (a.statusPo === 'DONE' && b.statusPo !== 'DONE') return -1;
        if (b.statusPo === 'DONE' && a.statusPo !== 'DONE') return 1;
        if (a.sheetId != null && b.sheetId == null) return -1;
        if (b.sheetId != null && a.sheetId == null) return 1;
        return b.id - a.id;
      });

      const duplicates = sorted.slice(1);
      duplicates.forEach(d => duplicateIds.push(d.id));
    }

    console.log(`Ditemukan ${duplicateIds.length} baris duplikat MTC yang akan dibersihkan.`);

    const nonMtcIds = nonMtcItems.map(i => i.id);
    const allIdsToDelete = Array.from(new Set([...nonMtcIds, ...duplicateIds]));

    console.log(`\nTotal baris yang akan dihapus: ${allIdsToDelete.length}`);
    console.log(`Total sisa baris MTC yang bersih & valid: ${totalBefore - allIdsToDelete.length}`);

    // Perform deletion
    if (allIdsToDelete.length > 0) {
      console.log('Menjalankan pembersihan database MTC...');
      const deleted = await mtc.procurementTracking.deleteMany({
        where: { id: { in: allIdsToDelete } }
      });
      console.log(`BERHASIL! Menghapus ${deleted.count} baris duplikat & non-MTC dari database MTC.`);
    }

  } catch (e) {
    console.error('Error during cleanup:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
