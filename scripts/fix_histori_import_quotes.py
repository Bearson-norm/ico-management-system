"""
Fix import untuk 16 baris yang gagal karena nama item mengandung double-quote.
Solusi: tulis SQL ke file temp di VPS lalu eksekusi via psql -f (bukan -c).
"""
import sys
import json
import paramiko
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

# SKU yang gagal berdasarkan output (nama mengandung " karakter)
# Ambil dari analysis JSON, filter yang gagal
with open('scripts/histori_import_analysis.json', encoding='utf-8') as f:
    analysis = json.load(f)

found_skus = analysis['found_skus']
rows = analysis['rows']

# SKU-SKU yang error (semuanya punya " dalam nama)
error_skus = {'MTC-SP-051', 'MTC-SP-049', 'MTC-SP-061', 'MTC-SP-038',
              'MTC-SP-045', 'MTC-SP-046', 'MTC-SP-204', 'MTC-SP-207',
              'MTC-SP-041', 'MTC-SP-042', 'MTC-SP-058', 'MTC-SP-057',
              'MTC-SP-035', 'MTC-SP-262', 'MTC-SP-276', 'MTC-SP-033'}

# Filter rows to retry
retry_rows = []
for r in rows:
    sku = r['sku']
    qty_int = int(float(r['qty_raw']))
    if sku not in found_skus or qty_int <= 0:
        continue
    if sku in error_skus:
        retry_rows.append({
            'sku': sku,
            'nama_db': found_skus[sku],
            'tanggal': r['date'],
            'qty': qty_int,
        })

print(f"Baris untuk di-retry: {len(retry_rows)}")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Get harga & lokasi per sparepart
sku_list = "','".join(error_skus)
_, stdout, _ = ssh.exec_command(
    f"""PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -A -F'|' -c "SELECT id, harga, lokasi FROM sparepart WHERE id IN ('{sku_list}');" """
)
sp_data = {}
for line in stdout.read().decode('utf-8', errors='ignore').strip().splitlines():
    parts = line.split('|')
    if len(parts) >= 2:
        sp_data[parts[0]] = {
            'harga': parts[1] if parts[1] else '0',
            'lokasi': parts[2] if len(parts) > 2 and parts[2] else '',
        }

# Check existing to avoid duplicates
_, stdout2, _ = ssh.exec_command(
    """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -A -F'|' -c "SELECT sparepart_id, tanggal::date, qty FROM stock_movement WHERE purchase_type = 'histori-sheets';" """
)
existing = set()
for line in stdout2.read().decode('utf-8', errors='ignore').strip().splitlines():
    parts = line.split('|')
    if len(parts) >= 3:
        existing.add((parts[0], parts[1], parts[2]))

imported = 0
skipped_dup = 0
errors = []

for r in retry_rows:
    try:
        dt = datetime.strptime(r['tanggal'], '%d/%m/%Y')
        tanggal_iso = dt.strftime('%Y-%m-%d')
    except:
        errors.append(f"Tanggal tidak valid: {r}")
        continue

    dedup_key = (r['sku'], tanggal_iso, str(r['qty']))
    if dedup_key in existing:
        skipped_dup += 1
        continue

    harga = sp_data.get(r['sku'], {}).get('harga', '0')
    lokasi = sp_data.get(r['sku'], {}).get('lokasi', '').replace("'", "''").replace('"', '\\"')
    nama = r['nama_db'].replace("'", "''").replace('"', '\\"')

    # Tulis SQL ke file temp, eksekusi via psql -f (aman untuk karakter spesial)
    sql_content = f"""INSERT INTO stock_movement (tipe, sparepart_id, nama_item, qty, harga, lokasi, keterangan, purchase_type, tanggal, created_at)
VALUES ('OUT', '{r['sku']}', '{nama}', {r['qty']}, {harga}, '{lokasi}', '[import-histori-sheets]', 'histori-sheets', '{tanggal_iso} 12:00:00', NOW())
ON CONFLICT DO NOTHING;
"""
    # Write SQL file to VPS then execute
    tmp_file = f'/tmp/histori_fix_{r["sku"]}_{tanggal_iso}_{r["qty"]}.sql'

    # Use sftp to write the file
    sftp = ssh.open_sftp()
    with sftp.file(tmp_file, 'w') as f:
        f.write(sql_content)
    sftp.close()

    # Execute via psql -f
    exec_cmd = f"PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -f {tmp_file}"
    _, stdout_i, stderr_i = ssh.exec_command(exec_cmd)
    out = stdout_i.read().decode('utf-8', errors='ignore')
    err = stderr_i.read().decode('utf-8', errors='ignore').strip()

    # Cleanup
    ssh.exec_command(f"rm -f {tmp_file}")

    if 'INSERT' in out or 'INSERT 0 0' in out:
        imported += 1
        existing.add(dedup_key)
    elif err:
        errors.append(f"{r['sku']} {tanggal_iso}: {err[:100]}")
    else:
        imported += 1
        existing.add(dedup_key)

ssh.close()

print(f"\n{'='*50}")
print(f"HASIL FIX IMPORT:")
print(f"  ✅ Berhasil diimport : {imported}")
print(f"  ⏭ Di-skip duplikat  : {skipped_dup}")
if errors:
    print(f"  ❌ Error            : {len(errors)}")
    for e in errors:
        print(f"    {e}")
else:
    print(f"  ✅ Tidak ada error!")

total = 355 + imported
print(f"\nTotal keseluruhan berhasil diimport: {total} dari 378 baris")
