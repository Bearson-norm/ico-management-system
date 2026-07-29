import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.log('=== INSPECTING P09819 & PR02200 ROWS IN MTC DB ===');

    const items = await mtc.procurementTracking.findMany({
      where: {
        OR: [
          { nomorPo: 'P09819' },
          { nomorPr: 'PR02200' },
          { originalName: { contains: 'Kabel Tis', mode: 'insensitive' } }
        ]
      },
      orderBy: { id: 'asc' }
    });

    console.log(`Found ${items.length} rows for P09819 / Kabel Tis:`);
    items.forEach((item, idx) => {
      console.log(`${idx + 1}. [ID:${item.id}] PR: ${item.nomorPr} | PO: ${item.nomorPo}`);
      console.log(`   Name: "${item.originalName}"`);
      console.log(`   Qty: ${item.qty} | Harga: Rp ${item.harga} | StatusPR: ${item.statusPr} | StatusPO: ${item.statusPo}`);
      console.log(`   TanggalTerima: ${item.tanggalTerima || 'NULL'} | CreatedAt: ${item.createdAt}`);
      console.log('---');
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
