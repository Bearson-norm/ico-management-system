import { prisma } from '../lib/prisma';

async function main() {
  const records = await prisma.procurementTracking.findMany({
    where: {
      nomorPr: 'PR04111'
    },
    select: {
      id: true,
      nomorPr: true,
      nomorPo: true,
      odooNotes: true
    }
  });

  for (const r of records) {
    console.log(`[PR: ${r.nomorPr}] PO: ${r.nomorPo}`);
    console.log(`  Notes: ${r.odooNotes}`);
  }
}

main().catch(console.error);
