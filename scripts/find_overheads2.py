import paramiko

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = '''node -e "
require('dotenv').config();
const { PrismaClient } = require('./lib/generated/mtc');
const p = new PrismaClient();
p.procurementTracking.findMany({
  where: {
    OR: [
      { originalName: { contains: 'OVERHEAD', mode: 'insensitive' } },
      { nomorPr: { contains: '4198' } },
      { nomorPo: { contains: '13890' } }
    ]
  }
}).then(items => console.log(JSON.stringify(items, null, 2))).finally(() => p.$disconnect());
"'''
print("=== VPS Search with dotenv ===")
stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
out = stdout.read().decode('utf-8', errors='ignore')
print(out)
ssh.close()
