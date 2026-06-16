import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function main() {
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();
  try {
    console.log("--- MTC DATABASE ---");
    console.log(`User Count: ${await mtc.user.count()}`);
    console.log(`Sparepart Count: ${await mtc.sparepart.count()}`);
    console.log(`ProcurementTracking Count: ${await mtc.procurementTracking.count()}`);
    console.log(`StockMovement Count: ${await mtc.stockMovement.count()}`);

    console.log("\n--- GA DATABASE ---");
    console.log(`User Count: ${await ga.user.count()}`);
    console.log(`Kategori Count: ${await ga.kategori.count()}`);
    // GA has items, stock, movements etc. Let's see what tables exist in GA schema.
  } catch (e) {
    console.error(e);
  } finally {
    await mtc.$disconnect();
    await ga.$disconnect();
  }
}

main();
