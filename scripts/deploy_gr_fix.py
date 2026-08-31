import paramiko
import os

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

def run_cmd(cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out

# 1. Upload updated app/api/mtc/odoo/sync/route.ts to VPS
local_route = os.path.join(os.getcwd(), 'app', 'api', 'mtc', 'odoo', 'sync', 'route.ts')
remote_route = '/var/www/ico-management-system/app/api/mtc/odoo/sync/route.ts'

print(f"Uploading {local_route} to VPS {remote_route}...")
sftp = ssh.open_sftp()
sftp.put(local_route, remote_route)
sftp.close()
print("Upload complete!")

# 2. Fix the 6 false-positive records in DB
fix_sql = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function main() {
  const ids = [148, 150, 151, 35, 821, 982];
  console.log("Fixing false positive GR items in DB:", ids);
  
  for (const id of ids) {
    const item = await prisma.procurementTracking.findUnique({ where: { id } });
    if (!item) continue;
    
    await prisma.procurementTracking.update({
      where: { id },
      data: {
        statusPo: 'PO',
        tanggalTerima: null
      }
    });
    console.log(`Updated item ID ${id} (${item.originalName}) -> statusPo: PO, tanggalTerima: null`);

    if (item.sparepartId) {
      await prisma.sparepart.update({
        where: { id: item.sparepartId },
        data: {
          purchasingStatus: 'PO',
          purchasingNoPo: item.nomorPo,
          purchasingQty: item.qty
        }
      });
      console.log(`Updated sparepart ${item.sparepartId} -> purchasingStatus: PO`);
    }
  }
}

main().finally(() => prisma.$disconnect());
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/fix_false_gr.js', 'w') as f:
    f.write(fix_sql)
sftp.close()

run_cmd('node /tmp/fix_false_gr.js')

# 3. Build & reload Next.js app on VPS
run_cmd('cd /var/www/ico-management-system && npm run build')
run_cmd('pm2 restart all || sudo systemctl restart next_msic || sudo systemctl restart msic || true')

ssh.close()
