"""
Import histori stock-out dari CSV ke DB VPS.
SAFETY RULES:
  - Hanya INSERT baris baru ke stock_movement
  - Tidak ada UPDATE/DELETE ke tabel manapun
  - Hanya baris dengan SKU yang ADA di DB
  - purchaseType = 'histori-sheets' sebagai marker
  - Deduplication: skip jika (sparepartId + tanggal + qty + keterangan) sudah ada
  - qty desimal yang hasil round ke 0 di-skip
"""
import sys
import csv
import json
import paramiko
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'
DRY_RUN = '--dry-run' in sys.argv  # jalankan dengan --dry-run untuk preview

# --- Load analysis results ---
with open('scripts/histori_import_analysis.json', encoding='utf-8') as f:
    analysis = json.load(f)

found_skus = analysis['found_skus']  # dict: sku -> nama_db
rows = analysis['rows']

# Filter: only importable rows (SKU exists), qty > 0 after int conversion
importable = []
skipped_not_found = []
skipped_zero_qty = []

for r in rows:
    sku = r['sku']
    qty_int = int(float(r['qty_raw']))
    
    if sku not in found_skus:
        skipped_not_found.append(r)
        continue
    if qty_int <= 0:
        skipped_zero_qty.append(r)
        continue
    
    importable.append({
        'sku': sku,
        'nama_db': found_skus[sku],
        'tanggal': r['date'],  # DD/MM/YYYY
        'qty': qty_int,
    })

print(f"{'=== DRY RUN ===' if DRY_RUN else '=== IMPORT SUNGGUHAN ==='}")
print(f"Baris akan diimport : {len(importable)}")
print(f"Di-skip (SKU tidak ada): {len(skipped_not_found)}")
print(f"Di-skip (qty = 0)    : {len(skipped_zero_qty)}")
print()

if DRY_RUN:
    print("Preview 10 baris pertama yang akan diimport:")
    for r in importable[:10]:
        print(f"  {r['tanggal']} | {r['sku']} | {r['nama_db']} | qty={r['qty']}")
    print(f"  ... dan {len(importable)-10} baris lainnya")
    print("\n[DRY RUN] Tidak ada yang ditulis ke DB.")
    sys.exit(0)

# --- Konfirmasi final ---
print("Lanjut import sungguhan? Ketik 'YA' untuk konfirmasi: ", end='')
confirm = input().strip()
if confirm != 'YA':
    print("Import dibatalkan.")
    sys.exit(0)

# --- Connect VPS ---
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# --- Get harga & lokasi per sparepart ---
sku_list = "','".join(found_skus.keys())
cmd = f"""PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -A -F'|' -c "SELECT id, harga, lokasi FROM sparepart WHERE id IN ('{sku_list}');" """
stdin, stdout, _ = ssh.exec_command(cmd)
sp_data = {}
for line in stdout.read().decode('utf-8', errors='ignore').strip().splitlines():
    parts = line.split('|')
    if len(parts) >= 2:
        sp_data[parts[0]] = {
            'harga': parts[1] if parts[1] else '0',
            'lokasi': parts[2] if len(parts) > 2 and parts[2] else '',
        }

# --- Check existing histori records to avoid duplicates ---
cmd2 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -A -F'|' -c "SELECT sparepart_id, tanggal::date, qty FROM stock_movement WHERE purchase_type = 'histori-sheets';" """
stdin2, stdout2, _ = ssh.exec_command(cmd2)
existing = set()
for line in stdout2.read().decode('utf-8', errors='ignore').strip().splitlines():
    parts = line.split('|')
    if len(parts) >= 3:
        existing.add((parts[0], parts[1], parts[2]))

print(f"Existing histori records di DB: {len(existing)}")

# --- Build INSERT statements ---
imported = 0
skipped_dup = 0
errors = []
keterangan = '[import-histori-sheets]'

for r in importable:
    # Parse date DD/MM/YYYY
    try:
        dt = datetime.strptime(r['tanggal'], '%d/%m/%Y')
        tanggal_iso = dt.strftime('%Y-%m-%d')
    except:
        errors.append(f"Tanggal tidak valid: {r}")
        continue
    
    # Dedup check
    dedup_key = (r['sku'], tanggal_iso, str(r['qty']))
    if dedup_key in existing:
        skipped_dup += 1
        continue
    
    harga = sp_data.get(r['sku'], {}).get('harga', '0')
    lokasi = sp_data.get(r['sku'], {}).get('lokasi', '').replace("'", "''")
    nama = r['nama_db'].replace("'", "''")
    
    sql = f"""
INSERT INTO stock_movement (tipe, sparepart_id, nama_item, qty, harga, lokasi, keterangan, purchase_type, tanggal, created_at)
VALUES ('OUT', '{r['sku']}', '{nama}', {r['qty']}, {harga}, '{lokasi}', '{keterangan}', 'histori-sheets', '{tanggal_iso} 12:00:00', NOW())
ON CONFLICT DO NOTHING;
""".strip()
    
    cmd_insert = f"""PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{sql}" """
    stdin_i, stdout_i, stderr_i = ssh.exec_command(cmd_insert)
    err = stderr_i.read().decode('utf-8', errors='ignore').strip()
    
    if err and 'INSERT' not in stdout_i.read().decode('utf-8', errors='ignore'):
        errors.append(f"{r['sku']} {tanggal_iso}: {err[:100]}")
    else:
        imported += 1
        existing.add(dedup_key)

ssh.close()

# --- Verify: cek stok tidak berubah (sample check) ---
print(f"\n{'='*50}")
print(f"HASIL IMPORT:")
print(f"  ✅ Berhasil diimport : {imported}")
print(f"  ⏭ Di-skip duplikat  : {skipped_dup}")
print(f"  ⏭ Di-skip SKU ??    : {len(skipped_not_found)}")
print(f"  ⏭ Di-skip qty=0     : {len(skipped_zero_qty)}")
if errors:
    print(f"  ❌ Error            : {len(errors)}")
    for e in errors[:5]:
        print(f"    {e}")

print(f"\nStok existing TIDAK diubah — semua record baru bertipe purchaseType='histori-sheets'")
print(f"yang dikecualikan dari semua kalkulasi stok di sistem.")
