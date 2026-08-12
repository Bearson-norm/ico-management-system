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

print("--- FIXING DB FOR UNLINKED ITEMS falsely set to RECEIVED ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "UPDATE procurement_tracking SET status_pr = 'APPROVED' WHERE (nomor_po IS NULL OR nomor_po = '') AND tanggal_terima IS NULL AND link_gr IS NULL AND status_pr = 'RECEIVED';" ''')

print("\n--- DB STATE FOR PR04566 AFTER FIX ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, original_name, nomor_pr, nomor_po, status_pr, status_po, tanggal_terima, link_gr FROM procurement_tracking WHERE nomor_pr = 'PR04566';" ''')

ssh.close()
