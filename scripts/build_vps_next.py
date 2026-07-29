import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.encode('ascii', 'ignore').decode('ascii'))
    if err:
        print("ERR:", err.encode('ascii', 'ignore').decode('ascii'))
    return out

print("--- BUILDING NEXT.JS ON VPS ---")
run_cmd('cd /var/www/ico-management-system && npx next build')
run_cmd('pm2 restart inventory')

ssh.close()
