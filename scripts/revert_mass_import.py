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
  console.log('Reverting mass imported procurement records (ID >= 168)...');
  const deleted = await prisma.procurementTracking.deleteMany({
    where: { id: { gte: 168 } }
  });

  const remaining = await prisma.procurementTracking.count();
  console.log(\`Successfully deleted \${deleted.count} mass-imported records. Database is RESTORED back to \${remaining} pristine items!\`);
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
