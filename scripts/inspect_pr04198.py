import paramiko
import xmlrpc.client

# 1. Check item in VPS DB
hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = 'node -e "const { PrismaClient } = require(\'./lib/generated/mtc\'); const p = new PrismaClient(); p.procurementTracking.findMany({ where: { nomorPr: \'PR04198\' } }).then(items => console.log(JSON.stringify(items, null, 2))).finally(() => p.$disconnect());"'
print("=== VPS Item PR04198 ===")
stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
out = stdout.read().decode('utf-8', errors='ignore')
print(out)
ssh.close()
