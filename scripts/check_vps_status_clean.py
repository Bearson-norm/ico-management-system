import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

stdin, stdout, stderr = ssh.exec_command('cd /var/www/ico-management-system && git log -n 2 --oneline')
print("=== VPS GIT LOG ===")
print(stdout.read().decode('utf-8', errors='ignore'))

stdin, stdout, stderr = ssh.exec_command('pm2 jlist')
import json
try:
    data = json.loads(stdout.read().decode('utf-8', errors='ignore'))
    inv = [p for p in data if p.get('name') == 'inventory']
    if inv:
        p = inv[0]
        print(f"Inventory status: {p.get('pm2_env', {}).get('status')}, restarts: {p.get('pm2_env', {}).get('restart_time')}")
except Exception as e:
    print("Error parsing pm2 jlist:", e)

ssh.close()
