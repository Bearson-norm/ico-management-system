import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

print("Connecting to VPS 103.31.39.189...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

def run_cmd(cmd):
    print(f"\n===> Executing: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && export PATH=$PATH:./node_modules/.bin && {cmd}")
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out

run_cmd("git pull origin main")
run_cmd("rm -rf .next")
run_cmd("npm run build")
run_cmd("pm2 restart inventory")

ssh.close()
print("\n✓ Deployment to VPS complete!")
