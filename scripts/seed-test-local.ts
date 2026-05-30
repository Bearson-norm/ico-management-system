/**
 * Seed data test untuk lokal — berdasarkan nama mesin & ID sparepart dari CSV asli.
 * Tujuan: bisa test fitur BOM di localhost tanpa perlu database live.
 *
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/seed-test-local.ts
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '../lib/generated/mtc';
import bcrypt from 'bcryptjs';

const root = path.resolve(__dirname, '..');
function tryLoadRootEnv() {
  if (process.env.DATABASE_URL_MTC) return;
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

// Sparepart ID unik yang muncul di CSV BOM
const SPAREPART_IDS = [
  'MTC-SP-001', 'MTC-SP-033', 'MTC-SP-037', 'MTC-SP-038', 'MTC-SP-045',
  'MTC-SP-049', 'MTC-SP-054', 'MTC-SP-060', 'MTC-SP-061', 'MTC-SP-062',
  'MTC-SP-067', 'MTC-SP-068', 'MTC-SP-069', 'MTC-SP-071', 'MTC-SP-077',
  'MTC-SP-079', 'MTC-SP-080', 'MTC-SP-081', 'MTC-SP-084', 'MTC-SP-086',
  'MTC-SP-088', 'MTC-SP-089', 'MTC-SP-091', 'MTC-SP-097', 'MTC-SP-099',
  'MTC-SP-101', 'MTC-SP-107', 'MTC-SP-109', 'MTC-SP-111', 'MTC-SP-120',
  'MTC-SP-123', 'MTC-SP-129', 'MTC-SP-130', 'MTC-SP-132', 'MTC-SP-133',
  'MTC-SP-137', 'MTC-SP-138', 'MTC-SP-139', 'MTC-SP-140', 'MTC-SP-141',
  'MTC-SP-147', 'MTC-SP-149', 'MTC-SP-194', 'MTC-SP-212', 'MTC-SP-241',
  'MTC-SP-246', 'MTC-SP-248', 'MTC-SP-260', 'MTC-SP-280', 'MTC-SP-281',
  'MTC-SP-282', 'MTC-SP-284', 'MTC-SP-289', 'MTC-SP-292', 'MTC-SP-295',
  'MTC-SP-296', 'MTC-SP-299', 'MTC-SP-301', 'MTC-SP-302',
];

// Nama mesin unik dari CSV
const MESIN_NAMES = [
  'Mesin Lanyard Device',
  'Mesin Cellophane Device',
  'Mesin Cek Alat Device',
  'Mesin Conveyor Device',
  'Mesin Conveyor Liquid',
  'MESIN CAPPING FOUR WHEEL LIQUID',
  'MESIN CAPPING CAM 01 LIQUID',
  'MESIN FILLING LIQUID',
  'MESIN STICKER LIQUID',
  'MESIN L - SEALER DEVICE',
  'AUTHENTICITY',
  'MESIN CARTON SEALER',
  'MESIN BLISTER POD Y CARTRIDGE',
  'MESIN BLISTER POD X CARTRIDGE',
  'Mesin Shrink Kecil',
  'Mesin Shrink Tunnel Besar',
  'Conveyor Bottomles 01 Liquid Kecil',
  'Conveyer Bottomles 02 Liquid Besar',
  'Mesin Resistansi Cartridge',
  'Mesin Scanner',
  'Round Table Liquid',
];

const UOM_LIST = ['Pcs', 'Set', 'Meter', 'Roll', 'Box', 'Liter'];
const LOKASI_LIST = ['1-A-1-1', '1-A-1-2', '1-B-2-1', '2-A-3-4', '2-B-1-1', '3-A-2-3', '3-B-1-2'];

async function main() {
  tryLoadRootEnv();
  const prisma = new PrismaClient();

  try {
    console.log('🌱 Seed data test lokal dimulai...\n');

    // 1. Report counters
    for (const tipe of ['CM', 'PM', 'OH']) {
      await prisma.reportCounter.upsert({ where: { tipe }, update: {}, create: { tipe, count: 0 } });
    }

    // 2. User admin
    const hash = await bcrypt.hash('admin123', 12);
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: { username: 'admin', passwordHash: hash, namaLengkap: 'Administrator', role: 'editor' },
    });
    console.log('✅ User: admin / admin123');

    // 3. Kategori
    const kategoris = [
      { nama: 'Electrical', tipe: 'sparepart' },
      { nama: 'Mechanical', tipe: 'sparepart' },
      { nama: 'Consumable', tipe: 'sparepart' },
      { nama: 'Hydraulic', tipe: 'sparepart' },
      { nama: 'Pneumatic', tipe: 'sparepart' },
      { nama: 'Corrective', tipe: 'maintenance' },
      { nama: 'Preventive', tipe: 'maintenance' },
    ];
    for (const k of kategoris) {
      await prisma.kategori.upsert({ where: { nama: k.nama }, update: {}, create: k });
    }
    console.log(`✅ Kategori: ${kategoris.length} kategori`);

    // 4. Teknisi
    const teknisis = ['Ahmad Fauzi', 'Budi Santoso', 'Candra Wijaya', 'Dewi Rahayu'];
    for (const t of teknisis) {
      await prisma.teknisi.upsert({ where: { nama: t }, update: {}, create: { nama: t } });
    }
    console.log(`✅ Teknisi: ${teknisis.length} teknisi`);

    // 5. Mesin — dari nama di CSV asli
    for (const nama of MESIN_NAMES) {
      await prisma.mesin.upsert({
        where: { nama_tipe: { nama, tipe: 'sparepart' } },
        update: {},
        create: { nama, tipe: 'sparepart', aktif: true },
      });
    }
    console.log(`✅ Mesin: ${MESIN_NAMES.length} mesin (sesuai CSV asli)`);

    // 6. Sparepart — ID dari CSV asli, nama placeholder
    const katIds = await prisma.kategori.findMany({ select: { id: true } });
    let spCreated = 0;
    for (let i = 0; i < SPAREPART_IDS.length; i++) {
      const id = SPAREPART_IDS[i];
      const katId = katIds[i % katIds.length]?.id;
      const existing = await prisma.sparepart.findUnique({ where: { id } });
      if (!existing) {
        await prisma.sparepart.create({
          data: {
            id,
            nama: `Sparepart ${id}`,  // nama placeholder — di live sudah ada nama aslinya
            kategoriId: katId || null,
            uom: UOM_LIST[i % UOM_LIST.length],
            lokasi: LOKASI_LIST[i % LOKASI_LIST.length],
            harga: (i + 1) * 25000,
            minQty: 2,
            aktif: true,
          },
        });
        // Tambah stok awal
        await prisma.stockMovement.create({
          data: {
            tipe: 'IN',
            sparepartId: id,
            namaItem: `Sparepart ${id}`,
            qty: 10,
            keterangan: 'Stok awal test lokal',
          },
        });
        spCreated++;
      }
    }
    console.log(`✅ Sparepart: ${spCreated} sparepart dibuat (ID sesuai CSV asli)`);

    // 7. Import BOM dari CSV
    const csvPath = path.join(root, 'DB WEB MTC - DB Sparepart-Mesin.csv');
    if (fs.existsSync(csvPath)) {
      const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1); // skip header
      let bomCount = 0;
      for (const line of lines) {
        const [mesinNama, sparepartId] = line.replace(/\r/g, '').split(',');
        if (!mesinNama?.trim() || !sparepartId?.trim()) continue;
        const mesin = await prisma.mesin.findFirst({ where: { nama: mesinNama.trim(), tipe: 'sparepart' } });
        const sp = await prisma.sparepart.findUnique({ where: { id: sparepartId.trim() } });
        if (mesin && sp) {
          await prisma.sparepart.update({
            where: { id: sp.id },
            data: { mesins: { connect: { id: mesin.id } } },
          }).catch(() => {}); // ignore duplikat
          bomCount++;
        }
      }
      console.log(`✅ BOM: ${bomCount} pemetaan sparepart→mesin dari CSV`);
    }

    console.log('\n🎉 Seed test lokal selesai!');
    console.log('👉 Buka http://localhost:3000/mtc/login');
    console.log('   Username: admin | Password: admin123\n');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Gagal:', e.message);
  process.exit(1);
});
