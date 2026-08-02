import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

print("=== CHECKING MTC-SP-284 MOVEMENTS ===")

# Query movements for MTC-SP-284 in Live DB
cmd1 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT id, tipe, qty, purchase_type, keterangan, tanggal
FROM stock_movement
WHERE sparepart_id = 'MTC-SP-284'
ORDER BY id;
" """
_, out1, _ = ssh.exec_command(cmd1)
print("\n[LIVE DB MOVEMENTS for MTC-SP-284]:")
print(out1.read().decode('utf-8').strip())

# Query movements for MTC-SP-284 in Backup SQL
cmd2 = """
python3 -c "
with open('/home/foom/backup_mtc_db_20260802_175350.sql') as f:
    for line in f:
        if 'MTC-SP-284' in line:
            print('BACKUP LINE:', line.strip()[:150])
"
"""
_, out2, _ = ssh.exec_command(cmd2)
print("\n[BACKUP SQL LINES for MTC-SP-284]:")
print(out2.read().decode('utf-8').strip())

ssh.close()
