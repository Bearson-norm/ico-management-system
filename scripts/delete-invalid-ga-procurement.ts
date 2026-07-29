import { PrismaClient } from '../lib/generated/ga';

const prisma = new PrismaClient();

// Nama-nama yang merupakan nama akun analitik Odoo (ALL CAPS umum, bukan nama produk)
const ACCOUNT_PATTERNS = [
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

function looksLikeAccountName(name: string): boolean {
  const trimmed = name.trim();
  for (const pattern of ACCOUNT_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  // All caps, 3+ kata, panjang > 15 karakter = kemungkinan nama akun
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const wordCount = trimmed.split(/\s+/).length;
  if (isAllCaps && wordCount >= 3 && trimmed.length > 15) return true;
  return false;
}

async function main() {
  const all = await prisma.gaProcurementTracking.findMany({
    select: { id: true, originalName: true, nomorPr: true, nomorPo: true, qty: true, itemId: true }
  });

  console.log(`📊 Total record di database: ${all.length}\n`);
  console.log('Semua record:');
  all.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr || '-'} | itemId:${t.itemId || 'null'}`));

  const toDelete = all.filter(t => looksLikeAccountName(t.originalName));
  const toKeep = all.filter(t => !looksLikeAccountName(t.originalName));

  console.log(`\n✅ Akan DIPERTAHANKAN (${toKeep.length} record):`);
  toKeep.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}"`));

  console.log(`\n🗑️  Akan DIHAPUS (${toDelete.length} record):`);
  toDelete.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr}`));

  if (toDelete.length === 0) {
    console.log('\nTidak ada yang perlu dihapus.');
    return;
  }

  const deleted = await prisma.gaProcurementTracking.deleteMany({
    where: { id: { in: toDelete.map(t => t.id) } }
  });

  console.log(`\n✅ Berhasil menghapus ${deleted.count} record!`);

  // Hapus master item yatim piatu dari nama akun
  const affectedItemIds = [...new Set(toDelete.map(t => t.itemId).filter(Boolean))] as string[];
  for (const itemId of affectedItemIds) {
    const usedCount = await prisma.gaProcurementTracking.count({ where: { itemId } });
    const stockCount = await prisma.gaStockMovement.count({ where: { itemId } });
    if (usedCount === 0 && stockCount === 0) {
      const item = await prisma.gaItem.findUnique({ where: { id: itemId }, select: { nama: true } });
      if (item && looksLikeAccountName(item.nama)) {
        await prisma.gaItem.delete({ where: { id: itemId } });
        console.log(`🗑️  Hapus master item: "${item.nama}" (${itemId})`);
      }
    }
  }

  const remaining = await prisma.gaProcurementTracking.count();
  console.log(`\n📋 Sisa record di database: ${remaining}`);
  console.log('✨ Selesai! Refresh halaman GA PO/PR.');
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
