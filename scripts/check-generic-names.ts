import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function main() {
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();
  try {
    console.log("--- MTC PROCUREMENTS ---");
    const mtcItems = await mtc.procurementTracking.findMany({
      select: { originalName: true, nomorPr: true }
    });
    
    const mtcCounts = new Map<string, number>();
    for (const item of mtcItems) {
      mtcCounts.set(item.originalName, (mtcCounts.get(item.originalName) || 0) + 1);
    }
    
    // Print names that are suspicious (all caps, or contain generic keywords, or have high frequency)
    const sortedMtc = Array.from(mtcCounts.entries()).sort((a, b) => b[1] - a[1]);
    console.log("Top MTC originalNames:");
    sortedMtc.slice(0, 30).forEach(([name, count]) => {
      console.log(`- [${count}x] ${name}`);
    });

    console.log("\n--- GA PROCUREMENTS ---");
    const gaItems = await ga.gaProcurementTracking.findMany({
      select: { originalName: true, nomorPr: true }
    });
    
    const gaCounts = new Map<string, number>();
    for (const item of gaItems) {
      gaCounts.set(item.originalName, (gaCounts.get(item.originalName) || 0) + 1);
    }
    
    const sortedGa = Array.from(gaCounts.entries()).sort((a, b) => b[1] - a[1]);
    console.log("Top GA originalNames:");
    sortedGa.slice(0, 30).forEach(([name, count]) => {
      console.log(`- [${count}x] ${name}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await mtc.$disconnect();
    await ga.$disconnect();
  }
}

main();
