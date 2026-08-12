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
  const poMatch = await prisma.procurementTracking.findMany({
    where: {
      OR: [
        { nomorPo: { contains: '13734', mode: 'insensitive' } },
        { nomorPo: { contains: '1373', mode: 'insensitive' } },
        { nomorPr: { contains: '13734', mode: 'insensitive' } },
        { originalName: { contains: '13734', mode: 'insensitive' } }
      ]
    },
    include: { sparepart: true }
  });

  console.log('Matches for 13734 in VPS DB:', poMatch.length);
  console.log(JSON.stringify(poMatch, null, 2));

  // Search PO in Sparepart
  const spMatch = await prisma.sparepart.findMany({
    where: {
      OR: [
        { purchasingNoPo: { contains: '13734', mode: 'insensitive' } },
        { purchasingNoPr: { contains: '13734', mode: 'insensitive' } }
      ]
    }
  });
  console.log('\\nSpareparts matching 13734:', spMatch.length);
  console.log(JSON.stringify(spMatch, null, 2));

  // Search PO numbers around P1373...
  const posAround = await prisma.procurementTracking.findMany({
    where: {
      nomorPo: { contains: 'P137', mode: 'insensitive' }
    },
    select: { id: true, nomorPr: true, nomorPo: true, originalName: true }
  });
  console.log('\\nPO numbers containing P137 in VPS DB:', posAround.length);
  console.log(JSON.stringify(posAround, null, 2));
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
