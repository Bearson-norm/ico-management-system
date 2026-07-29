import { prismaGa } from '../lib/prisma-ga';

async function main() {
  const items = await prismaGa.gaItem.findMany({
    select: { id: true, nama: true }
  });
  console.log("=== GA Master Items ===");
  console.log(items);
}

main().catch(console.error);
