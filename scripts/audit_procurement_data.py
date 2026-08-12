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

async function run() {
  const allItems = await prisma.procurementTracking.findMany({
    select: { id: true, nomorPr: true, nomorPo: true, originalName: true, sparepartId: true }
  });

  console.log('Total procurement items in DB:', allItems.length);

  // Check exact duplicates (nomorPr + originalName)
  const seen = new Map();
  let duplicateCount = 0;
  const duplicatePairs = [];

  allItems.forEach(item => {
    const key = \`\${(item.nomorPr || '').trim().toUpperCase()}|||\${(item.originalName || '').trim().toLowerCase()}\`;
    if (seen.has(key)) {
      duplicateCount++;
      duplicatePairs.push({ key, existingId: seen.get(key), duplicateId: item.id });
    } else {
      seen.set(key, item.id);
    }
  });

  console.log('Exact duplicates count (nomorPr + originalName):', duplicateCount);

  if (duplicateCount > 0) {
    console.log('Sample duplicates:', JSON.stringify(duplicatePairs.slice(0, 5), null, 2));
  }

  // Check invalid/null originalNames
  const emptyNames = allItems.filter(i => !i.originalName || !i.originalName.trim());
  console.log('Items with empty/null originalName:', emptyNames.length);
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
