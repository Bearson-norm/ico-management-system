import csv
import paramiko
import os

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

print(f"[INFO] Ditemukan {len(mappings)} pasang pemetaan Sparepart - Mesin BOM.")

# Generate Batch SQL
sql_lines = [
    "BEGIN;",
    "-- Ensure target machines exist as tipe='sparepart'",
]

for m_nama, _ in set(mappings):
    safe_m = m_nama.replace("'", "''")
    sql_lines.append(f"""
    INSERT INTO mesin (nama, tipe, area, aktif)
    VALUES ('{safe_m}', 'sparepart', NULL, true)
    ON CONFLICT (nama, tipe) DO UPDATE SET area = NULL, aktif = true;
    """)

sql_lines.append("-- Link spareparts to machines")
for m_nama, sp_id in mappings:
    safe_m = m_nama.replace("'", "''")
    safe_sp = sp_id.replace("'", "''")
    sql_lines.append(f"""
    INSERT INTO "_MesinToSparepart" ("A", "B")
    SELECT m.id, '{safe_sp}'
    FROM mesin m
    WHERE LOWER(TRIM(m.nama)) = LOWER(TRIM('{safe_m}')) AND m.tipe = 'sparepart'
    AND EXISTS (SELECT 1 FROM sparepart WHERE id = '{safe_sp}')
    ON CONFLICT ("A", "B") DO NOTHING;
    """)

sql_lines.append("COMMIT;")

full_sql = "\n".join(sql_lines)

# Upload batch SQL to VPS via SFTP and execute
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

sftp = ssh.open_sftp()
with sftp.file('/tmp/sync_bom_batch.sql', 'w') as f:
    f.write(full_sql)
sftp.close()

print("[INFO] Batch SQL uploaded to VPS /tmp/sync_bom_batch.sql")

stdin, stdout, stderr = ssh.exec_command('PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -f /tmp/sync_bom_batch.sql')
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')

print("[PSQL OUTPUT]:", out[-500:] if len(out) > 500 else out)
if err:
    print("[PSQL ERR]:", err)

# Rekap
stdin, stdout, stderr = ssh.exec_command('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT m.id, m.nama, m.tipe, count(s.id) AS total_item FROM mesin m JOIN \\"_MesinToSparepart\\" rel ON rel.\\"A\\" = m.id JOIN sparepart s ON rel.\\"B\\" = s.id WHERE m.tipe = 'sparepart' GROUP BY m.id, m.nama, m.tipe ORDER BY total_item DESC;" ''')
rekap = stdout.read().decode('utf-8', errors='ignore')
print("\n=== REKAP MESIN BOM & JUMLAH SPAREPART DI VPS ===")
print(rekap.encode('ascii', errors='backslashreplace').decode('ascii'))

ssh.close()
