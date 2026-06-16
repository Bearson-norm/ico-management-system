/**
 * Test dashboard API logic directly
 */
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'lib', 'generated', 'ga', 'index.js'));
const p = new PrismaClient();

async function testDashboard() {
  console.log('=== Testing GA Dashboard Queries ===\n');

  try {
    console.log('1. gaItem.findMany...');
    const items = await p.gaItem.findMany({
      where: { aktif: true },
      select: {
        id: true, nama: true, kodeBarang: true, lokasi: true,
        uom: true, minQty: true, maxQty: true, harga: true,
        movements: {
          where: { tipe: { in: ['IN', 'OUT', 'ADJ'] } },
          select: { tipe: true, qty: true, tanggal: true },
        },
      },
    });
    console.log('   OK -', items.length, 'items');

    console.log('2. gaStockMovement.findMany (recent)...');
    const recent = await p.gaStockMovement.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, tipe: true, itemId: true, namaBarang: true, qty: true, tanggal: true, picNama: true, keterangan: true },
    });
    console.log('   OK -', recent.length, 'movements');

    console.log('3. gaOpnameSession.findMany...');
    const sessions = await p.gaOpnameSession.findMany({
      take: 5,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, periodeNama: true, status: true, tanggal: true, postMode: true, postedAt: true, _count: { select: { lines: true } } },
    });
    console.log('   OK -', sessions.length, 'sessions');

    console.log('4. gaStockMovement.groupBy...');
    const topUsed = await p.gaStockMovement.groupBy({
      by: ['itemId', 'namaBarang'],
      where: { tipe: 'OUT', NOT: { itemId: null } },
      _sum: { qty: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: 5,
    });
    console.log('   OK -', topUsed.length, 'top items');

    console.log('5. gaOpnameSession.count (draft)...');
    const draftCount = await p.gaOpnameSession.count({ where: { status: 'draft' } });
    console.log('   OK -', draftCount, 'drafts');

    console.log('6. kategori.count...');
    const kategoriCount = await p.kategori.count();
    console.log('   OK -', kategoriCount, 'categories');

    console.log('7. gaProcurementTracking.count (ORDERED)...');
    const orderCount = await p.gaProcurementTracking.count({ where: { status: 'ORDERED' } });
    console.log('   OK -', orderCount, 'active orders');

    console.log('\n✅ All queries passed! Dashboard should work.');

    // Compute stock for a few items
    let totalStock = 0;
    let totalValuation = 0;
    for (const item of items.slice(0, 5)) {
      let stock = 0;
      for (const m of item.movements) {
        if (m.tipe === 'IN') stock += m.qty;
        else if (m.tipe === 'OUT') stock -= m.qty;
        else if (m.tipe === 'ADJ') stock += m.qty;
      }
      totalStock += stock;
      totalValuation += stock * Number(item.harga || 0);
    }
    console.log('\nSample (first 5 items):');
    console.log('  Total stock:', totalStock);
    console.log('  Estimated valuation (5 items):', totalValuation.toLocaleString('id-ID'));
    console.log('  Recent movements sample:', recent[0]);

  } catch (e) {
    console.error('\n❌ QUERY ERROR:', e.message);
    console.error(e);
  } finally {
    await p.$disconnect();
  }
}

testDashboard();
