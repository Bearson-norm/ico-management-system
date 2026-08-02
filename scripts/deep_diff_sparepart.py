import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

print("=== INSPEKSI STRUKTUR & ISI TABEL SPAREPART ===")

# 1. Inspect schema of sparepart table
cmd1 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "\d sparepart" """
_, out1, _ = ssh.exec_command(cmd1)
print(out1.read().decode('utf-8').strip())

# 2. Check if there are differences between backup SQL copy lines for sparepart vs live table
# Let's dump current sparepart table to a temporary sql format to diff
cmd2 = """PGPASSWORD=Admin123 pg_dump -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t sparepart --data-only -f /tmp/sparepart_live.sql"""
ssh.exec_command(cmd2)

# Now compare sparepart from backup vs sparepart_live
cmd3 = """
python3 -c "
with open('/home/foom/backup_mtc_db_20260802_175350.sql') as f1, open('/tmp/sparepart_live.sql') as f2:
    lines1 = [l for l in f1 if l.startswith('MTC-SP-') or ('COPY public.sparepart' in l)]
    lines2 = [l for l in f2 if l.startswith('MTC-SP-') or ('COPY public.sparepart' in l)]
    print('Lines in backup sparepart:', len(lines1))
    print('Lines in live sparepart:', len(lines2))
    diffs = set(lines1) ^ set(lines2)
    print('Difference count:', len(diffs))
    if diffs:
        print('Sample diffs:', list(diffs)[:5])
"
"""
_, out3, _ = ssh.exec_command(cmd3)
print("\n=== HASIL DIFF TABEL SPAREPART (BACKUP VS LIVE) ===")
print(out3.read().decode('utf-8').strip())

ssh.close()
