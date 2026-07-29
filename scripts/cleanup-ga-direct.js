// Script cleanup langsung pakai pg (node-postgres) untuk bypass Prisma client generation issues
// Jalankan: node scripts/cleanup-ga-direct.js

const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:admin123@127.0.0.1:5432/ga_db',
});

// Pola nama akun analitik Odoo yang bukan nama produk nyata
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

  // All caps + 3+ kata + panjang > 15 karakter = kemungkinan nama akun analitik
  const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
  const wordCount = t.split(/\s+/).length;
  if (isAllCaps && wordCount >= 3 && t.length > 15) return true;

  return false;
}

async function main() {
  await client.connect();
  console.log('✅ Terhubung ke database ga_db\n');

  // Ambil semua data
  const { rows: all } = await client.query(
    `SELECT id, "originalName", "nomorPr", "nomorPo", qty, "itemId" FROM "GaProcurementTracking" ORDER BY id`
  );

  console.log(`📊 Total record di database: ${all.length}\n`);

  const toDelete = all.filter(t => looksLikeAccountName(t.originalName));
  const toKeep   = all.filter(t => !looksLikeAccountName(t.originalName));

  console.log(`✅ Akan DIPERTAHANKAN (${toKeep.length} record):`);
  toKeep.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr || '-'}`));

  console.log(`\n🗑️  Akan DIHAPUS (${toDelete.length} record):`);
  toDelete.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr || '-'}`));

  if (toDelete.length === 0) {
    console.log('\nTidak ada yang perlu dihapus. Database sudah bersih!');
    return;
  }

  const ids = toDelete.map(t => t.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

  await client.query(
    `DELETE FROM "GaProcurementTracking" WHERE id IN (${placeholders})`,
    ids
  );
  console.log(`\n✅ Berhasil menghapus ${toDelete.length} record!`);

  // Cek dan hapus master GaItem yatim piatu
  const affectedItemIds = [...new Set(toDelete.map(t => t.itemId).filter(Boolean))];
  let deletedItemCount = 0;

  for (const itemId of affectedItemIds) {
    const { rows: usedInTracking } = await client.query(
      `SELECT COUNT(*) FROM "GaProcurementTracking" WHERE "itemId" = $1`, [itemId]
    );
    const { rows: usedInStock } = await client.query(
      `SELECT COUNT(*) FROM "GaStockMovement" WHERE "itemId" = $1`, [itemId]
    );

    const trackingCount = parseInt(usedInTracking[0].count);
    const stockCount = parseInt(usedInStock[0].count);

    if (trackingCount === 0 && stockCount === 0) {
      const { rows: item } = await client.query(
        `SELECT nama FROM "GaItem" WHERE id = $1`, [itemId]
      );
      if (item.length > 0 && looksLikeAccountName(item[0].nama)) {
        await client.query(`DELETE FROM "GaItem" WHERE id = $1`, [itemId]);
        console.log(`🗑️  Hapus master item: "${item[0].nama}" (${itemId})`);
        deletedItemCount++;
      }
    }
  }

  // Tampilkan sisa data
  const { rows: remaining } = await client.query(
    `SELECT id, "originalName", "nomorPr", qty FROM "GaProcurementTracking" ORDER BY id`
  );
  console.log(`\n📋 Sisa ${remaining.length} record yang tersimpan:`);
  remaining.forEach(t => console.log(`  ID:${t.id} | "${t.originalName}" | PR:${t.nomorPr || '-'} | Qty:${t.qty}`));
  console.log('\n✨ Selesai! Refresh halaman GA PO/PR untuk melihat perubahan.');
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
  .finally(() => client.end());
