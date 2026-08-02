import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

print("=== MEMBANDINGKAN DATA DB VPS VS BACKUP SQL ===")

# 1. Total records di tabel sparepart
cmd1 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT COUNT(*) FROM sparepart;" """
_, out1, _ = ssh.exec_command(cmd1)
print("\n[DB VPS LIVE] Total Sparepart:", out1.read().decode('utf-8').strip())

# Count IN COPY sparepart FROM backup
cmd1_b = "grep -c '^MTC-SP-' /home/foom/backup_mtc_db_20260802_175350.sql || grep -c 'INSERT INTO.*sparepart' /home/foom/backup_mtc_db_20260802_175350.sql"
_, out1_b, _ = ssh.exec_command(cmd1_b)
print("[BACKUP FILE] Total Sparepart lines:", out1_b.read().decode('utf-8').strip())

# 2. Total records di stock_movement
cmd2 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT 
  COUNT(*) as total_semua,
  COUNT(CASE WHEN purchase_type = 'histori-sheets' THEN 1 END) as total_histori_import,
  COUNT(CASE WHEN purchase_type IS DISTINCT FROM 'histori-sheets' THEN 1 END) as total_non_histori
FROM stock_movement;
" """
_, out2, _ = ssh.exec_command(cmd2)
print("\n[DB VPS LIVE] Stock Movement breakdown:")
print(out2.read().decode('utf-8').strip())

# Count movements in backup
cmd2_b = "grep -c 'INSERT INTO.*stock_movement' /home/foom/backup_mtc_db_20260802_175350.sql || grep -i 'COPY public.stock_movement' -A 1000 /home/foom/backup_mtc_db_20260802_175350.sql | grep -c '^[0-9]' "
_, out2_b, _ = ssh.exec_command(cmd2_b)
print("[BACKUP FILE] Total movements in backup:", out2_b.read().decode('utf-8').strip())

# 3. Bandingkan 10 Sampel Sparepart: Stok di DB Live saat ini (query tanpa histori vs query dengan histori)
cmd3 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT 
  sp.id,
  sp.nama,
  COALESCE(SUM(CASE WHEN sm.tipe='IN' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as stok_tanpa_histori,
  
  COALESCE(SUM(CASE WHEN sm.tipe='IN' THEN sm.qty ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' THEN sm.qty ELSE 0 END), 0) as stok_dengan_histori,
  
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' AND sm.purchase_type = 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as total_histori_out
FROM sparepart sp
LEFT JOIN stock_movement sm ON sm.sparepart_id = sp.id
WHERE sp.id IN ('MTC-SP-007', 'MTC-SP-010', 'MTC-SP-012', 'MTC-SP-013', 'MTC-SP-015', 'MTC-SP-020', 'MTC-SP-074', 'MTC-SP-101', 'MTC-SP-190', 'MTC-SP-194')
GROUP BY sp.id, sp.nama ORDER BY sp.id;
" """
_, out3, _ = ssh.exec_command(cmd3)
print("\n=== PERBANDINGAN STOK SAMPLER ITEM (DB LIVE) ===")
print(out3.read().decode('utf-8').strip())

ssh.close()
