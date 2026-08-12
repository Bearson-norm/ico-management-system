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
  const originalCount = await prisma.procurementTracking.count({ where: { id: { lte: 162 } } });
  const newCount = await prisma.procurementTracking.count({ where: { id: { gt: 162 } } });

  console.log('Original items (ID <= 162):', originalCount);
  console.log('Newly mass imported items (ID > 162):', newCount);

  const newItems = await prisma.procurementTracking.findMany({
    where: { id: { gt: 162 } },
    select: { id: true, nomorPr: true, nomorPo: true, originalName: true },
    take: 10
  });

  console.log('Sample new items:', JSON.stringify(newItems, null, 2));
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
