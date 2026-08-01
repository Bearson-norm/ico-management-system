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

print("--- RESETTING P14544 STATUS_PO ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "UPDATE procurement_tracking SET status_po = 'PO' WHERE nomor_po = 'P14544';" ''')

print("--- PR04625 / P14544 DATA ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, original_name, nomor_pr, nomor_po, status_pr, status_po, link_gr, tanggal_terima FROM procurement_tracking WHERE nomor_pr = 'PR04625' OR nomor_po = 'P14544';" ''')

ssh.close()
