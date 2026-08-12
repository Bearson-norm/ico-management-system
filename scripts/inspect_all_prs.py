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
  const prs = await prisma.procurementTracking.findMany({
    select: { id: true, nomorPr: true, nomorPo: true, originalName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  console.log('Latest 30 Procurement Records in VPS DB:');
  prs.forEach(p => {
    console.log(\`ID: \${p.id} | PR: \${p.nomorPr || 'NULL'} | PO: \${p.nomorPo || 'NULL'} | Name: \${p.originalName}\`);
  });

  // Also search Spareparts for purchasingNoPr
  const spPrs = await prisma.sparepart.findMany({
    where: { NOT: { purchasingNoPr: null } },
    select: { id: true, nama: true, purchasingNoPr: true, purchasingNoPo: true }
  });
  console.log('\\nSpareparts with purchasingNoPr:', spPrs.length);
  spPrs.forEach(sp => {
    console.log(\`[\${sp.id}] \${sp.nama} | PR: \${sp.purchasingNoPr} | PO: \${sp.purchasingNoPo}\`);
  });
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
