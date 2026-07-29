import csv
import paramiko
import os
import sys

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

csv_path = r"C:\Users\Fooml\Downloads\DB WEB MTC - DB Sparepart-Mesin.csv"

mappings = []
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        m_nama = (row.get('Nama Mesin') or '').strip()
        sp_id = (row.get('Item ID') or '').strip()
        if m_nama and sp_id:
            mappings.append((m_nama, sp_id))

print(f"[INFO] Ditemukan {len(mappings)} pasang pemetaan Sparepart - Mesin BOM dari CSV.")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_psql(sql):
    cmd = f'PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{sql}"'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    return out + (" ERR: " + err if err else "")

print("\n[INFO] Menyingkronkan BOM Sparepart ke mesin tipe='sparepart' di VPS...")

added = 0
for m_nama, sp_id in mappings:
    safe_m = m_nama.replace("'", "''")
    safe_sp = sp_id.replace("'", "''")

    sql = f'''
    WITH target_m AS (
        SELECT id FROM mesin WHERE LOWER(TRIM(nama)) = LOWER(TRIM('{safe_m}')) AND tipe = 'sparepart' LIMIT 1
    )
    INSERT INTO "_MesinToSparepart" ("A", "B")
    SELECT target_m.id, '{safe_sp}'
    FROM target_m
    WHERE EXISTS (SELECT 1 FROM sparepart WHERE id = '{safe_sp}')
    ON CONFLICT ("A", "B") DO NOTHING;
    '''

    res = run_psql(sql.replace('\n', ' '))
    if "INSERT 0 1" in res:
        added += 1

print(f"\n[SUCCESS] Berhasil memasukkan {added} link BOM sparepart ke database VPS!")

rekap = run_psql('''SELECT m.id, m.nama, m.tipe, count(s.id) AS total_item FROM mesin m JOIN "_MesinToSparepart" rel ON rel."A" = m.id JOIN sparepart s ON rel."B" = s.id WHERE m.tipe = 'sparepart' GROUP BY m.id, m.nama, m.tipe ORDER BY total_item DESC;''')
print("\n=== REKAP MESIN BOM & JUMLAH SPAREPART DI VPS ===")
print(rekap.encode('ascii', errors='backslashreplace').decode('ascii'))

ssh.close()
