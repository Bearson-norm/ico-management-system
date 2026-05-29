import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';
import bcrypt from 'bcryptjs';
import { flushMtcDatabase, flushGaDatabase } from '../lib/db/flush';

const prisma = new MtcPrisma();
const prismaGa = new GaPrisma();

async function main() {
  console.log('🗑️  Mengosongkan database...');
  await flushMtcDatabase(prisma, { keepUsers: false });
  await flushGaDatabase(prismaGa, { keepUsers: false });
  console.log('✅ Database berhasil dikosongkan!');

  console.log('🌱 Menjalankan seeding bersih (tanpa data dummy)...');

  // Seed MTC Report Counters
  const counters = [
    { tipe: 'CM', count: 0 },
    { tipe: 'PM', count: 0 },
    { tipe: 'OH', count: 0 },
  ];
  for (const c of counters) {
    await prisma.reportCounter.create({ data: c });
  }
  console.log('✅ MTC Report Counters berhasil dibuat');

  // Seed MTC Admin User
  const hash = await bcrypt.hash('admin123', 12);
  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: hash,
      namaLengkap: 'Administrator',
      role: 'editor',
    },
  });
  console.log('✅ MTC Admin User dibuat: admin / admin123');

  // Seed GA Admin User
  const gaHash = await bcrypt.hash('gaadmin123', 12);
  await prismaGa.user.create({
    data: {
      username: 'gaadmin',
      passwordHash: gaHash,
      namaLengkap: 'GA Administrator',
      role: 'editor',
    },
  });
  console.log('✅ GA Admin User dibuat: gaadmin / gaadmin123');

  // Seed GA default category (required by the GA system)
  await prismaGa.kategori.create({
    data: { nama: 'Umum' }
  });
  console.log('✅ GA Kategori default dibuat');

  console.log('\n🎉 Database BERHASIL DI-RESET BERSIH (TANPA DATA DUMMY)!');
  console.log('👉 Silakan login di http://localhost:3000/mtc/login');
  console.log('   Username: admin | Password: admin123\n');
}

main()
  .catch((e) => {
    console.error('❌ Gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await prismaGa.$disconnect();
  });
