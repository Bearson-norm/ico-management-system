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

print("--- FIXING DB FOR PO P14526 CANCELLED ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "UPDATE procurement_tracking SET status_pr = 'CANCELLED', status_po = 'CANCELLED' WHERE nomor_po = 'P14526';" ''')

print("\n--- DB STATE FOR PR04598 AFTER FIX ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, original_name, nomor_pr, nomor_po, status_pr, status_po FROM procurement_tracking WHERE nomor_pr = 'PR04598';" ''')

ssh.close()
