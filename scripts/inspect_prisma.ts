import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function main() {
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();

  try {
    console.log('=== MTC PROCUREMENT TRACKING (20 ITEMS TERBARU) ===');
    const mtcItems = await mtc.procurementTracking.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { sparepart: true }
    });

    console.log(`Total ditemukan: ${mtcItems.length} baris di MTC.`);
    mtcItems.forEach((item, idx) => {
      console.log(`${idx + 1}. [ID:${item.id}] ${item.originalName}`);
      console.log(`   PR: ${item.nomorPr || '-'} | PO: ${item.nomorPo || '-'} | Status PR: ${item.statusPr} | Status PO: ${item.statusPo || '-'}`);
      console.log(`   Vendor: ${item.vendor || '-'} | Harga: Rp ${item.harga} | SheetId: ${item.sheetId || '-'}`);
      console.log(`   Link Ref: ${item.linkReferences || '-'}`);
      console.log(`   Odoo Chatter Notes: ${item.odooNotes ? 'Ada (' + item.odooNotes.length + ' karakter)' : 'Kosong'}`);
      console.log('---');
    });

    console.log('\n=== GA PROCUREMENT TRACKING (20 ITEMS TERBARU) ===');
    const gaItems = await ga.gaProcurementTracking.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { item: true }
    });

    console.log(`Total ditemukan: ${gaItems.length} baris di GA.`);
    gaItems.forEach((item, idx) => {
      console.log(`${idx + 1}. [ID:${item.id}] ${item.originalName}`);
      console.log(`   PR: ${item.nomorPr || '-'} | PO: ${item.nomorPo || '-'} | Status: ${item.status} | GR Done: ${item.grDone}`);
      console.log(`   Vendor: ${item.vendor || '-'} | Harga: Rp ${item.harga}`);
      console.log('---');
    });

    // Check count of items per status in MTC
    const mtcPrStats = await mtc.procurementTracking.groupBy({
      by: ['statusPr'],
      _count: { id: true }
    });
    console.log('\n=== RINGKASAN STATUS PR MTC ===');
    console.table(mtcPrStats);

    const mtcPoStats = await mtc.procurementTracking.groupBy({
      by: ['statusPo'],
      _count: { id: true }
    });
    console.log('\n=== RINGKASAN STATUS PO MTC ===');
    console.table(mtcPoStats);

    // Check count of items per status in GA
    const gaStats = await ga.gaProcurementTracking.groupBy({
      by: ['status'],
      _count: { id: true }
    });
    console.log('\n=== RINGKASAN STATUS GA ===');
    console.table(gaStats);

  } catch (e: any) {
    console.error('Error querying Prisma DB:', e);
  } finally {
    await mtc.$disconnect();
    await ga.$disconnect();
  }
}

main();
