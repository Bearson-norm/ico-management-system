import { PrismaClient } from '../lib/generated/ga';
const p = new PrismaClient();

async function check() {
  const recent = await p.gaStockMovement.findMany({
    where: { tipe: 'OUT' },
    take: 30,
    orderBy: { id: 'desc' },
    select: {
      id: true,
      tipe: true,
      namaBarang: true,
      qty: true,
      tanggal: true,
      picNama: true,
      createdAt: true
    }
  });
  console.log(JSON.stringify(recent, null, 2));
  await p.$disconnect();
}

check();
