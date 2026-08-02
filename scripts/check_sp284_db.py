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
PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT 
  sp.id,
  sp.nama,
  COALESCE(SUM(CASE WHEN sm.tipe='IN' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as total_in,
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' AND sm.purchase_type IS DISTINCT FROM 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as total_out,
  COALESCE(SUM(CASE WHEN sm.tipe='OUT' AND sm.purchase_type = 'histori-sheets' THEN sm.qty ELSE 0 END), 0) as histori_out
FROM sparepart sp
LEFT JOIN stock_movement sm ON sm.sparepart_id = sp.id
WHERE sp.id = 'MTC-SP-284'
GROUP BY sp.id, sp.nama;
"
"""
_, out, _ = ssh.exec_command(cmd)
print(out.read().decode('utf-8'))

ssh.close()
