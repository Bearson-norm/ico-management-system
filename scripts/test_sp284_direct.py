import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = """
cd /var/www/ico-management-system && \
npx ts-node --project tsconfig.scripts.json --transpile-only -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function test() {
  const sp = await prisma.sparepart.findUnique({
    where: { id: 'MTC-SP-284' },
    include: {
      movements: {
        where: {
          tipe: { in: ['IN', 'OUT'] },
          OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }]
        },
        select: { tipe: true, qty: true }
      }
    }
  });
  console.log('=== MTC-SP-284 PRISMA QUERY RESULT ===');
  console.log(JSON.stringify(sp, null, 2));
  if (sp) {
    const totalIn = sp.movements.filter((m: any) => m.tipe === 'IN').reduce((s: any, m: any) => s + m.qty, 0);
    const totalOut = sp.movements.filter((m: any) => m.tipe === 'OUT').reduce((s: any, m: any) => s + m.qty, 0);
    console.log('totalIn:', totalIn, 'totalOut:', totalOut, 'currentStock:', totalIn - totalOut);
  }
}
test().then(() => process.exit(0));
"
"""

_, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err and 'Environment variables' not in err:
    print("ERR:", err[:300])

ssh.close()
