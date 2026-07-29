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

print("--- UPDATING EXISTING PROCUREMENT ITEMS WITH SPAREPART_ID TO IS_STOCKED = TRUE ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'UPDATE procurement_tracking SET is_stocked = true WHERE sparepart_id IS NOT NULL;' ''')

print("--- TRIGGERING 1-CLICK SYNC ON VPS ---")
run_cmd('''curl -s -X POST http://127.0.0.1:1325/api/mtc/odoo/sync -H "Content-Type: application/json" -d '{}' ''')

ssh.close()
