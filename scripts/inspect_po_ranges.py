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
  const allPos = await prisma.procurementTracking.findMany({
    where: { NOT: { nomorPo: null } },
    select: { nomorPo: true, nomorPr: true, originalName: true, createdAt: true },
    orderBy: { nomorPo: 'asc' }
  });

  console.log('Total Procurement items with PO in DB:', allPos.length);
  const poNumbers = Array.from(new Set(allPos.map(p => p.nomorPo))).filter(Boolean);
  console.log('All unique PO numbers in DB:', poNumbers);
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
