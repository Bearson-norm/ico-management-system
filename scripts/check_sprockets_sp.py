import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function check() {
  const items = await prisma.procurementTracking.findMany({
    where: { id: { in: [140, 1999, 141, 2000] } },
    select: { id: true, sparepartId: true, originalName: true, qty: true, tanggalTerima: true }
  });
  console.log('PR04674 Items:', JSON.stringify(items, null, 2));

  const spIds = items.map(i => i.sparepartId).filter(Boolean);
  const sps = await prisma.sparepart.findMany({
    where: { id: { in: spIds } },
    select: { id: true, nama: true, purchasingStatus: true, purchasingQty: true, purchasingNoPo: true }
  });
  console.log('PR04674 Spareparts:', JSON.stringify(sps, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/check_sprockets.js', 'w') as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('node /tmp/check_sprockets.js')
print(stdout.read().decode('utf-8'))
ssh.close()
