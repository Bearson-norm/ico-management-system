import sys, urllib.request, json

sys.stdout.reconfigure(encoding='utf-8')

session_id = "a63c41331eacbddc78421b46e350282af18ee085"
url = "https://foomx.odoo.com/web/dataset/call_kw"

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

print("=== 1. Checking stock.picking for P06430 (ID 6431) ===")
pickings1 = query_odoo("stock.picking", "search_read", [[["purchase_id", "=", 6431]]], {"fields": ["id", "name", "state", "origin", "date_done"]})
print("pickings for P06430:", json.dumps(pickings1, indent=2))

print("=== 2. Checking stock.picking for P04345 (ID 4346) ===")
pickings2 = query_odoo("stock.picking", "search_read", [[["purchase_id", "=", 4346]]], {"fields": ["id", "name", "state", "origin", "date_done"]})
print("pickings for P04345:", json.dumps(pickings2, indent=2))

print("=== 3. Checking purchase.order.line for P06430 and P04345 ===")
lines1 = query_odoo("purchase.order.line", "search_read", [[["order_id", "=", 6431]]], {"fields": ["id", "product_id", "name", "product_qty", "qty_received"]})
print("lines for P06430:", json.dumps(lines1, indent=2))

lines2 = query_odoo("purchase.order.line", "search_read", [[["order_id", "=", 4346]]], {"fields": ["id", "product_id", "name", "product_qty", "qty_received"]})
print("lines for P04345:", json.dumps(lines2, indent=2))
