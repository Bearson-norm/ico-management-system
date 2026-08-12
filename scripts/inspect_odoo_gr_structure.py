import urllib.request, json

url = "https://foomx.odoo.com/web/dataset/call_kw"
session_id = "a63c41331eacbddc78421b46e350282af18ee085"

def query_odoo(model, method, args, kwargs={}):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": { "model": model, "method": method, "args": args, "kwargs": kwargs },
        "id": 1
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "Cookie": f"session_id={session_id}"})
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
        return data.get("result", [])

try:
    # 1. Inspect purchase.order lines for recent POs
    pos = query_odoo("purchase.order", "search_read", [[["state", "in", ["purchase", "done"]]]], {"fields": ["id", "name", "state"], "limit": 5, "order": "id desc"})
    print("Recent confirmed/done POs:", json.dumps(pos, indent=2))

    for po in pos:
        po_id = po["id"]
        po_name = po["name"]
        print(f"\n--- Checking PO {po_name} (ID: {po_id}) ---")
        lines = query_odoo("purchase.order.line", "search_read", [[["order_id", "=", po_id]]], {"fields": ["name", "product_qty", "qty_received", "price_unit"]})
        print(f"  Lines count: {len(lines)}")
        for l in lines:
            print(f"    Line '{l['name']}': qty={l['product_qty']}, qty_received={l['qty_received']}")
        
        # Check good.received model
        try:
            grs = query_odoo("good.received", "search_read", [[["purchase_id", "=", po_id]]], {"fields": ["id", "name", "state", "write_date"]})
            print(f"  good.received query result: {json.dumps(grs)}")
        except Exception as e_gr:
            print(f"  good.received query failed: {e_gr}")

        # Check stock.picking model
        try:
            pickings = query_odoo("stock.picking", "search_read", [[["origin", "=", po_name]]], {"fields": ["id", "name", "state", "date_done"]})
            print(f"  stock.picking query result: {json.dumps(pickings)}")
        except Exception as e_sp:
            print(f"  stock.picking query failed: {e_sp}")

except Exception as e:
    print("Error:", e)
