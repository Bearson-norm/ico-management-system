"""
Script: scripts/sync_all_pr_gr_leadtimes.py
Tujuan:
1. Menarik tanggal asli PR (create_date) dari Odoo purchase.request untuk seluruh PR unik di DB.
2. Menarik tanggal selesai GR (good.received / stock.picking) dari Odoo untuk seluruh PO unik di DB.
3. Memperbarui procurement_tracking:
   - tanggal_list = create_date Odoo
   - tanggal_terima = tanggal GR selesai Odoo (untuk item CLOSED / DONE yang tanggal_terimanya null)
   - link_gr = tautan Odoo ke dokumen GR
4. Menghitung ulang avg_lead_time dan max_lead_time pada master sparepart yang terhubung
   berdasarkan data historis riil penerimaan barang.
"""

import paramiko
import json
import time
import urllib.request
from datetime import datetime

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'
ODOO_URL = "https://foomx.odoo.com/web/dataset/call_kw"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

# 1. Dapatkan Odoo session_id dari mtc_settings
stdin, stdout, stderr = ssh.exec_command('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -t -c "SELECT value FROM mtc_settings WHERE key = 'mtc_odoo_session_id';" ''')
session_id = stdout.read().decode('utf-8').strip()
print(f"[*] Menggunakan Odoo session_id: {session_id[:10]}...{session_id[-6:]}")

def query_odoo(model, method, args, kwargs={}):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": { "model": model, "method": method, "args": args, "kwargs": kwargs },
        "id": int(time.time() * 1000) % 100000
    }
    req = urllib.request.Request(
        ODOO_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Cookie": f"session_id={session_id}"}
    )
    with urllib.request.urlopen(req, timeout=45) as res:
        data = json.loads(res.read().decode("utf-8"))
        if data.get("error"):
            raise Exception(json.dumps(data["error"]))
        return data.get("result", [])

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

# 2. Ambil seluruh data procurement_tracking dari VPS DB
fetch_script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.procurementTracking.findMany({
    select: {
      id: true,
      nomorPr: true,
      nomorPo: true,
      originalName: true,
      qty: true,
      statusPr: true,
      statusPo: true,
      tanggalList: true,
      tanggalTerima: true,
      linkGr: true,
      sparepartId: true
    }
  });
  console.log(JSON.stringify(items));
}
main().finally(() => prisma.$disconnect());
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/fetch_all_tracking.js', 'w') as f:
    f.write(fetch_script)
sftp.close()

print("[*] Mengambil seluruh baris procurement_tracking dari DB...")
stdin, stdout, stderr = ssh.exec_command('''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node /tmp/fetch_all_tracking.js''')
raw_items = stdout.read().decode('utf-8')
err = stderr.read().decode('utf-8')
if not raw_items.strip():
    print("[-] Error fetching items:", err)
    exit(1)

items = json.loads(raw_items)
print(f"[+] Total baris procurement_tracking di DB: {len(items)}")

unique_prs = sorted(list(set([it['nomorPr'].strip() for it in items if it.get('nomorPr')])))
unique_pos = sorted(list(set([it['nomorPo'].strip() for it in items if it.get('nomorPo')])))
print(f"[+] Unique PR: {len(unique_prs)}, Unique PO: {len(unique_pos)}")

# 3. Batch query Odoo PR create_date
print("[*] Menarik create_date untuk semua PR dari Odoo...")
pr_create_dates = {}
for pr_chunk in chunked(unique_prs, 100):
    prs_data = query_odoo("purchase.request", "search_read", [[["name", "in", pr_chunk]]], {
        "fields": ["name", "create_date"]
    })
    for p in prs_data:
        if p.get("name") and p.get("create_date"):
            pr_create_dates[p["name"]] = p["create_date"]

print(f"[+] Berhasil mendapatkan create_date Odoo untuk {len(pr_create_dates)} / {len(unique_prs)} PR.")

# 4. Batch query Odoo PO & GR
print("[*] Menarik data PO & status GR dari Odoo...")
po_gr_info = {}

for po_chunk in chunked(unique_pos, 100):
    pos_data = query_odoo("purchase.order", "search_read", [[["name", "in", po_chunk]]], {
        "fields": ["id", "name", "state", "picking_ids"]
    })
    po_by_id = {p["id"]: p["name"] for p in pos_data}
    po_ids = list(po_by_id.keys())
    
    if not po_ids:
        continue

    grs_data = query_odoo("good.received", "search_read", [[["purchase_id", "in", po_ids], ["state", "in", ["done", "approved"]]]], {
        "fields": ["id", "name", "purchase_id", "state", "write_date", "date"]
    })
    for g in grs_data:
        pid = g["purchase_id"][0] if isinstance(g["purchase_id"], list) else g["purchase_id"]
        po_name = po_by_id.get(pid)
        if po_name:
            gr_date = g.get("write_date") or g.get("date")
            gr_link = f"https://foomx.odoo.com/web#id={g['id']}&model=good.received&view_type=form"
            if po_name not in po_gr_info or (gr_date and gr_date > (po_gr_info[po_name].get("gr_date") or "")):
                po_gr_info[po_name] = {
                    "gr_date": gr_date,
                    "gr_link": gr_link,
                    "gr_name": g.get("name")
                }

    uncovered_pos = [p for p in po_chunk if p not in po_gr_info]
    if uncovered_pos:
        picks_data = query_odoo("stock.picking", "search_read", [[["origin", "in", uncovered_pos], ["state", "=", "done"]]], {
            "fields": ["id", "name", "origin", "state", "date_done"]
        })
        for pk in picks_data:
            orig = pk.get("origin")
            if orig and orig not in po_gr_info:
                po_gr_info[orig] = {
                    "gr_date": pk.get("date_done"),
                    "gr_link": f"https://foomx.odoo.com/web#id={pk['id']}&model=stock.picking&view_type=form",
                    "gr_name": pk.get("name")
                }

print(f"[+] Berhasil mendapatkan data GR selesai untuk {len(po_gr_info)} / {len(unique_pos)} PO.")

# 5. Siapkan update SQL untuk procurement_tracking
sql_lines = ["BEGIN;"]

updated_tracking_data = {} # id -> { tanggal_list, tanggal_terima, sparepart_id }

for it in items:
    item_id = it["id"]
    pr_name = it.get("nomorPr")
    po_name = it.get("nomorPo")
    curr_pr_date = it.get("tanggalList")
    curr_rx_date = it.get("tanggalTerima")
    sp_id = it.get("sparepartId")
    
    final_pr_date = curr_pr_date
    final_rx_date = curr_rx_date

    # 1. Update PR date jika ada di Odoo
    if pr_name and pr_name in pr_create_dates:
        odoo_pr_dt = pr_create_dates[pr_name]
        sql_lines.append(f"UPDATE procurement_tracking SET tanggal_list = '{odoo_pr_dt}' WHERE id = {item_id};")
        final_pr_date = odoo_pr_dt

    # 2. Update GR date jika status closed & belum ada tanggal_terima
    is_closed = it.get("statusPo") in ["DONE", "RECEIVED", "CLOSED"] or it.get("statusPr") in ["RECEIVED", "CLOSED"]
    if is_closed and not curr_rx_date and po_name and po_name in po_gr_info:
        gr = po_gr_info[po_name]
        if gr.get("gr_date"):
            rx_dt = gr["gr_date"]
            gr_link = gr.get("gr_link", "").replace("'", "''")
            sql_lines.append(f"UPDATE procurement_tracking SET tanggal_terima = '{rx_dt}', link_gr = '{gr_link}' WHERE id = {item_id};")
            final_rx_date = rx_dt

    updated_tracking_data[item_id] = {
        "sparepart_id": sp_id,
        "tanggal_list": final_pr_date,
        "tanggal_terima": final_rx_date
    }

# 6. Hitung ulang lead time historis per sparepart
sp_lead_times = {} # sp_id -> list of elapsed_days

def parse_dt(dt_val):
    if not dt_val:
        return None
    if isinstance(dt_val, datetime):
        return dt_val
    dt_str = str(dt_val).replace("T", " ").replace("Z", "")
    for fmt in ["%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]:
        try:
            return datetime.strptime(dt_str[:19], fmt)
        except ValueError:
            pass
    return None

for item_id, d in updated_tracking_data.items():
    sp_id = d.get("sparepart_id")
    if not sp_id:
        continue
    dt_start = parse_dt(d.get("tanggal_list"))
    dt_end = parse_dt(d.get("tanggal_terima"))
    if dt_start and dt_end:
        diff_days = (dt_end - dt_start).total_seconds() / 86400.0
        # Filter data outlier ekstrim yang tidak valid (< 0 atau > 180 hari)
        if 0.5 <= diff_days <= 180:
            if sp_id not in sp_lead_times:
                sp_lead_times[sp_id] = []
            sp_lead_times[sp_id].append(diff_days)

print(f"\n[*] Menghitung lead time historis riil untuk {len(sp_lead_times)} sparepart terhubung...")

sp_updates_count = 0
for sp_id, days_list in sp_lead_times.items():
    avg_lt = round(sum(days_list) / len(days_list), 1)
    max_lt = int(round(max(days_list)))
    sql_lines.append(f"UPDATE sparepart SET avg_lead_time = {avg_lt}, max_lead_time = {max_lt} WHERE id = '{sp_id}';")
    sp_updates_count += 1

sql_lines.append("COMMIT;")

# 7. Tulis file SQL dan eksekusi di VPS Postgres
print(f"[*] Menjalankan {len(sql_lines)} perintah SQL di database...")
sql_content = "\n".join(sql_lines)

sftp = ssh.open_sftp()
with sftp.file('/tmp/update_leadtimes.sql', 'w') as f:
    f.write(sql_content)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -f /tmp/update_leadtimes.sql")
res_out = stdout.read().decode('utf-8')
res_err = stderr.read().decode('utf-8')

if "ERROR" in res_out or "ERROR" in res_err:
    print("[-] Ada error dalam eksekusi SQL:", res_err)
else:
    print("[+] Berhasil mengeksekusi seluruh pembaruan database secara aman!")

# 8. Verifikasi Hasil di Database
print("\n=== HASIL VERIFIKASI POST-SYNC ===")
stdin, stdout, stderr = ssh.exec_command('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT 
  count(*) as total_procurement,
  count(tanggal_terima) as with_tanggal_terima,
  count(*) - count(tanggal_terima) as pending_terima
FROM procurement_tracking;
"''')
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = ssh.exec_command('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT 
  count(*) as total_spareparts,
  count(CASE WHEN avg_lead_time > 0 THEN 1 END) as sp_with_lead_time,
  ROUND(avg(avg_lead_time)::numeric, 1) as avg_all_sp_lead_time,
  ROUND(max(avg_lead_time)::numeric, 1) as max_sp_lead_time
FROM sparepart;
"''')
print(stdout.read().decode('utf-8'))

# Tampilkan 10 contoh sparepart dengan lead time riilnya
print("\n--- Contoh Sparepart dengan Lead Time Riil & Terkunci ---")
stdin, stdout, stderr = ssh.exec_command('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT id, nama, avg_lead_time, max_lead_time 
FROM sparepart 
WHERE avg_lead_time > 0 
ORDER BY avg_lead_time DESC 
LIMIT 10;
"''')
print(stdout.read().decode('utf-8'))

ssh.close()
