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
  const items = await prisma.procurementTracking.findMany();
  console.log('Total items in MTC:', items.length);

  // Group by (nomorPr or nomorPo) + cleanOriginalName
  const map = new Map();

  for (const item of items) {
    const prKey = item.nomorPr ? item.nomorPr.trim().toUpperCase() : '';
    const poKey = item.nomorPo ? item.nomorPo.trim().toUpperCase() : '';
    const docKey = prKey || poKey || 'NO_DOC';
    const nameKey = item.originalName ? item.originalName.trim().toUpperCase() : '';
    
    if (!nameKey || docKey === 'NO_DOC') continue;

    const groupKey = docKey + '::' + nameKey;
    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey).push(item);
  }

  let deletedCount = 0;
  for (const [key, group] of map.entries()) {
    if (group.length > 1) {
      console.log('Found duplicate group ' + key + ' (' + group.length + ' items)');
      
      // Sort: prefer record with sparepartId, or higher harga, or higher ID
      group.sort((a, b) => {
        if (a.sparepartId && !b.sparepartId) return -1;
        if (!a.sparepartId && b.sparepartId) return 1;
        const hargaA = Number(a.harga) || 0;
        const hargaB = Number(b.harga) || 0;
        if (hargaA !== hargaB) return hargaB - hargaA;
        return a.id - b.id;
      });

      const master = group[0];
      const duplicates = group.slice(1);

      for (const dup of duplicates) {
        console.log('  Deleting duplicate ID ' + dup.id + ' (keeping master ID ' + master.id + ')');
        await prisma.procurementTracking.delete({
          where: { id: dup.id }
        });
        deletedCount++;
      }
    }
  }

  console.log('✓ Successfully cleaned up ' + deletedCount + ' duplicate records!');
}

main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("STDOUT:", out)
if err: print("STDERR:", err)
ssh.close()
