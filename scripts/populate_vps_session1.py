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
        print(out)
    if err:
        print("ERR:", err)
    return out

print("--- POPULATING SESSION #1 WITH ALL SPAREPARTS ON VPS ---")
sql = """
INSERT INTO opname_item (session_id, sparepart_id, nama_item, kategori, lokasi, uom, qty_sistem, qty_fisik, selisih, is_new_item, created_at, updated_at)
SELECT 
    1 AS session_id,
    s.id AS sparepart_id,
    s.nama AS nama_item,
    COALESCE(k.nama, 'Umum') AS kategori,
    COALESCE(s.lokasi, 'Gudang MTC') AS lokasi,
    COALESCE(s.uom, 'Pcs') AS uom,
    COALESCE(stk.qty_sistem, 0) AS qty_sistem,
    NULL AS qty_fisik,
    0 AS selisih,
    FALSE AS is_new_item,
    NOW(),
    NOW()
FROM sparepart s
LEFT JOIN kategori k ON s.kategori_id = k.id
LEFT JOIN (
    SELECT sparepart_id, 
           SUM(CASE WHEN tipe = 'IN' THEN qty WHEN tipe = 'OUT' THEN -qty ELSE 0 END) AS qty_sistem
    FROM stock_movement
    WHERE sparepart_id IS NOT NULL
    GROUP BY sparepart_id
) stk ON s.id = stk.sparepart_id
WHERE s.aktif = TRUE;
"""

run_cmd(f'''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{sql}" ''')

print("\n--- VERIFYING ITEM COUNT FOR SESSION #1 ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT count(*) FROM opname_item WHERE session_id = 1;' ''')

ssh.close()
