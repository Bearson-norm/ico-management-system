import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  await prisma.mtcSetting.upsert({
    where: { key: 'mtc_odoo_session_id' },
    update: { value: 'a63c41331eacbddc78421b46e350282af18ee085' },
    create: { key: 'mtc_odoo_session_id', value: 'a63c41331eacbddc78421b46e350282af18ee085' }
  });
  await prisma.mtcSetting.upsert({
    where: { key: 'mtc_procurement_sheet_url' },
    update: { value: '' },
    create: { key: 'mtc_procurement_sheet_url', value: '' }
  });
  console.log('✓ Successfully saved session ID into VPS mtc_settings table!');
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))

# Trigger sync
stdin2, stdout2, stderr2 = ssh.exec_command('curl -s -X POST "http://127.0.0.1:1325/api/mtc/odoo/sync" -H "Content-Type: application/json"')
print("SYNC RESPONSE:", stdout2.read().decode('utf-8', errors='ignore'))

ssh.close()
