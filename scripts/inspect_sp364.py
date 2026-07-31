import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = '''DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();

async function main() {
  const sp = await prisma.sparepart.findFirst({
    where: { OR: [{ id: 'MTC-SP-364' }, { nama: { contains: 'Roll label', mode: 'insensitive' } }] },
    include: { procurementTrackings: true }
  });
  console.log('Sparepart MTC-SP-364:', JSON.stringify(sp, null, 2));

  const trackingMatch = await prisma.procurementTracking.findMany({
    where: { originalName: { contains: 'Roll label', mode: 'insensitive' } }
  });
  console.log('ProcurementTracking matching Roll label:', JSON.stringify(trackingMatch, null, 2));
}

main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("STDOUT:", out)
if err: print("STDERR:", err)
ssh.close()
