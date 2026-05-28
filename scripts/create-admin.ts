/**
 * Buat user admin MTC di database lokal (tanpa seed data dummy).
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/create-admin.ts
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

async function main() {
  tryLoadRootEnv();
  const prisma = new PrismaClient();

  try {
    // Buat counter report jika belum ada
    for (const tipe of ['CM', 'PM', 'OH']) {
      await prisma.reportCounter.upsert({
        where: { tipe },
        update: {},
        create: { tipe, count: 0 },
      });
    }

    // Buat user admin
    const hash = await bcrypt.hash('admin123', 12);
    const user = await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        passwordHash: hash,
        namaLengkap: 'Administrator',
        role: 'editor',
      },
    });

    console.log('✅ User admin berhasil dibuat!');
    console.log(`   Username : admin`);
    console.log(`   Password : admin123`);
    console.log(`   Role     : editor`);
    console.log(`   ID       : ${user.id}`);
    console.log('\n👉 Silakan login di http://localhost:3000/mtc/login');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Gagal:', e.message);
  process.exit(1);
});
