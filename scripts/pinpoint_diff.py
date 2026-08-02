import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = """
python3 -c "
with open('/home/foom/backup_mtc_db_20260802_175350.sql') as f:
    content = f.read()
section = content.split('COPY public.stock_movement')[1].split('\\\.')[0]
backup_rows = set(r.strip() for r in section.strip().split('\\n') if r.strip())

import subprocess
cmd = \\\"PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -A -c \\\\\\\"COPY (SELECT * FROM stock_movement WHERE purchase_type IS DISTINCT FROM 'histori-sheets' ORDER BY id) TO STDOUT;\\\\\\\"\\\"
res = subprocess.check_output(cmd, shell=True).decode('utf-8')
live_rows = set(r.strip() for r in res.strip().split('\\n') if r.strip())

print('In backup but not in live:', len(backup_rows - live_rows))
for r in list(backup_rows - live_rows)[:5]:
    print('  BACKUP:', r[:100])

print('In live but not in backup:', len(live_rows - backup_rows))
for r in list(live_rows - backup_rows)[:5]:
    print('  LIVE:', r[:100])
"
"""
_, out, _ = ssh.exec_command(cmd)
print(out.read().decode('utf-8'))

ssh.close()
