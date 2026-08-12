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
  const prMatch = await prisma.procurementTracking.findMany({
    where: {
      OR: [
        { nomorPr: { contains: '0411', mode: 'insensitive' } },
        { nomorPr: { contains: '411', mode: 'insensitive' } },
        { originalName: { contains: '0411', mode: 'insensitive' } },
        { nomorPo: { contains: '0411', mode: 'insensitive' } }
      ]
    },
    include: { sparepart: true }
  });

  console.log('Matches for 0411 in VPS DB:', prMatch.length);
  console.log(JSON.stringify(prMatch, null, 2));
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
