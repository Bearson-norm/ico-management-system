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
        print(out.encode('ascii', errors='backslashreplace').decode('ascii'))
    if err:
        print("ERR:", err.encode('ascii', errors='backslashreplace').decode('ascii'))
    return out

# Check how many links in _MesinToSparepart
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT count(*) FROM "_MesinToSparepart";' ''')

# Show all distinct machine IDs in _MesinToSparepart and their current machine record (if any)
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT rel."A" AS mesin_id, m.nama AS mesin_nama, m.tipe AS mesin_tipe, count(*) FROM "_MesinToSparepart" rel LEFT JOIN mesin m ON rel."A" = m.id GROUP BY rel."A", m.nama, m.tipe;' ''')

ssh.close()
