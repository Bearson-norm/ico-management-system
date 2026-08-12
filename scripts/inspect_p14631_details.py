import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      OR: [
        { nomorPo: 'P14631' },
        { originalName: { contains: 'Gerinda', mode: 'insensitive' } }
      ]
    },
    take: 30
  });
  console.log('Sample of 30 items for P14631:');
  for (const i of items) {
    console.log(JSON.stringify({ id: i.id, pr: i.nomorPr, po: i.nomorPo, name: i.originalName, qty: i.qty, harga: i.harga, sheetId: i.sheetId, createdAt: i.createdAt }));
  }
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
