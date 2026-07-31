import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

commands = [
    "rm -f .git/refs/remotes/origin/main.lock .git/index.lock",
    "git fetch origin && git reset --hard origin/main",
    "rm -rf .next",
    "export NODE_OPTIONS='--max-old-space-size=2048' && npm run build",
    "pm2 restart inventory"
]

for cmd in commands:
    print(f"===> Executing: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && export PATH=$PATH:./node_modules/.bin && {cmd}")
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out: print(out)
    if err: print(f"ERR: {err}")

ssh.close()
print("✓ VPS Build and Deployment Complete!")
