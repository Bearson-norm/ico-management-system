const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'lib', 'generated', 'ga', 'index.js'));
const p = new PrismaClient();
async function check() {
  const itemCount = await p.gaItem.count();
  const movCount = await p.gaStockMovement.count();
  const adjCount = await p.gaStockMovement.count({ where: { tipe: 'ADJ' } });
  const inCount = await p.gaStockMovement.count({ where: { tipe: 'IN' } });
  const outCount = await p.gaStockMovement.count({ where: { tipe: 'OUT' } });
  console.log('=== GA DATABASE CHECK ===');
  console.log('Items:', itemCount);
  console.log('Movements total:', movCount);
  console.log('  ADJ:', adjCount, '| IN:', inCount, '| OUT:', outCount);
  const sample = await p.gaItem.findMany({ take: 3, select: { id: true, nama: true, lokasi: true, harga: true, minQty: true } });
  console.log('Sample items:', JSON.stringify(sample, null, 2));
  
  // Cek recent movements
  const recent = await p.gaStockMovement.findMany({ take: 3, orderBy: { createdAt: 'desc' }, select: { tipe: true, namaBarang: true, qty: true, tanggal: true } });
  console.log('Recent movements:', JSON.stringify(recent, null, 2));
  
  await p.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
