import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = 'cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" npx prisma db push --schema=prisma/mtc/schema.prisma --accept-data-loss'
stdin, stdout, stderr = ssh.exec_command(cmd)
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))

stdin2, stdout2, stderr2 = ssh.exec_command('cd /var/www/ico-management-system && pm2 restart inventory')
print("RESTART:", stdout2.read().decode('utf-8', errors='ignore'))

ssh.close()
print("✓ VPS Prisma Schema pushed successfully!")
