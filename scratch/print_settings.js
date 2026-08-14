const { PrismaClient } = require('../lib/generated/mtc/index.js');
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.mtcSetting.findMany();
  console.log('All Settings in DB:', JSON.stringify(settings, null, 2));
}

main().finally(() => prisma.$disconnect());
