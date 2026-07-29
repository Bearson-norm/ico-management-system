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
        print(out)
    if err:
        print("ERR:", err)
    return out

print("--- CURRENT CRONTAB ON VPS ---")
run_cmd("crontab -l")

print("--- ADDING AUTOMATIC ODOO SYNC EVERY 10 MINUTES TO VPS CRONTAB ---")
cron_job = "*/10 * * * * curl -s -X POST http://127.0.0.1:1325/api/mtc/odoo/sync -H 'Content-Type: application/json' -d '{}' >> /tmp/mtc_odoo_sync.log 2>&1"

run_cmd(f'''(crontab -l 2>/dev/null | grep -v "/api/mtc/odoo/sync"; echo "{cron_job}") | crontab -''')

print("\n--- VERIFYING UPDATED CRONTAB ---")
run_cmd("crontab -l")

ssh.close()
