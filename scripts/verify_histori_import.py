import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

def q(sql, label):
    print(f"\n=== {label} ===")
    _, out, _ = ssh.exec_command(f"PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c \"{sql}\"")
    print(out.read().decode('utf-8', errors='ignore'))

# 1. Total histori records imported
q("SELECT COUNT(*) as total_histori FROM stock_movement WHERE purchase_type = 'histori-sheets';",
  "Total histori records di DB")

# 2. Rentang tanggal
q("SELECT MIN(tanggal)::date as dari, MAX(tanggal)::date as sampai FROM stock_movement WHERE purchase_type = 'histori-sheets';",
  "Rentang tanggal histori")

# 3. Top 10 sparepart terbanyak dipakai
q("""SELECT sparepart_id, nama_item, COUNT(*) as frekuensi, SUM(qty) as total_qty
FROM stock_movement WHERE purchase_type = 'histori-sheets'
GROUP BY sparepart_id, nama_item ORDER BY frekuensi DESC LIMIT 10;""",
  "Top 10 sparepart paling sering keluar (histori)")

# 4. Pastikan stok TIDAK berubah — cek 5 sparepart sampel
q("""SELECT sp.id, sp.nama,
  COALESCE(SUM(CASE WHEN sm.tipe='IN' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as total_in,
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as total_out,
  COALESCE(SUM(CASE WHEN sm.tipe='IN' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as stok_aktif
FROM sparepart sp
LEFT JOIN stock_movement sm ON sm.sparepart_id = sp.id
WHERE sp.id IN ('MTC-SP-007','MTC-SP-010','MTC-SP-012','MTC-SP-013','MTC-SP-015')
GROUP BY sp.id, sp.nama ORDER BY sp.id;""",
  "Verifikasi stok aktif TIDAK terpengaruh (5 sampel)")

ssh.close()
print("\n✓ Verifikasi selesai.")
