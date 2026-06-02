/**
 * Seed data dummy khusus untuk simulasi sistem Pelacakan SCM, PR/PO, dan Gudang MTC.
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/seed-scm-dummy.ts
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '../lib/generated/mtc';

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

async function main() {
  tryLoadRootEnv();
  const prisma = new PrismaClient();

  try {
    console.log('🚀 Memulai Seeding Data Dummy Simulasi SCM...');

    // 1. Dapatkan Kategori
    const electrical = await prisma.kategori.upsert({
      where: { nama: 'Electrical' },
      update: {},
      create: { nama: 'Electrical', tipe: 'sparepart' }
    });

    const mechanical = await prisma.kategori.upsert({
      where: { nama: 'Mechanical' },
      update: {},
      create: { nama: 'Mechanical', tipe: 'sparepart' }
    });

    const consumable = await prisma.kategori.upsert({
      where: { nama: 'Consumable' },
      update: {},
      create: { nama: 'Consumable', tipe: 'sparepart' }
    });

    console.log('✅ Kategori Electrical, Mechanical, Consumable siap.');

    // 2. Buat Sparepart di Database Master (untuk Dropdown dan Deteksi Low Stock)
    const spData = [
      {
        id: 'MTC-SP-001',
        nama: 'Relay Omron MY2N-GS 24VDC',
        kategoriId: electrical.id,
        uom: 'Pcs',
        lokasi: 'A-1-2',
        harga: 45000,
        minQty: 10,
        currentStock: 3 // Low Stock (Defisit 7)
      },
      {
        id: 'MTC-SP-002',
        nama: 'Socket Relay PYF08A-E',
        kategoriId: electrical.id,
        uom: 'Pcs',
        lokasi: 'A-1-3',
        harga: 15000,
        minQty: 8,
        currentStock: 2 // Low Stock (Defisit 6)
      },
      {
        id: 'MTC-SP-003',
        nama: 'Proximity Sensor Autonics PR12-4DN',
        kategoriId: electrical.id,
        uom: 'Pcs',
        lokasi: 'B-2-1',
        harga: 285000,
        minQty: 5,
        currentStock: 6 // Aman
      },
      {
        id: 'MTC-SP-004',
        nama: 'Solenoid Valve Airtac 4V210-08 24VDC',
        kategoriId: mechanical.id,
        uom: 'Pcs',
        lokasi: 'C-1-1',
        harga: 175000,
        minQty: 6,
        currentStock: 0 // Habis
      },
      {
        id: 'MTC-SP-005',
        nama: 'Cable Ties 200mm Black Nylon (100 Pcs/Pack)',
        kategoriId: consumable.id,
        uom: 'Pack',
        lokasi: 'D-3-2',
        harga: 22000,
        minQty: 15,
        currentStock: 4 // Low Stock
      }
    ];

    for (const sp of spData) {
      await prisma.sparepart.upsert({
        where: { id: sp.id },
        update: {
          nama: sp.nama,
          kategoriId: sp.kategoriId,
          uom: sp.uom,
          lokasi: sp.lokasi,
          harga: sp.harga,
          minQty: sp.minQty
        },
        create: {
          id: sp.id,
          nama: sp.nama,
          kategoriId: sp.kategoriId,
          uom: sp.uom,
          lokasi: sp.lokasi,
          harga: sp.harga,
          minQty: sp.minQty
        }
      });

      // Tambahkan stock movements untuk mengatur currentStock
      // Bersihkan pergerakan sebelumnya demi konsistensi data test
      await prisma.stockMovement.deleteMany({
        where: { sparepartId: sp.id }
      });

      if (sp.currentStock > 0) {
        await prisma.stockMovement.create({
          data: {
            tipe: 'IN',
            sparepartId: sp.id,
            namaItem: sp.nama,
            qty: sp.currentStock,
            harga: sp.harga,
            lokasi: sp.lokasi,
            keterangan: 'Stok Awal Simulasi'
          }
        });
      }
    }
    console.log('✅ Data Sparepart Master & Perhitungan Stok berhasil diperbarui.');

    // 3. Bersihkan data ProcurementTracking lama sebelum diisi data simulasi baru
    await prisma.procurementTracking.deleteMany({});
    console.log('🧹 Data pelacakan SCM sebelumnya telah dibersihkan.');

    // 4. Seeding Data ProcurementTracking
    const now = new Date();

    // 🌟 GROUP 1: DRAFT (Pending PR) — Belum ada Nomor PR
    await prisma.procurementTracking.createMany({
      data: [
        {
          fbIndex: 101,
          originalName: 'Solenoid Valve Airtac 4V210-08 24VDC',
          sparepartId: 'MTC-SP-004',
          keterangan: 'Kebutuhan urgent untuk mesin Conveyor Liquid',
          qty: 6,
          productCategory: 'Mechanical',
          reason: 'Stok habis, mesin sering trouble jika sensor pneumatic telat trigger',
          urgency: 'Urgent',
          linkReferences: 'https://tokopedia.com/search?q=Airtac+4V210-08',
          vendor: 'Mitra Pneumatic',
          harga: 175000,
          nomorPr: null,
          statusPr: 'DRAFT',
          isStocked: true,
          tanggalList: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 hari lalu
        },
        {
          fbIndex: 102,
          originalName: 'Cable Ties 200mm Black Nylon (100 Pcs/Pack)',
          sparepartId: 'MTC-SP-005',
          keterangan: 'Consumable untuk pengikat instalasi kabel panel',
          qty: 15,
          productCategory: 'Consumable',
          reason: 'Stok menipis sisa 4 pack',
          urgency: 'Normal',
          linkReferences: 'https://tokopedia.com/search?q=Cable+Ties+200mm',
          vendor: 'Toko Listrik Sejahtera',
          harga: 22000,
          nomorPr: null,
          statusPr: 'DRAFT',
          isStocked: true,
          tanggalList: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) // 1 hari lalu
        }
      ]
    });

    // 🌟 GROUP 2: PR PENDING SCM (Menunggu PO) — Nomor PR: PR/2026/05/001
    await prisma.procurementTracking.createMany({
      data: [
        {
          fbIndex: 103,
          originalName: 'Relay Omron MY2N-GS 24VDC',
          sparepartId: 'MTC-SP-001',
          keterangan: 'Relay pengganti untuk panel kontrol Mesin Lanyard',
          qty: 10,
          productCategory: 'Electrical',
          reason: 'Banyak relay yang kontaknya mulai aus',
          urgency: 'Normal',
          linkReferences: 'https://tokopedia.com/search?q=Relay+Omron+MY2N-GS+24VDC',
          vendor: 'Mitra Cipta Mandiri',
          harga: 45000,
          nomorPr: 'PR/2026/05/001',
          statusPr: 'APPROVED',
          nomorPo: null,
          statusPo: null,
          isStocked: true,
          tanggalList: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) // 5 hari lalu
        },
        {
          fbIndex: 104,
          originalName: 'Socket Relay PYF08A-E',
          sparepartId: 'MTC-SP-002',
          keterangan: 'Dudukan relay panel mesin lanyard',
          qty: 10,
          productCategory: 'Electrical',
          reason: 'Paket kombinasi dengan Relay Omron',
          urgency: 'Normal',
          linkReferences: 'https://tokopedia.com/search?q=Socket+Relay+PYF08A-E',
          vendor: 'Mitra Cipta Mandiri',
          harga: 15000,
          nomorPr: 'PR/2026/05/001',
          statusPr: 'APPROVED',
          nomorPo: null,
          statusPo: null,
          isStocked: true,
          tanggalList: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) // 5 hari lalu
        }
      ]
    });

    // 🌟 GROUP 3: PO AKTIF (Sedang Dikirim/Diproses) — Nomor PR: PR/2026/05/002, Nomor PO: PO/2026/05/112
    await prisma.procurementTracking.createMany({
      data: [
        {
          fbIndex: 105,
          originalName: 'Proximity Sensor Autonics PR12-4DN',
          sparepartId: 'MTC-SP-003',
          keterangan: 'Sensor metal detector untuk safety pintu Conveyor Liquid',
          qty: 4,
          productCategory: 'Electrical',
          reason: 'Sering pecah terkena benturan botol',
          urgency: 'Urgent',
          linkReferences: 'https://tokopedia.com/search?q=PR12-4DN',
          vendor: 'Global Sensor Utama',
          harga: 285000,
          nomorPr: 'PR/2026/05/002',
          statusPr: 'APPROVED',
          nomorPo: 'PO/2026/05/112',
          statusPo: 'PROCESS',
          isStocked: true,
          tanggalList: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) // 8 hari lalu
        }
      ]
    });

    // 🌟 GROUP 4: RIWAYAT SELESAI (Diterima Lengkap) — Nomor PR: PR/2026/05/003, Nomor PO: PO/2026/05/099
    await prisma.procurementTracking.createMany({
      data: [
        {
          fbIndex: 106,
          originalName: 'Jasa Kalibrasi Mesin Cek Alat Device',
          sparepartId: null,
          keterangan: 'Sertifikasi & kalibrasi tahunan eksternal',
          qty: 1,
          productCategory: 'Services',
          reason: 'Kepatuhan audit standar operasional',
          urgency: 'Normal',
          vendor: 'Balai Kalibrasi Nasional',
          harga: 1500000,
          nomorPr: 'PR/2026/05/003',
          statusPr: 'APPROVED',
          nomorPo: 'PO/2026/05/099',
          statusPo: 'DONE',
          tanggalTerima: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // Diterima kemarin
          isStocked: false, // Jasa non-stok
          tanggalList: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
        }
      ]
    });

    console.log('✅ Berhasil menyisipkan 6 record simulasi dengan kombinasi status berbeda!');
    console.log('\n======================================================');
    console.log('📌 SIMULASI SIAP DIUJI!');
    console.log('------------------------------------------------------');
    console.log('1. Buka halaman Pelacakan SCM di browser Anda.');
    console.log('2. Anda akan langsung melihat 4 grup berbeda dengan aksen warna.');
    console.log('3. Coba lakukan "Terima Barang" pada grup PO Aktif (PO/2026/05/112).');
    console.log('4. Coba lakukan "Push ke PO" pada grup PR Pending SCM.');
    console.log('======================================================\n');

  } catch (err: any) {
    console.error('❌ Gagal menyebarkan data dummy:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
