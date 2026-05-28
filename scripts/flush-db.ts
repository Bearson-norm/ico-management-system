/**
 * Kosongkan database MTC dan/atau GA sebelum impor ulang.
 *
 * Usage:
 *   npm run flush:db -- --mtc --confirm
 *   npm run flush:db -- --ga --confirm
 *   npm run flush:db -- --all --confirm
 *   npm run flush:db -- --mtc --confirm --keep-users
 *   npm run flush:db -- --all --confirm --seed
 *
 * Environment: DATABASE_URL_MTC, DATABASE_URL_GA (dari .env / .env.local)
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';
import { flushMtcDatabase, flushGaDatabase } from '../lib/db/flush';

const root = path.resolve(__dirname, '..');

function tryLoadRootEnv() {
  if (process.env.DATABASE_URL_MTC && process.env.DATABASE_URL_GA) return;
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
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function maskDbUrl(url: string | undefined): string {
  if (!url) return '(tidak diset)';
  try {
    const u = new URL(url);
    const db = u.pathname.replace(/^\//, '') || u.searchParams.get('schema') || '?';
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}/${db}`;
  } catch {
    return '(URL tidak valid)';
  }
}

type Tenant = 'mtc' | 'ga' | 'all';

function parseArgs(argv: string[]) {
  let tenant: Tenant | null = null;
  let confirm = false;
  let keepUsers = false;
  let seed = false;

  for (const a of argv) {
    if (a === '--mtc') tenant = tenant === 'ga' ? 'all' : tenant === null ? 'mtc' : 'all';
    else if (a === '--ga') tenant = tenant === 'mtc' ? 'all' : tenant === null ? 'ga' : 'all';
    else if (a === '--all') tenant = 'all';
    else if (a === '--confirm' || a === '-y' || a === '--yes') confirm = true;
    else if (a === '--keep-users') keepUsers = true;
    else if (a === '--seed') seed = true;
    else if (a === '--help' || a === '-h') {
      console.log(`
Kosongkan database sebelum impor / reset data.

Opsi:
  --mtc          Hanya database MTC (DATABASE_URL_MTC)
  --ga           Hanya database GA (DATABASE_URL_GA)
  --all          Keduanya (default jika tidak ada flag tenant)
  --confirm      Wajib — tanpa ini script tidak jalan
  --keep-users   User login tidak dihapus (admin tetap ada)
  --seed         Jalankan npm run seed setelah flush

Contoh:
  npm run flush:db -- --mtc --confirm
  npm run flush:db -- --all --confirm --seed
`);
      process.exit(0);
    } else {
      console.error('Argumen tidak dikenal:', a);
      process.exit(1);
    }
  }

  if (!tenant) tenant = 'all';
  return { tenant, confirm, keepUsers, seed };
}

async function main() {
  tryLoadRootEnv();

  const { tenant, confirm, keepUsers, seed } = parseArgs(process.argv.slice(2));

  if (!confirm) {
    console.error(
      '⚠️  Perintah berbahaya: semua data pada database target akan dihapus.\n' +
        '    Tambahkan --confirm untuk melanjutkan.\n' +
        '    Contoh: npm run flush:db -- --mtc --confirm'
    );
    process.exit(1);
  }

  const runMtc = tenant === 'mtc' || tenant === 'all';
  const runGa = tenant === 'ga' || tenant === 'all';

  if (runMtc && !process.env.DATABASE_URL_MTC) {
    console.error('DATABASE_URL_MTC belum diset di .env');
    process.exit(1);
  }
  if (runGa && !process.env.DATABASE_URL_GA) {
    console.error('DATABASE_URL_GA belum diset di .env');
    process.exit(1);
  }

  console.log('🗑️  Flush database');
  console.log('   Target:', tenant);
  console.log('   Keep users:', keepUsers ? 'ya' : 'tidak');

  if (runMtc) {
    console.log('   MTC DB:', maskDbUrl(process.env.DATABASE_URL_MTC));
    const prisma = new MtcPrisma();
    try {
      await flushMtcDatabase(prisma, { keepUsers });
      console.log('✅ MTC: stock, report, master, counter dikosongkan' + (keepUsers ? ' (users tetap)' : ' (termasuk users)'));
    } finally {
      await prisma.$disconnect();
    }
  }

  if (runGa) {
    console.log('   GA DB:', maskDbUrl(process.env.DATABASE_URL_GA));
    const prismaGa = new GaPrisma();
    try {
      await flushGaDatabase(prismaGa, { keepUsers });
      console.log('✅ GA: stok, item, kategori, opname dikosongkan' + (keepUsers ? ' (users tetap)' : ' (termasuk users)'));
    } finally {
      await prismaGa.$disconnect();
    }
  }

  if (seed) {
    console.log('\n🌱 Menjalankan seed...');
    execSync('npm run seed', { cwd: root, stdio: 'inherit' });
  }

  console.log('\nSelesai.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
