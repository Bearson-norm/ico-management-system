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

print("--- VPS MTC SETTINGS ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT key, value FROM mtc_settings;' ''')

print("--- VPS PROCUREMENT COUNT & SUMMARY ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT count(*) FROM procurement_tracking;' ''')
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT status_pr, count(*) FROM procurement_tracking GROUP BY status_pr;' ''')

print("--- SAMPLE PROCUREMENT ITEMS ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT id, nomor_pr, nomor_po, status_pr, original_name FROM procurement_tracking ORDER BY id DESC LIMIT 15;' ''')

ssh.close()
