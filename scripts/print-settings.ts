import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function main() {
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();
  try {
    console.log("=== MTC SETTINGS ===");
    const mtcSettings = await mtc.mtcSetting.findMany();
    console.log(JSON.stringify(mtcSettings, null, 2));

    console.log("\n=== GA SETTINGS ===");
    const gaSettings = await ga.gaSetting.findMany();
    console.log(JSON.stringify(gaSettings, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await mtc.$disconnect();
    await ga.$disconnect();
  }
}

main();
