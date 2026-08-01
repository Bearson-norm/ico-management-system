import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

stdin, stdout, stderr = ssh.exec_command('ls -l ~/.pm2/logs/')
print("=== PM2 LOG FILES ===")
print(stdout.read().decode('utf-8', errors='ignore'))

stdin, stdout, stderr = ssh.exec_command('pm2 logs inventory --lines 30 --nostream')
print("=== PM2 LOGS INVENTORY ===")
print(stdout.read().decode('utf-8', errors='ignore'))

ssh.close()
