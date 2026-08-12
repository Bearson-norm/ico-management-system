import sys, paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

# Trigger sync
print("1. Triggering Odoo sync on VPS...")
stdin, stdout, stderr = ssh.exec_command('curl -s -X POST "http://127.0.0.1:1325/api/mtc/odoo/sync" -H "Content-Type: application/json"')
res = stdout.read().decode('utf-8', errors='ignore')
print("Sync Response:", res[:500])

# Inspect P14547 in DB after sync
print("\n2. Inspecting P14547 in VPS DB after sync...")
cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: { nomorPo: 'P14547' }
  });
  items.forEach(i => console.log(`[ID:${i.id}] Name:'${i.originalName}' | statusPr:${i.statusPr} | statusPo:${i.statusPo} | tanggalTerima:${i.tanggalTerima} | linkGr:${i.linkGr}`));
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin2, stdout2, stderr2 = ssh.exec_command(cmd)
print(stdout2.read().decode('utf-8', errors='ignore'))
ssh.close()
