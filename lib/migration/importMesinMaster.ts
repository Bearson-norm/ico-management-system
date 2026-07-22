/**
 * importMesinMaster.ts
 * ─────────────────────
 * Import/upsert master data mesin dari list yang sudah ditentukan.
 * 
 * LOGIKA:
 * - Upsert mesin (tidak duplikat) berdasarkan unique key: nama + tipe
 * - Untuk mesin perbaikan yang punya sparepart links:
 *   → Cari/buat versi sparepart-type dari nama yang sama
 *   → Pindahkan semua link sparepart ke versi sparepart (BOM)
 *   → Tidak ada duplikat link (skip kalau sudah ada)
 *
 * Jalankan:
 *   npx ts-node -P tsconfig.scripts.json lib/migration/importMesinMaster.ts
 */

import { PrismaClient } from '../generated/mtc';

const prisma = new PrismaClient();

const DATA = [
  // PERBAIKAN (dengan area)
  { nama: 'Mesin Filling 01 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Filling 02 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Capping 01 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Capping 02 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Cellophane Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Mesin Cek Alat Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Authenticity Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin Shrink Liquid Kecil', tipe: 'perbaikan', area: 'Liquid 15 Ml Gedung F2' },
  { nama: 'Mesin Sticker 01 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Sticker 02 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin L-Sealer 01 Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin L-Sealer 02 Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Conveyor 01 Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Conveyor 02 Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Conveyor 03 Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Conveyor 01 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Conveyor 02 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Conveyor 03 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Conveyor 04 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mixer 01 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mixer 02 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Authenticity Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mixer 03 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Blister Pod X Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Shrink Tunnel Liquid 15 Ml Liquid', tipe: 'perbaikan', area: 'Liquid 15 Ml Gedung F2' },
  { nama: 'Shrink Tunnel 01 Device Besar', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Shrink Tunnel 02 Device Kecil', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Coding 01 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Coding 02 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Coding 03 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Coding 04 Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Coding 05 Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Authenticity Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Carton Sealer Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Carton Sealer Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Carton Sealer Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Mesin Blister Pod Y Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Mesin Bottomless 01 Liquid Kecil', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Bottomless 02 Liquid Besar', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Kompressor Screw', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Mesin Lanyard 01 Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin Lanyard 02 Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin Conveyer Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin Scanner Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin Scanner Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Scanner Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Mesin Capping 15Ml (Manual) Liquid', tipe: 'perbaikan', area: 'Liquid 15 Ml Gedung F2' },
  { nama: 'Mesin Sticker 15Ml Liquid', tipe: 'perbaikan', area: 'Liquid 15 Ml Gedung F2' },
  { nama: 'Jembatan Labelling Line 1 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Jembatan Labelling Line 2 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Conveyor Botol 1 Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Round Table Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Resistansi Cartridge', tipe: 'perbaikan', area: 'Cartridge Gedung G5' },
  { nama: 'Mesin Cellophane Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Mesin Kompressor Device', tipe: 'perbaikan', area: 'Device Gedung G7' },
  { nama: 'Timbangan Mixing Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },
  { nama: 'Mesin Capping 02 Servo Liquid', tipe: 'perbaikan', area: 'Liquid Gedung G1' },

  // SPAREPART / BOM (tanpa area)
  { nama: 'Mesin Cellophane Device', tipe: 'sparepart', area: null },
  { nama: 'Mesin Cek Alat Device', tipe: 'sparepart', area: null },
  { nama: 'Mesin Conveyor Device', tipe: 'sparepart', area: null },
  { nama: 'Mesin Conveyor Liquid', tipe: 'sparepart', area: null },
  { nama: 'Mesin Capping Four Wheel Liquid', tipe: 'sparepart', area: null },
  { nama: 'Mesin Capping Cam Liquid', tipe: 'sparepart', area: null },
  { nama: 'Mesin FIlling Liquid', tipe: 'sparepart', area: null },
  { nama: 'Mesin Sticker Liquid', tipe: 'sparepart', area: null },
  { nama: 'Mesin L - Sealer Device', tipe: 'sparepart', area: null },
  { nama: 'Authenticity', tipe: 'sparepart', area: null },
  { nama: 'Mesin Carton Sealer', tipe: 'sparepart', area: null },
  { nama: 'Mesin Blister Pod Y Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Mesin Blister Pod X Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Mesin Shrink Kecil', tipe: 'sparepart', area: null },
  { nama: 'Mesin Shrink Tunnel Besar', tipe: 'sparepart', area: null },
  { nama: 'Conveyor Bottomles 01 Liquid Kecil', tipe: 'sparepart', area: null },
  { nama: 'Conveyer Bottomles 02 Liquid Besar', tipe: 'sparepart', area: null },
  { nama: 'Mesin Resistansi Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Mesin Scanner', tipe: 'sparepart', area: null },
  { nama: 'Round Table Liquid', tipe: 'sparepart', area: null },
  { nama: 'Mesin Cellophane Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Conveyor 01 Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Conveyor 02 Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Conveyor 03 Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Kompressor Screw', tipe: 'sparepart', area: null },
  { nama: 'Mesin Scanner Cartridge', tipe: 'sparepart', area: null },
  { nama: 'Carton Sealer Cartridge', tipe: 'sparepart', area: null },
];

async function main() {
  console.log(`\n=== STEP 1: Upsert ${DATA.length} mesin (tidak duplikat) ===\n`);
  let success = 0, failed = 0;

  for (const m of DATA) {
    try {
      await prisma.mesin.upsert({
        where: { nama_tipe: { nama: m.nama, tipe: m.tipe } },
        update: { area: m.area, aktif: true },
        create: { nama: m.nama, tipe: m.tipe, area: m.area, aktif: true },
      });
      console.log(`  ✅ [${m.tipe.toUpperCase()}] ${m.nama}${m.area ? ' → ' + m.area : ''}`);
      success++;
    } catch (e) {
      console.error(`  ❌ GAGAL [${m.tipe}] ${m.nama}:`, e);
      failed++;
    }
  }
  console.log(`\nStep 1 selesai: ✅ ${success} · ❌ ${failed}\n`);

  // ─── STEP 2: Pindahkan sparepart links dari mesin perbaikan ke sparepart ──────
  // Kalau ada mesin perbaikan yang punya spareparts → cari/buat versi sparepart-nya
  // dan pindahkan link (tanpa duplikat)
  console.log(`=== STEP 2: Pindahkan BOM links dari mesin perbaikan → sparepart ===\n`);

  const perbaikanDenganSP = await prisma.mesin.findMany({
    where: { tipe: 'perbaikan' },
    include: { spareparts: { select: { id: true, nama: true } } },
  });

  let moved = 0, skipped = 0;

  for (const mesin of perbaikanDenganSP) {
    if (mesin.spareparts.length === 0) continue;

    console.log(`\n🔧 [${mesin.id}] ${mesin.nama} → ${mesin.spareparts.length} sparepart`);

    // Cari versi sparepart dari mesin ini (exact nama match)
    let bomMesin = await prisma.mesin.findFirst({
      where: { nama: mesin.nama, tipe: 'sparepart' },
      include: { spareparts: { select: { id: true } } },
    });

    if (!bomMesin) {
      // Tidak ada → buat baru
      bomMesin = await prisma.mesin.create({
        data: { nama: mesin.nama, tipe: 'sparepart', area: null, aktif: true },
        include: { spareparts: { select: { id: true } } },
      });
      console.log(`   📦 Dibuat versi BOM baru: ID ${bomMesin.id}`);
    } else {
      console.log(`   📦 Versi BOM sudah ada: ID ${bomMesin.id}`);
    }

    const existingBomSpIds = new Set(bomMesin.spareparts.map((s: { id: string }) => s.id));

    for (const sp of mesin.spareparts) {
      if (existingBomSpIds.has(sp.id)) {
        console.log(`     ⏭️  Skip (sudah ada di BOM): ${sp.nama}`);
        skipped++;
        continue;
      }
      // Tambahkan link ke versi sparepart
      await prisma.mesin.update({
        where: { id: bomMesin.id },
        data: { spareparts: { connect: { id: sp.id } } },
      });
      console.log(`     ➡️  Dipindah ke BOM: ${sp.nama}`);
      moved++;
    }

    // Putuskan semua link dari versi perbaikan
    if (mesin.spareparts.length > 0) {
      await prisma.mesin.update({
        where: { id: mesin.id },
        data: { spareparts: { disconnect: mesin.spareparts.map((s: { id: string }) => ({ id: s.id })) } },
      });
      console.log(`   🔓 Link sparepart dilepas dari mesin perbaikan ID ${mesin.id}`);
    }
  }

  console.log(`\nStep 2 selesai: ➡️  ${moved} dipindah · ⏭️  ${skipped} di-skip (sudah ada)\n`);
  console.log('✅ Import & migrasi BOM selesai!');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
