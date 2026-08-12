import sys, paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

print("1. Triggering Odoo Sync...")
stdin, stdout, stderr = ssh.exec_command('curl -s -X POST "http://127.0.0.1:1325/api/mtc/odoo/sync" -H "Content-Type: application/json"')
res = stdout.read().decode('utf-8', errors='ignore')
print("Sync Response:", res[:500])

ssh.close()
