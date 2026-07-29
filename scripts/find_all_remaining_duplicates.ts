import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    const all = await mtc.procurementTracking.findMany({
      select: {
        id: true,
        nomorPr: true,
        nomorPo: true,
        originalName: true,
        qty: true,
        harga: true,
        statusPr: true,
        statusPo: true,
        tanggalTerima: true,
      }
    });

    console.log(`Total procurement items in DB: ${all.length}`);

    // Group by (nomorPr + originalName)
    const map = new Map<string, typeof all>();
    for (const item of all) {
      if (!item.nomorPr) continue;
      const key = `${item.nomorPr.trim().toUpperCase()}||${item.originalName.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    const duplicates = Array.from(map.entries()).filter(([_, list]) => list.length > 1);

    console.log(`Found ${duplicates.length} duplicate group sets by (nomorPr + originalName):`);

    let totalDuplicateRows = 0;
    duplicates.slice(0, 15).forEach(([key, list]) => {
      console.log(`\nDuplicate Key: ${key} (${list.length} rows):`);
      list.forEach(i => {
        console.log(`  - [ID:${i.id}] PO: ${i.nomorPo} | Qty: ${i.qty} | Harga: ${i.harga} | StatusPO: ${i.statusPo} | Terima: ${i.tanggalTerima}`);
      });
      totalDuplicateRows += (list.length - 1);
    });

    console.log(`\nTotal redundant duplicate rows across all groups: ${totalDuplicateRows}`);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
