/**
 * cleanup-ga-final.ts
 * Baca .env manual lalu jalankan cleanup via Prisma
 */
import fs from 'fs';
import path from 'path';

// Manual load .env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    // Hapus tanda kutip
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

console.log('DATABASE_URL_GA:', process.env.DATABASE_URL_GA || '❌ NOT FOUND');

import { PrismaClient } from '../lib/generated/ga';

const prisma = new PrismaClient();

function looksLikeAccountName(name: string): boolean {
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
  const all = await prisma.gaProcurementTracking.findMany({
    select: { id: true, originalName: true, nomorPr: true, qty: true, itemId: true }
  });

  console.log(`\n📊 Total record: ${all.length}`);
  all.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr || '-'}`));

  const toDelete = all.filter(t => looksLikeAccountName(t.originalName));
  console.log(`\n🗑️  Akan dihapus: ${toDelete.length}`);
  toDelete.forEach(t => console.log(`  ✗ "${t.originalName}" (ID:${t.id})`));

  if (toDelete.length === 0) {
    console.log('Tidak ada yang perlu dihapus!');
    return;
  }

  const affectedItemIds = [...new Set(toDelete.map(t => t.itemId).filter(Boolean))] as string[];

  const deleted = await prisma.gaProcurementTracking.deleteMany({
    where: { id: { in: toDelete.map(t => t.id) } }
  });
  console.log(`\n✅ Dihapus ${deleted.count} record!`);

  for (const itemId of affectedItemIds) {
    const usedCount = await prisma.gaProcurementTracking.count({ where: { itemId } });
    const stockCount = await prisma.gaStockMovement.count({ where: { itemId } });
    if (usedCount === 0 && stockCount === 0) {
      const item = await prisma.gaItem.findUnique({ where: { id: itemId }, select: { nama: true } });
      if (item && looksLikeAccountName(item.nama)) {
        await prisma.gaItem.delete({ where: { id: itemId } });
        console.log(`🗑️  Hapus master item: "${item.nama}"`);
      }
    }
  }

  const remaining = await prisma.gaProcurementTracking.count();
  console.log(`\n📋 Sisa di database: ${remaining}`);
  console.log('✨ Selesai! Refresh halaman GA PO/PR.');
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
