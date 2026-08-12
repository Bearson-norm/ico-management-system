import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

cmd = """node -e "
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

const GENERIC_NAMES = [
  'EQUIPMENT', 'SPAREPARTS USAGE', 'SUPPLIES', 'FACTORY SUPPLIES', 'Barang GA', 'Produk Tanpa Nama',
  'REPAIR AND MAINTENANCE', 'REPAIR & MAINTENANCE', 'OVERHEADS', 'OVERHEAD', 'OVERHEAD EXPENSE',
  'UTILITY', 'UTILITIES', 'DIRECT EXPENSE', 'CONSUMABLES', 'CONSUMABLE', 'SUPPLIES FACTORY RELATED'
];

async function run() {
  const items = await prisma.procurementTracking.findMany({
    include: { sparepart: true }
  });

  console.log('Total items in DB:', items.length);

  // 1. Generic names check
  const genericItems = items.filter(i => {
    const name = (i.originalName || '').trim().toUpperCase();
    return GENERIC_NAMES.includes(name);
  });
  console.log('1. Generic names count:', genericItems.length);
  if (genericItems.length > 0) {
    console.log('   Generic items sample:', JSON.stringify(genericItems.slice(0, 5).map(g => ({ id: g.id, pr: g.nomorPr, name: g.originalName })), null, 2));
  }

  // 2. Double/Duplicate rows check
  const map = new Map();
  let doubleCount = 0;
  items.forEach(i => {
    const key = \`\${(i.nomorPr || '').trim().toUpperCase()}|||\${(i.originalName || '').trim().toLowerCase()}\`;
    if (map.has(key)) {
      doubleCount++;
    } else {
      map.set(key, i.id);
    }
  });
  console.log('2. Double/Duplicate rows count:', doubleCount);

  // 3. Linked Sparepart integrity check
  const linkedItems = items.filter(i => i.sparepartId !== null);
  console.log('3. Linked sparepart items count:', linkedItems.length);
  const brokenLinks = linkedItems.filter(i => !i.sparepart);
  console.log('   Broken links count:', brokenLinks.length);

  // 4. GR Link & Received items check
  const grItems = items.filter(i => !!i.linkGr);
  console.log('4. Items with GR links count:', grItems.length);

  // Check unique GR links
  const grUrls = grItems.map(i => i.linkGr).filter(Boolean);
  const uniqueGrUrls = new Set(grUrls);
  console.log('   Unique GR links count:', uniqueGrUrls.size);
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
