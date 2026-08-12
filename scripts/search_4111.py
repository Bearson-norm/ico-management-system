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
  const allPrs = await prisma.procurementTracking.findMany({
    select: { id: true, nomorPr: true, nomorPo: true, originalName: true }
  });

  const matches = allPrs.filter(p => {
    const pr = (p.nomorPr || '').toLowerCase();
    const po = (p.nomorPo || '').toLowerCase();
    const name = (p.originalName || '').toLowerCase();
    return pr.includes('411') || po.includes('411') || name.includes('411');
  });

  console.log('Matches for 411 in DB:', matches.length);
  console.log(JSON.stringify(matches, null, 2));
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
