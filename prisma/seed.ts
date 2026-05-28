import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';
import bcrypt from 'bcryptjs';

const prisma = new MtcPrisma();
const prismaGa = new GaPrisma();

async function main() {
  console.log('🌱 Seeding MTC database...');

  const counters = [
    { tipe: 'CM', count: 0 },
    { tipe: 'PM', count: 0 },
    { tipe: 'OH', count: 0 },
  ];
  for (const c of counters) {
    await prisma.reportCounter.upsert({
      where: { tipe: c.tipe },
      update: {},
      create: c,
    });
  }

  const hash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: hash,
      namaLengkap: 'Administrator',
      role: 'editor',
    },
  });
  console.log('✅ MTC user admin (password: admin123) — SEGERA GANTI!');

  const kategoris = [
    { nama: 'Electrical', tipe: 'sparepart' },
    { nama: 'Mechanical', tipe: 'sparepart' },
    { nama: 'Consumable', tipe: 'sparepart' },
    { nama: 'Hydraulic', tipe: 'sparepart' },
    { nama: 'Pneumatic', tipe: 'sparepart' },
    { nama: 'Corrective', tipe: 'maintenance' },
    { nama: 'Preventive', tipe: 'maintenance' },
    { nama: 'Improvement', tipe: 'maintenance' },
  ];
  for (const k of kategoris) {
    await prisma.kategori.upsert({
      where: { nama: k.nama },
      update: {},
      create: k,
    });
  }

  const teknisis = ['Budi Santoso', 'Agus Pratama', 'Citra Kirana'];
  for (const t of teknisis) {
    await prisma.teknisi.upsert({ where: { nama: t }, update: {}, create: { nama: t } });
  }

  const mesins = [
    { nama: 'Mesin Press 100T', area: 'Line A' },
    { nama: 'Mesin CNC Milling', area: 'Line B' },
    { nama: 'Conveyor Utama', area: 'Gudang' },
  ];
  for (const m of mesins) {
    await prisma.mesin.upsert({ where: { nama: m.nama }, update: {}, create: m });
  }

  const mechKat = await prisma.kategori.findUnique({ where: { nama: 'Mechanical' } });
  const elecKat = await prisma.kategori.findUnique({ where: { nama: 'Electrical' } });
  const consKat = await prisma.kategori.findUnique({ where: { nama: 'Consumable' } });

  const dummyParts = [
    { id: 'MTC-SP-001', nama: 'Bearing SKF 6205', kategoriId: mechKat?.id, uom: 'Pcs', lokasi: '1-A-1-1', harga: 50000, minQty: 2 },
    { id: 'MTC-SP-002', nama: 'O-Ring NBR 20mm', kategoriId: consKat?.id, uom: 'Pcs', lokasi: '1-A-1-2', harga: 5000, minQty: 10 },
    { id: 'MTC-SP-003', nama: 'V-Belt Mitsuboshi B42', kategoriId: mechKat?.id, uom: 'Pcs', lokasi: '1-B-2-1', harga: 120000, minQty: 1 },
    { id: 'MTC-SP-004', nama: 'Sensor Proximity M12', kategoriId: elecKat?.id, uom: 'Pcs', lokasi: '2-A-3-4', harga: 350000, minQty: 1 },
    { id: 'MTC-SP-005', nama: 'Contactor Schneider 3P', kategoriId: elecKat?.id, uom: 'Pcs', lokasi: '2-B-1-1', harga: 450000, minQty: 2 },
  ];

  for (const p of dummyParts) {
    await prisma.sparepart.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });

    const existingMov = await prisma.stockMovement.findFirst({ where: { sparepartId: p.id, tipe: 'IN' } });
    if (!existingMov) {
      await prisma.stockMovement.create({
        data: {
          tipe: 'IN',
          sparepartId: p.id,
          namaItem: p.nama,
          qty: 15,
          harga: p.harga,
          lokasi: p.lokasi,
          keterangan: 'Initial Dummy Stock',
          purchaseType: 'Restock',
          vendor: 'PT Makmur Jaya',
        },
      });
    }
  }

  const existingReport = await prisma.maintenanceReport.findUnique({ where: { noReport: 'CM-0001' } });
  if (!existingReport) {
    const m1 = await prisma.mesin.findUnique({ where: { nama: 'Mesin Press 100T' } });
    const t1 = await prisma.teknisi.findUnique({ where: { nama: 'Budi Santoso' } });
    const repKat = await prisma.kategori.findUnique({ where: { nama: 'Corrective' } });

    if (m1 && t1) {
      await prisma.maintenanceReport.create({
        data: {
          noReport: 'CM-0001',
          tipe: 'CM',
          tanggal: new Date(),
          startTime: '08:00',
          finishTime: '09:30',
          durasiMenit: 90,
          shift: 1,
          mesinId: m1.id,
          keluhan: 'Mesin berbunyi kasar saat pressing',
          issue: 'Bearing utama aus',
          actionTaken: 'Melakukan penggantian bearing SKF 6205',
          kategoriId: repKat?.id,
          picId: t1.id,
        },
      });
      const sp = await prisma.sparepart.findUnique({ where: { id: 'MTC-SP-001' } });
      if (sp) {
        await prisma.stockMovement.create({
          data: {
            tipe: 'OUT',
            sparepartId: sp.id,
            namaItem: sp.nama,
            qty: 2,
            harga: sp.harga,
            lokasi: sp.lokasi ?? '',
            picId: t1.id,
            noReport: 'CM-0001',
            keterangan: 'Dipakai untuk mesin press',
          },
        });
      }
      await prisma.reportCounter.update({ where: { tipe: 'CM' }, data: { count: 1 } });
    }
  }

  console.log('🌱 Seeding GA database...');
  const gaHash = await bcrypt.hash('gaadmin123', 12);
  await prismaGa.user.upsert({
    where: { username: 'gaadmin' },
    update: {},
    create: {
      username: 'gaadmin',
      passwordHash: gaHash,
      namaLengkap: 'GA Administrator',
      role: 'editor',
    },
  });
  await prismaGa.kategori.upsert({
    where: { nama: 'Umum' },
    update: {},
    create: { nama: 'Umum' },
  });
  console.log('✅ GA user gaadmin (password: gaadmin123) — SEGERA GANTI!');

  console.log('\n🎉 Seed selesai!');
  console.log('   MTC: admin / admin123');
  console.log('   GA:  gaadmin / gaadmin123\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await prismaGa.$disconnect();
  });
