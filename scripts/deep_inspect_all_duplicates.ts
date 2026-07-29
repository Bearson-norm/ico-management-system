import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== DEEP INSPECTING ALL PATTERNS OF DUPLICATES IN MTC DB ===');

    const all = await mtc.procurementTracking.findMany({
      orderBy: { id: 'asc' }
    });

    console.log(`Total active rows in procurementTracking: ${all.length}`);

    // Pattern 1: Same PR + Same Normalized Name
    const prNameMap = new Map<string, typeof all>();
    for (const item of all) {
      if (!item.nomorPr) continue;
      const key = `${item.nomorPr.trim().toUpperCase()}||${normalizeName(item.originalName)}`;
      if (!prNameMap.has(key)) prNameMap.set(key, []);
      prNameMap.get(key)!.push(item);
    }

    const prNameDupes = Array.from(prNameMap.entries()).filter(([_, list]) => list.length > 1);
    console.log(`\n1. Same PR + Normalized Name Duplicates: ${prNameDupes.length} groups`);
    prNameDupes.slice(0, 10).forEach(([key, list]) => {
      console.log(`   Key: ${key}`);
      list.forEach(i => console.log(`     - [ID:${i.id}] PO:${i.nomorPo} | Qty:${i.qty} | Harga:${i.harga} | SheetId:${i.sheetId || 'N/A'}`));
    });

    // Pattern 2: Same PO + Same Normalized Name
    const poNameMap = new Map<string, typeof all>();
    for (const item of all) {
      if (!item.nomorPo) continue;
      const key = `${item.nomorPo.trim().toUpperCase()}||${normalizeName(item.originalName)}`;
      if (!poNameMap.has(key)) poNameMap.set(key, []);
      poNameMap.get(key)!.push(item);
    }

    const poNameDupes = Array.from(poNameMap.entries()).filter(([_, list]) => list.length > 1);
    console.log(`\n2. Same PO + Normalized Name Duplicates: ${poNameDupes.length} groups`);
    poNameDupes.slice(0, 10).forEach(([key, list]) => {
      console.log(`   Key: ${key}`);
      list.forEach(i => console.log(`     - [ID:${i.id}] PR:${i.nomorPr} | Qty:${i.qty} | Harga:${i.harga} | SheetId:${i.sheetId || 'N/A'}`));
    });

    // Pattern 3: PR with multiple rows where one has sheetId (Google Sheets) and one has PO (Odoo)
    const prGroupMap = new Map<string, typeof all>();
    for (const item of all) {
      if (!item.nomorPr) continue;
      const prKey = item.nomorPr.trim().toUpperCase();
      if (!prGroupMap.has(prKey)) prGroupMap.set(prKey, []);
      prGroupMap.get(prKey)!.push(item);
    }

    let unmergedSheetOdooCount = 0;
    const unmergedGroups: { prKey: string; list: typeof all }[] = [];

    for (const [prKey, list] of prGroupMap.entries()) {
      if (list.length > 1) {
        const sheetRows = list.filter(i => i.sheetId != null || i.fbIndex != null);
        const odooOnlyRows = list.filter(i => i.nomorPo != null && i.sheetId == null);
        if (sheetRows.length > 0 && odooOnlyRows.length > 0) {
          unmergedSheetOdooCount++;
          unmergedGroups.push({ prKey, list });
        }
      }
    }

    console.log(`\n3. PRs with separate Google Sheets Row AND Odoo Row (Unmerged): ${unmergedSheetOdooCount} PR groups`);
    unmergedGroups.slice(0, 10).forEach(({ prKey, list }) => {
      console.log(`   PR: ${prKey} (${list.length} total rows):`);
      list.forEach(i => {
        console.log(`     - [ID:${i.id}] Name: "${i.originalName}" | PO: ${i.nomorPo} | Qty: ${i.qty} | SheetId: ${i.sheetId || 'N/A'}`);
      });
    });

    // Pattern 4: Duplicate rows with exact same originalName and statusPo == 'DONE'
    const doneNameMap = new Map<string, typeof all>();
    for (const item of all) {
      if (item.statusPo !== 'DONE') continue;
      const key = normalizeName(item.originalName);
      if (!doneNameMap.has(key)) doneNameMap.set(key, []);
      doneNameMap.get(key)!.push(item);
    }
    const doneDupes = Array.from(doneNameMap.entries()).filter(([_, list]) => list.length > 1);
    console.log(`\n4. Identical Completed (DONE) Items: ${doneDupes.length} groups`);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
