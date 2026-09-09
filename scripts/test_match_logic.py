import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function check() {
  const nullItems = await prisma.procurementTracking.findMany({
    where: {
      tanggalTerima: null,
      sparepartId: { not: null }
    }
  });

  for (const item of nullItems) {
    let physicalMovement = await prisma.stockMovement.findFirst({
      where: {
        OR: [
          { keterangan: { contains: `[Penerimaan Pengadaan #${item.id}` } },
          { keterangan: { contains: `[Penerimaan Paket #${item.id}` } },
        ]
      },
      orderBy: { id: 'desc' }
    });

    if (!physicalMovement && item.sparepartId && (item.nomorPo || item.nomorPr)) {
      const legacyMov = await prisma.stockMovement.findFirst({
        where: {
          sparepartId: item.sparepartId,
          tipe: { in: ['IN', 'LOG'] },
          ...(item.nomorPo ? { keterangan: { contains: `PO: ${item.nomorPo}` } } : {}),
          ...(item.nomorPr ? { keterangan: { contains: `PR: ${item.nomorPr}` } } : {})
        },
        orderBy: { id: 'desc' }
      });
      if (legacyMov && !legacyMov.keterangan.includes('[Penerimaan Pengadaan #') && !legacyMov.keterangan.includes('[Penerimaan Paket #')) {
        physicalMovement = legacyMov;
      }
    }

    if (physicalMovement) {
      console.log(`MATCHED: Proc #${item.id} (${item.originalName}) -> Mov #${physicalMovement.id}, Qty: ${physicalMovement.qty}, Date: ${physicalMovement.tanggal}`);
    } else {
      if (item.nomorPr === 'PR04674' || item.nomorPr === 'PR04699') {
        console.log(`UNMATCHED (Expected for pending): Proc #${item.id} (${item.originalName})`);
      }
    }
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/test_match_logic.js', 'w') as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('node /tmp/test_match_logic.js')
print(stdout.read().decode('utf-8'))
ssh.close()
