// Script cleanup — jalankan: node scripts/cleanup-ga-prisma.js
// Menggunakan @prisma/client yang sudah ada di node_modules

// Load .env
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('../lib/generated/ga/index.js');

const prisma = new PrismaClient();

function looksLikeAccountName(name) {
  const t = name.trim();
  const PATTERNS = [
    /^SUPPLIES\s+FACTORY\s+RELATED$/i,
    /^REPAIR\s+AND\s+MAINTENANCE/i,
    /^OFFICE\s+SUPPLIES$/i,
    /^FACTORY\s+SUPPLIES$/i,
    /^GENERAL\s+SUPPLIES$/i,
    /^MAINTENANCE\s+SUPPLIES$/i,
    /^CLEANING\s+SUPPLIES$/i,
    /^CONSUMABLE/i,
    /^Barang\s+GA$/i,
  ];
  for (const p of PATTERNS) {
    if (p.test(t)) return true;
  }
  const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
  const wordCount = t.split(/\s+/).length;
  if (isAllCaps && wordCount >= 3 && t.length > 15) return true;
  return false;
}

async function main() {
  console.log('DATABASE_URL_GA:', process.env.DATABASE_URL_GA ? '✅ Found' : '❌ Not found');

  const all = await prisma.gaProcurementTracking.findMany({
    select: { id: true, originalName: true, nomorPr: true, qty: true, itemId: true }
  });

  console.log(`\n📊 Total record: ${all.length}`);
  all.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr || '-'}`));

  const toDelete = all.filter(t => looksLikeAccountName(t.originalName));
  console.log(`\n🗑️  Akan dihapus: ${toDelete.length}`);
  toDelete.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}"`));

  if (toDelete.length === 0) {
    console.log('Tidak ada yang perlu dihapus!');
    return;
  }

  const deleted = await prisma.gaProcurementTracking.deleteMany({
    where: { id: { in: toDelete.map(t => t.id) } }
  });
  console.log(`\n✅ Dihapus: ${deleted.count} record`);

  const remaining = await prisma.gaProcurementTracking.count();
  console.log(`📋 Sisa di database: ${remaining}`);
  console.log('✨ Selesai! Refresh halaman GA PO/PR.');
}

main()
  .catch(e => { console.error('❌ Error:', e.message); })
  .finally(() => prisma.$disconnect());
