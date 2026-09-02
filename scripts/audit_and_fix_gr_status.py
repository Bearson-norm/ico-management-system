import paramiko
import urllib.request
import json
import time

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ODOO_URL = "https://foomx.odoo.com/web/dataset/call_kw"
SESSION_ID = "a63c41331eacbddc78421b46e350282af18ee085"

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
        headers={"Content-Type": "application/json", "Cookie": f"session_id={SESSION_ID}"}
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode("utf-8"))
        if data.get("error"):
            raise Exception(json.dumps(data["error"]))
        return data.get("result", [])

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    return out, err

# Script to fetch all items with nomorPo from DB
fetch_script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      nomorPo: { not: null }
    },
    select: {
      id: true,
      originalName: true,
      qty: true,
      nomorPr: true,
      nomorPo: true,
      statusPr: true,
      statusPo: true,
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
with sftp.file('/tmp/fetch_po_items.js', 'w') as f:
    f.write(fetch_script)
sftp.close()

out, err = run_cmd('node /tmp/fetch_po_items.js')
if err and not out:
    print("Error fetching items:", err)
    exit(1)

items = json.loads(out)
print(f"Total PO items in DB: {len(items)}")

# Group unique PO numbers
po_names = list(set([it['nomorPo'].strip() for it in items if it.get('nomorPo')]))
print(f"Unique PO numbers to audit: {len(po_names)}")

# Query Odoo for all these POs
odoo_pos = query_odoo('purchase.order', 'search_read', [[['name', 'in', po_names]]], {
    'fields': ['id', 'name', 'state', 'partner_id']
})
po_map = {p['name']: p for p in odoo_pos}
po_ids = [p['id'] for p in odoo_pos]

print(f"Found {len(odoo_pos)} POs in Odoo.")

# Batch query PO lines
po_lines = query_odoo('purchase.order.line', 'search_read', [[['order_id', 'in', po_ids]]], {
    'fields': ['id', 'order_id', 'name', 'product_qty', 'qty_received', 'price_unit', 'price_total'],
    'limit': 5000
})
lines_by_po = {}
for l in po_lines:
    p_id = l['order_id'][0] if isinstance(l['order_id'], list) else l['order_id']
    if p_id not in lines_by_po:
        lines_by_po[p_id] = []
    lines_by_po[p_id].append(l)

# Batch query good.received
gr_records = query_odoo('good.received', 'search_read', [[['purchase_id', 'in', po_ids]]], {
    'fields': ['id', 'name', 'purchase_id', 'state', 'write_date'],
    'limit': 5000
})
gr_by_po = {}
for g in gr_records:
    p_id = g['purchase_id'][0] if isinstance(g['purchase_id'], list) else g['purchase_id']
    if p_id not in gr_by_po:
        gr_by_po[p_id] = []
    gr_by_po[p_id].append(g)

# Batch query stock.picking
pickings = query_odoo('stock.picking', 'search_read', [[['origin', 'in', po_names]]], {
    'fields': ['id', 'name', 'origin', 'state', 'date_done'],
    'limit': 5000
})
pick_by_origin = {}
for pk in pickings:
    orig = pk.get('origin')
    if orig:
        if orig not in pick_by_origin:
            pick_by_origin[orig] = []
        pick_by_origin[orig].append(pk)

to_fix_not_gr = []
to_fix_already_gr = []
correct_count = 0

for item in items:
    po_name = item.get('nomorPo')
    if not po_name or po_name not in po_map:
        continue
    
    po = po_map[po_name]
    po_id = po['id']
    p_lines = lines_by_po.get(po_id, [])
    p_grs = gr_by_po.get(po_id, [])
    p_picks = pick_by_origin.get(po_name, [])

    # Check if ANY GR is done
    has_done_gr = any(g.get('state') == 'done' for g in p_grs)
    has_done_picking = any(pk.get('state') == 'done' for pk in p_picks)
    
    # Check lines qty_received
    total_ordered = sum(float(l.get('product_qty') or 0) for l in p_lines)
    total_received = sum(float(l.get('qty_received') or 0) for l in p_lines)
    
    # Matching line for this specific item if possible
    item_orig = item['originalName'].lower().strip()
    matched_l = None
    for l in p_lines:
        lname = (l.get('name') or '').lower().strip()
        if item_orig in lname or lname in item_orig:
            matched_l = l
            break
    
    line_qty_received = float(matched_l.get('qty_received') or 0) if matched_l else 0
    line_product_qty = float(matched_l.get('product_qty') or 0) if matched_l else 0

    # Determine real GR status:
    # A line is RECEIVED (DONE) only if:
    # 1) has_done_gr is True, OR
    # 2) has_done_picking is True, OR
    # 3) (line_qty_received >= line_product_qty and line_product_qty > 0), OR
    # 4) (total_received >= total_ordered and total_ordered > 0)
    # AND none of the GRs are purely in 'draft' with 0 received.
    
    # If all GRs are 'draft' and total_received == 0:
    is_truly_done = False
    if has_done_gr or has_done_picking:
        is_truly_done = True
    elif line_qty_received > 0 and line_qty_received >= line_product_qty:
        is_truly_done = True
    elif total_received > 0 and total_received >= total_ordered:
        is_truly_done = True
    
    current_status_done = (item.get('statusPo') == 'DONE')

    if not is_truly_done and current_status_done:
        # FALSE POSITIVE: marked as DONE but in Odoo it is still DRAFT / 0 received!
        to_fix_not_gr.append({
            'id': item['id'],
            'originalName': item['originalName'],
            'nomorPr': item.get('nomorPr'),
            'nomorPo': po_name,
            'currentStatusPo': item.get('statusPo'),
            'currentTanggalTerima': item.get('tanggalTerima'),
            'sparepartId': item.get('sparepartId'),
            'odooGrState': [g.get('state') for g in p_grs],
            'qtyReceived': total_received,
            'productQty': total_ordered
        })
    elif is_truly_done and not current_status_done:
        # FALSE NEGATIVE: truly DONE in Odoo but still PO in local DB
        done_gr_date = None
        done_gr_link = None
        for g in p_grs:
            if g.get('state') == 'done':
                done_gr_date = g.get('write_date')
                done_gr_link = f"https://foomx.odoo.com/web#id={g['id']}&model=good.received&view_type=form"
                break
        to_fix_already_gr.append({
            'id': item['id'],
            'originalName': item['originalName'],
            'nomorPo': po_name,
            'doneGrDate': done_gr_date,
            'doneGrLink': done_gr_link,
            'sparepartId': item.get('sparepartId')
        })
    else:
        correct_count += 1

print(f"\nAudit Summary:")
print(f"  - Correct items: {correct_count}")
print(f"  - False POSITIVE (Belum GR tapi tercatat DONE): {len(to_fix_not_gr)}")
print(f"  - False NEGATIVE (Sudah GR tapi tercatat PO): {len(to_fix_already_gr)}")

print("\nDetail False POSITIVE (Belum GR tapi tercatat DONE):")
for it in to_fix_not_gr:
    print(f"  ID {it['id']}: PR={it['nomorPr']} PO={it['nomorPo']} | Item='{it['originalName']}' | GR States={it['odooGrState']} QtyRec={it['qtyReceived']}/{it['productQty']}")

ssh.close()
