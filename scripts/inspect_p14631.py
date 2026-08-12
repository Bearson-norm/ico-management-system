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
    }
  });
  console.log('Found', items.length, 'items matching P14631 / Gerinda:');
  items.forEach(i => {
    console.log(`  - [ID:${i.id}] PR:${i.nomorPr} | PO:${i.nomorPo} | TE:${i.nomorTe} | Name:'${i.originalName}' | Qty:${i.qty} | Price:${i.harga} | SheetId:${i.sheetId || 'N/A'}`);
  });
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
