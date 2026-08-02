import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

print("=== DEEP COMPARISON OF STOCK_MOVEMENT (BACKUP VS LIVE) ===")

# Dump current stock_movement table to a file (excluding purchase_type = 'histori-sheets')
cmd_dump = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT id, tipe, sparepart_id, nama_item, qty, harga, lokasi, keterangan, tanggal::date
FROM stock_movement
WHERE purchase_type IS DISTINCT FROM 'histori-sheets'
ORDER BY id;
" > /tmp/sm_live_non_histori.txt"""
ssh.exec_command(cmd_dump)

# Get stock_movement lines from backup
cmd_dump_b = """
python3 -c "
with open('/home/foom/backup_mtc_db_20260802_175350.sql') as f:
    lines = [l.strip() for l in f if ('COPY public.stock_movement' in l or 'INSERT INTO' in l or 'histori-sheets' not in l)]
    print('Backup file lines count:', len(lines))
"
"""
_, out_b, _ = ssh.exec_command(cmd_dump_b)
print(out_b.read().decode('utf-8').strip())

# Count rows in stock_movement in backup SQL
cmd_count_b = """
python3 -c "
with open('/home/foom/backup_mtc_db_20260802_175350.sql') as f:
    content = f.read()
    if 'COPY public.stock_movement' in content:
        section = content.split('COPY public.stock_movement')[1].split('\\\.')[0]
        rows = [r for r in section.strip().split('\\n') if r.strip()]
        print('Total stock_movement rows in BACKUP:', len(rows))
    else:
        print('COPY section not found')
"
"""
_, out_count_b, _ = ssh.exec_command(cmd_count_b)
print(out_count_b.read().decode('utf-8').strip())

# Count rows in stock_movement in LIVE (non-histori)
cmd_count_l = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT COUNT(*) FROM stock_movement WHERE purchase_type IS DISTINCT FROM 'histori-sheets';" """
_, out_count_l, _ = ssh.exec_command(cmd_count_l)
print("Total non-histori stock_movement rows in LIVE DB:", out_count_l.read().decode('utf-8').strip())

ssh.close()
