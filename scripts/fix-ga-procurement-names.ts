/**
 * Script: fix-ga-procurement-names.ts
 * 
 * Memperbaiki data lama di GaProcurementTracking yang nama barangnya
 * adalah nama akun analitik Odoo (bukan nama produk nyata), seperti:
 *   - SUPPLIES FACTORY RELATED
 *   - OFFICE SUPPLIES
 *   - DAN SEJENISNYA
 * 
 * Yang dilakukan:
 * 1. Temukan semua tracking yang originalName-nya terlihat seperti nama akun
 * 2. Set itemId = null (Unlinked) agar bisa dihubungkan manual ke produk yang benar
 * 3. Hapus GaItem master yang auto-dibuat dari nama akun tersebut (kalau tidak dipakai lagi)
 * 
 * Jalankan: npx ts-node --project tsconfig.scripts.json scripts/fix-ga-procurement-names.ts
 */

import { PrismaClient } from '../lib/generated/ga';

const prisma = new PrismaClient();

// Pola nama yang terlihat seperti nama akun analitik Odoo (bukan nama produk)
// Biasanya huruf kapital semua, kata generik
const ACCOUNT_NAME_PATTERNS = [
  /^SUPPLIES\s+FACTORY\s+RELATED$/i,
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
  
  // Check specific patterns
  for (const pattern of ACCOUNT_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  // Jika nama SEMUA HURUF KAPITAL dan tidak ada huruf kecil sama sekali
  // dan lebih dari 3 kata (kemungkinan nama akun, bukan nama produk)
  const words = trimmed.split(/\s+/);
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  if (isAllCaps && words.length >= 3 && trimmed.length > 15) {
    return true;
  }
  
  return false;
}

async function main() {
  console.log('🔍 Memulai scan data GA Procurement...\n');

  // Ambil semua tracking yang punya itemId (linked)
  const allTracking = await prisma.gaProcurementTracking.findMany({
    include: {
      item: {
        select: { id: true, nama: true }
      }
    }
  });

  console.log(`📊 Total data tracking ditemukan: ${allTracking.length}`);

  // Filter yang nama-nya terlihat seperti nama akun
  const problematic = allTracking.filter(t => {
    return looksLikeAccountName(t.originalName);
  });

  if (problematic.length === 0) {
    console.log('\n✅ Tidak ada data yang bermasalah ditemukan! Semua sudah bersih.');
    return;
  }

  console.log(`\n⚠️  Ditemukan ${problematic.length} item dengan nama akun analitik:\n`);

  for (const t of problematic) {
    console.log(`  ID: ${t.id} | Nama: "${t.originalName}" | itemId: ${t.itemId || 'null'} | PR: ${t.nomorPr || '-'}`);
  }

  // Pisahkan yang masih linked
  const linkedProblematic = problematic.filter(t => t.itemId !== null);
  const unlinkIds = linkedProblematic.map(t => t.id);

  console.log(`\n🔗 Yang masih terhubung (akan di-unlink): ${linkedProblematic.length}`);
  console.log(`⭕ Yang sudah unlinked: ${problematic.length - linkedProblematic.length}`);

  if (linkedProblematic.length > 0) {
    // Kumpulkan itemId yang akan diputus
    const affectedItemIds = [...new Set(linkedProblematic.map(t => t.itemId).filter(Boolean))] as string[];

    console.log('\n🔄 Proses unlink item-item bermasalah...');
    
    // Unlink: set itemId = null
    const updated = await prisma.gaProcurementTracking.updateMany({
      where: { id: { in: unlinkIds } },
      data: { itemId: null }
    });
    console.log(`✅ Berhasil unlink ${updated.count} tracking item.`);

    // Cek apakah master item (GaItem) tersebut masih digunakan oleh tracking lain
    console.log('\n🧹 Memeriksa master item yang tidak terpakai lagi...');
    let deletedItemCount = 0;

    for (const itemId of affectedItemIds) {
      const stillUsedCount = await prisma.gaProcurementTracking.count({
        where: { itemId }
      });

      const stockCount = await prisma.gaStockMovement.count({
        where: { itemId }
      });

      if (stillUsedCount === 0 && stockCount === 0) {
        // Aman dihapus
        const gaItem = await prisma.gaItem.findUnique({ where: { id: itemId }, select: { nama: true } });
        if (gaItem && looksLikeAccountName(gaItem.nama)) {
          await prisma.gaItem.delete({ where: { id: itemId } });
          console.log(`  🗑️  Hapus master item: "${gaItem.nama}" (${itemId})`);
          deletedItemCount++;
        } else {
          console.log(`  ℹ️  Skip hapus: "${gaItem?.nama}" (${itemId}) — nama produk valid, dipertahankan`);
        }
      } else {
        console.log(`  ℹ️  Skip hapus item ${itemId} — masih digunakan di ${stillUsedCount} tracking / ${stockCount} stock movement`);
      }
    }

    console.log(`\n✅ Selesai! ${deletedItemCount} master item berhasil dibersihkan.`);
  }

  // Summary akhir
  const finalUnlinked = await prisma.gaProcurementTracking.count({
    where: {
      itemId: null,
      originalName: { in: problematic.map(t => t.originalName) }
    }
  });

  console.log(`\n📋 RINGKASAN:`);
  console.log(`  - ${problematic.length} item nama akun terdeteksi`);
  console.log(`  - ${linkedProblematic.length} berhasil di-unlink`);
  console.log(`  - Sekarang tampil sebagai "Unlinked" di UI, siap dihubungkan manual`);
  console.log('\n✨ Selesai! Refresh halaman GA PO/PR untuk melihat perubahan.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
