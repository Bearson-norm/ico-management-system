import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

function getCleanBaseName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(10cm|15cm|20cm|25cm|30cm|40cm|50cm|2\.5x100|2\.5x150|3\.6x300|4\.6x400|m3|m4|m5|m6|m8|m10|m12|putih|hitam|merah|biru)\b/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const mtc = new MtcPrisma();

  try {
    const all = await mtc.procurementTracking.findMany({
      orderBy: { id: 'asc' }
    });

    console.log(`=== CHECKING SIMILAR NAME GROUPS ACROSS ENTIRE DB (${all.length} items) ===`);

    const map = new Map<string, typeof all>();
    for (const item of all) {
      const base = getCleanBaseName(item.originalName);
      if (base.length < 5) continue;
      if (!map.has(base)) map.set(base, []);
      map.get(base)!.push(item);
    }

    const clusters = Array.from(map.entries()).filter(([_, list]) => list.length > 1);

    console.log(`Found ${clusters.length} similar base name clusters:`);
    clusters.slice(0, 15).forEach(([base, list]) => {
      console.log(`\nBase Cluster: "${base}" (${list.length} rows):`);
      list.forEach(i => {
        console.log(`  - [ID:${i.id}] PR:${i.nomorPr} | PO:${i.nomorPo} | Name:"${i.originalName}" | Qty:${i.qty} | Harga:Rp ${i.harga}`);
      });
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
