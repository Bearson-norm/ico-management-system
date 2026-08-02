import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

def run(cmd, label=''):
    print(f"\n==> {label or cmd}")
    _, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=300)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out: print(out[-1500:])
    if err and 'warning' not in err.lower(): print("ERR:", err[-500:])

run("git pull origin main", "git pull")
run("npm run build", "npm build")
run("pm2 restart inventory --update-env", "pm2 restart")
run("pm2 status inventory", "pm2 status")

ssh.close()
print("\n✓ VPS Deploy selesai!")
