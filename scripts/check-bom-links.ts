import { PrismaClient } from '../lib/generated/mtc';

const prisma = new PrismaClient();

async function main() {
  const sps = await prisma.sparepart.findMany({
    include: { mesins: true },
  });

  const linked = sps.filter((s) => s.mesins.length > 0);
  console.log(`Total spareparts: ${sps.length}`);
  console.log(`Spareparts linked to machines: ${linked.length}`);

  linked.forEach((s) => {
    console.log(`• ${s.id} - ${s.nama}`);
    s.mesins.forEach((m) => {
      console.log(`   └─ Mesin ID ${m.id}: "${m.nama}" (Tipe: ${m.tipe})`);
    });
  });

  const mesins = await prisma.mesin.findMany({
    include: { spareparts: true },
  });

  console.log('\n=== REKAP MESIN & JUMLAH SPAREPART ===');
  mesins.forEach((m) => {
    if (m.spareparts.length > 0) {
      console.log(`✅ [ID ${m.id}] ${m.nama} (${m.tipe}): ${m.spareparts.length} item`);
    } else {
      console.log(`⚪ [ID ${m.id}] ${m.nama} (${m.tipe}): 0 item`);
    }
  });

  await prisma.$disconnect();
}

main().catch(console.error);
