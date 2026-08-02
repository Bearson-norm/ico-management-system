import sys
import csv
import paramiko
import json

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

# --- Parse CSV ---
rows = []
decimal_qty_rows = []
with open('Untitled spreadsheet - Sheet1.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader, start=2):
        qty_str = row['Jumlah'].strip()
        try:
            qty_float = float(qty_str)
        except:
            qty_float = 0
        qty_int = int(qty_float)
        
        if qty_float != qty_int:
            decimal_qty_rows.append({
                'line': i,
                'date': row['Date'],
                'sku': row['Nomor Sparepart'].strip(),
                'nama': row['Nama Sparepart'].strip(),
                'qty_raw': qty_str,
                'qty_int': qty_int,
            })
        
        rows.append({
            'line': i,
            'date': row['Date'].strip(),
            'sku': row['Nomor Sparepart'].strip(),
            'nama': row['Nama Sparepart'].strip(),
            'qty_raw': qty_str,
            'qty_float': qty_float,
        })

unique_skus = sorted(set(r['sku'] for r in rows))
print(f"Total baris data: {len(rows)}")
print(f"Unique SKU: {len(unique_skus)}")
print(f"Baris dengan qty desimal: {len(decimal_qty_rows)}")

# --- Connect VPS ---
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Build SQL to check all SKUs at once
sku_list = "','".join(unique_skus)
sql = f"SELECT id, nama FROM sparepart WHERE id IN ('{sku_list}') ORDER BY id;"
cmd = f"PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -A -F'|' -c \"{sql}\""
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='ignore').strip()

db_spareparts = {}
for line in out.splitlines():
    if '|' in line:
        parts = line.split('|', 1)
        db_spareparts[parts[0].strip()] = parts[1].strip()

ssh.close()

# --- Classify SKUs ---
found = []
not_found = []

for sku in unique_skus:
    if sku in db_spareparts:
        found.append((sku, db_spareparts[sku]))
    else:
        # Get name from CSV for context
        names = [r['nama'] for r in rows if r['sku'] == sku]
        not_found.append((sku, names[0] if names else ''))

# --- Output Results ---
print(f"\n{'='*60}")
print(f"HASIL LANGKAH 2 - PENCOCOKAN SKU KE DB VPS")
print(f"{'='*60}")
print(f"\n✅ COCOK PERSIS ({len(found)} SKU) — Siap diimport:")
for sku, nama_db in found:
    print(f"  {sku} → {nama_db}")

print(f"\n❌ TIDAK DITEMUKAN DI DB ({len(not_found)} SKU) — PERLU KONFIRMASI:")
for sku, nama_csv in not_found:
    count = sum(1 for r in rows if r['sku'] == sku)
    print(f"  {sku} | CSV: '{nama_csv}' | {count} baris")

print(f"\n⚠️  BARIS QTY DESIMAL ({len(decimal_qty_rows)} baris) — DB field adalah Int:")
for r in decimal_qty_rows:
    print(f"  Line {r['line']} | {r['date']} | {r['sku']} | {r['nama']} | qty={r['qty_raw']} → akan dibulatkan ke {r['qty_int']}")

# Summary
importable = [r for r in rows if r['sku'] in db_spareparts]
not_importable = [r for r in rows if r['sku'] not in db_spareparts]
print(f"\n{'='*60}")
print(f"RINGKASAN PREVIEW (Dry-Run):")
print(f"  Baris siap import (SKU cocok)   : {len(importable)}")
print(f"  Baris TIDAK bisa import (SKU ??)  : {len(not_importable)}")
print(f"  Total baris keseluruhan          : {len(rows)}")
print(f"  SKU unik yang cocok              : {len(found)}")
print(f"  SKU unik yang tidak cocok        : {len(not_found)}")

# Save analysis to JSON for later use
analysis = {
    'total_rows': len(rows),
    'importable_rows': len(importable),
    'not_importable_rows': len(not_importable),
    'found_skus': {k: v for k, v in found},
    'not_found_skus': [(k, v) for k, v in not_found],
    'decimal_rows': decimal_qty_rows,
    'rows': rows,
}
with open('scripts/histori_import_analysis.json', 'w', encoding='utf-8') as f:
    json.dump(analysis, f, ensure_ascii=False, indent=2)

print(f"\n✓ Analisis disimpan ke scripts/histori_import_analysis.json")
