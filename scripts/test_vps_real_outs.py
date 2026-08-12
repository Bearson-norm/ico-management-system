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
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const rawOut = await prisma.stockMovement.findMany({
    where: {
      tipe: 'OUT',
      NOT: { sparepartId: null },
      tanggal: { gte: thirtyDaysAgo },
    },
    select: { sparepartId: true, namaItem: true, qty: true, purchaseType: true, keterangan: true }
  });

  const realOut = rawOut.filter(m => {
    const pType = (m.purchaseType || '').toLowerCase();
    if (pType.includes('histori') || pType.includes('opname') || pType.includes('adjust')) return false;

    const ket = (m.keterangan || '').toLowerCase();
    if (
      ket.includes('[opname]') ||
      ket.includes('opname adjustment') ||
      ket.includes('hasil audit') ||
      ket.includes('[adjust') ||
      ket.includes('histori-sheets')
    ) {
      return false;
    }
    return true;
  });

  const aggregatedMap = new Map();
  realOut.forEach((m) => {
    const spId = m.sparepartId;
    const existing = aggregatedMap.get(spId) || { sparepartId: spId, namaItem: m.namaItem, totalQty: 0, txCount: 0 };
    existing.totalQty += m.qty;
    existing.txCount += 1;
    aggregatedMap.set(spId, existing);
  });

  const topReal = Array.from(aggregatedMap.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, 10);

  console.log('REAL MAINTENANCE OUT MOVEMENTS (EXCLUDING OPNAME & HISTORI-SHEETS):');
  console.log(JSON.stringify(topReal, null, 2));
}

run().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
