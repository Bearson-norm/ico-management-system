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
  const duplicatesToDelete = [158, 109, 52, 51, 159];
  const deleted = await prisma.procurementTracking.deleteMany({
    where: { id: { in: duplicatesToDelete } }
  });
  console.log(\`Successfully cleaned up \${deleted.count} duplicate rows!\`);
  console.log('Total items in DB NOW:', await prisma.procurementTracking.count());
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
