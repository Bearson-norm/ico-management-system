import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

print("Connecting to VPS...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

def run(cmd, label=''):
    print(f"\n==> {label or cmd}")
    stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
    out = stdout.read().decode('utf-8', errors='ignore')
    err_out = stderr.read().decode('utf-8', errors='ignore')
    if out: print(out[-2000:])  # last 2000 chars
    if err_out: print("ERR:", err_out[-1000:])

run("git pull origin main", "git pull")
run("npx prisma migrate deploy --schema=prisma/mtc/schema.prisma", "prisma migrate deploy")
run("npx prisma generate --schema=prisma/mtc/schema.prisma", "prisma generate")
run("npm run build", "npm build")
run("pm2 restart inventory --update-env", "pm2 restart")
run("pm2 status inventory", "pm2 status")

ssh.close()
print("\n✓ VPS Deploy Complete!")
