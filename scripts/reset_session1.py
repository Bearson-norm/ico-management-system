import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    print(f"\n--- {cmd} ---")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out

sql = '''
BEGIN;
DELETE FROM stock_movement WHERE keterangan LIKE '[OPNAME] Adjustment Hasil Audit Sesi #1%';
UPDATE opname_session SET status = 'DRAFT', approved_by = NULL, approved_at = NULL WHERE id = 1;
COMMIT;
'''

cmd = f'''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{sql.replace(chr(10), ' ')}" '''
run_cmd(cmd)

run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, judul, status FROM opname_session WHERE id = 1;" ''')

ssh.close()
