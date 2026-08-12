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
  const count = await prisma.procurementTracking.count();
  console.log('Total Procurement Tracking Records in DB NOW:', count);

  const poCount = await prisma.procurementTracking.count({ where: { NOT: { nomorPo: null } } });
  console.log('Total Records with PO Number:', poCount);

  const prCount = await prisma.procurementTracking.count({ where: { NOT: { nomorPr: null } } });
  console.log('Total Records with PR Number:', prCount);

  const sample = await prisma.procurementTracking.findMany({
    select: { id: true, nomorPr: true, nomorPo: true, originalName: true, vendor: true },
    orderBy: { id: 'desc' },
    take: 10
  });
  console.log('Sample Latest Imported Items:', JSON.stringify(sample, null, 2));
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
