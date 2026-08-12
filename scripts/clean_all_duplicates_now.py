import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();

function cleanName(n) {
  if (!n) return '';
  return n.toLowerCase().replace(/[^\\w\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
}

async function main() {
  const allItems = await prisma.procurementTracking.findMany({
    orderBy: { id: 'asc' }
  });
  console.log('Total items in MTC before cleanup:', allItems.length);

  // Group by (nomorPr || nomorPo || 'NODOC') + cleanName
  const map = new Map();

  for (const item of allItems) {
    const prKey = item.nomorPr ? item.nomorPr.trim().toUpperCase() : '';
    const poKey = item.nomorPo ? item.nomorPo.trim().toUpperCase() : '';
    const docKey = prKey || poKey || 'NODOC';
    const nameKey = cleanName(item.originalName);
    
    if (!nameKey) continue;

    const groupKey = docKey + ':::' + nameKey;
    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey).push(item);
  }

  const deleteIds = [];

  for (const [key, group] of map.entries()) {
    if (group.length > 1) {
      // Sort to select the best master item
      group.sort((a, b) => {
        // 1. Prefer item with sparepartId
        const aSp = a.sparepartId ? 1 : 0;
        const bSp = b.sparepartId ? 1 : 0;
        if (aSp !== bSp) return bSp - aSp;

        // 2. Prefer item with DONE statusPo
        const aDone = a.statusPo === 'DONE' ? 1 : 0;
        const bDone = b.statusPo === 'DONE' ? 1 : 0;
        if (aDone !== bDone) return bDone - aDone;

        // 3. Prefer item with PO number
        const aPo = a.nomorPo ? 1 : 0;
        const bPo = b.nomorPo ? 1 : 0;
        if (aPo !== bPo) return bPo - aPo;

        // 4. Prefer item with sheetId
        const aSheet = a.sheetId ? 1 : 0;
        const bSheet = b.sheetId ? 1 : 0;
        if (aSheet !== bSheet) return bSheet - aSheet;

        // 5. Older ID first
        return a.id - b.id;
      });

      const master = group[0];
      const duplicates = group.slice(1);
      for (const dup of duplicates) {
        deleteIds.push(dup.id);
      }
    }
  }

  console.log('Found', deleteIds.length, 'duplicate records to delete across', map.size, 'unique item groups.');

  if (deleteIds.length > 0) {
    // Delete in chunks of 500
    const chunkSize = 500;
    let deletedTotal = 0;
    for (let i = 0; i < deleteIds.length; i += chunkSize) {
      const chunk = deleteIds.slice(i, i + chunkSize);
      const res = await prisma.procurementTracking.deleteMany({
        where: { id: { in: chunk } }
      });
      deletedTotal += res.count;
    }
    console.log('✓ Successfully deleted', deletedTotal, 'duplicate records from database!');
  } else {
    console.log('No duplicate records found.');
  }

  const remaining = await prisma.procurementTracking.count();
  console.log('Total items in MTC after cleanup:', remaining);
}

main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
