/**
 * Promosikan user GA menjadi administrator.
 * Usage: node scripts/promote-ga-admin.js <username>
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const root = path.join(__dirname, '..');
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;
      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv();
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node scripts/promote-ga-admin.js <username>');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL_GA) {
    console.error('DATABASE_URL_GA tidak ditemukan di .env');
    process.exit(1);
  }

  const { PrismaClient } = require('../lib/generated/ga');
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      console.error(`User GA "${username}" tidak ditemukan.`);
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { username },
      data: { role: 'administrator', aktif: true },
    });

    console.log('User GA dipromosikan menjadi administrator:');
    console.log(`  ID       : ${updated.id}`);
    console.log(`  Username : ${updated.username}`);
    console.log(`  Nama     : ${updated.namaLengkap}`);
    console.log(`  Role     : ${updated.role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Gagal:', e.message || e);
  process.exit(1);
});
