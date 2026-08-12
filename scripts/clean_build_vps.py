import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

cmd = "cd /var/www/ico-management-system && git reset --hard origin/main && git pull origin main && rm -rf .next && npm run build && pm2 restart inventory --update-env"
print("Running git pull, clean build, and restart on VPS...")
_, stdout, stderr = ssh.exec_command(cmd, timeout=300)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')

print("OUT:\n", out[-1500:])
if err: print("ERR:\n", err[-500:])

ssh.close()
print("\n✓ Clean build & PM2 restart finished!")
