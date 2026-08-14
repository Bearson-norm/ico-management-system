const { PrismaClient } = require('../lib/generated/mtc/index.js');
const prisma = new PrismaClient();

async function main() {
  const prs = ['PR04566', 'PR03381', 'PR02337', 'PR00948', 'PR00198'];
  const items = await prisma.procurementTracking.findMany({
    where: { nomorPr: { in: prs } },
    include: { sparepart: true }
  });
  console.log(`Found ${items.length} items in DB:`);
  for (const item of items) {
    console.log(JSON.stringify({
      id: item.id,
      nomorPr: item.nomorPr,
      nomorPo: item.nomorPo,
      originalName: item.originalName,
      statusPr: item.statusPr,
      statusPo: item.statusPo,
      tanggalTerima: item.tanggalTerima,
      linkGr: item.linkGr,
      linkReferences: item.linkReferences
    }, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
