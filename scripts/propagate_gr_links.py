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
  console.log('Propagating GR links within PR and PO groups...');
  
  const allItems = await prisma.procurementTracking.findMany();
  
  // Map PR -> GR link and PO -> GR link
  const prGrMap = new Map();
  const poGrMap = new Map();

  allItems.forEach(i => {
    if (i.linkGr) {
      if (i.nomorPr) prGrMap.set(i.nomorPr, i.linkGr);
      if (i.nomorPo) poGrMap.set(i.nomorPo, i.linkGr);
    }
  });

  let updatedCount = 0;

  for (const item of allItems) {
    if (!item.linkGr) {
      const inheritedGr = (item.nomorPr && prGrMap.get(item.nomorPr)) || (item.nomorPo && poGrMap.get(item.nomorPo)) || null;
      if (inheritedGr) {
        await prisma.procurementTracking.update({
          where: { id: item.id },
          data: { linkGr: inheritedGr }
        });
        updatedCount++;
      }
    }
  }

  console.log(\`Successfully updated \${updatedCount} items with inherited GR links from their PR/PO group!\`);
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
