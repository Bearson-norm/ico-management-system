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

print("--- ALL SESSIONS IN OPNAME_SESSION TABLE ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT id, judul, lokasi, status, created_at, updated_at, approved_by FROM opname_session ORDER BY id ASC;' ''')

print("--- COUNT OF ITEMS IN EACH SESSION ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT session_id, count(*), count(qty_fisik) as counted FROM opname_item GROUP BY session_id;' ''')

ssh.close()
