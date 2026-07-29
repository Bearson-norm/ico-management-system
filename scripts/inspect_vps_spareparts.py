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

print("--- VPS SPAREPART COUNT ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT count(*) FROM sparepart;' ''')

print("--- VPS SPAREPART AKTIF VS INAKTIF ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT aktif, count(*) FROM sparepart GROUP BY aktif;' ''')

print("--- VPS SESSIONS & ITEMS ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT id, judul, lokasi, status, created_at FROM opname_session ORDER BY id DESC;' ''')
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT session_id, count(*) FROM opname_item GROUP BY session_id;' ''')

ssh.close()
