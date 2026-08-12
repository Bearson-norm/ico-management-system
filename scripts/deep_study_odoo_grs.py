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

print("==========================================")
print("1. STUDYING PR00948 IN ODOO")
print("==========================================")
pos_pr00948 = query_odoo("purchase.order", "search_read", [[["origin", "ilike", "00948"]]], {"fields": ["id", "name", "state", "origin", "partner_id", "date_order"]})
print("POs found for PR00948:", json.dumps(pos_pr00948, indent=2))

for po in pos_pr00948:
    grs = query_odoo("good.received", "search_read", [[["purchase_id", "=", po["id"]]]], {"fields": ["id", "name", "state", "create_date", "write_date", "moves", "purchase"]})
    print(f"\nGRs for PO {po['name']} (ID {po['id']}, State: {po['state']}):", json.dumps(grs, indent=2))

print("\n==========================================")
print("2. STUDYING PR00198 IN ODOO")
print("==========================================")
pos_pr00198 = query_odoo("purchase.order", "search_read", [[["origin", "ilike", "00198"]]], {"fields": ["id", "name", "state", "origin", "partner_id", "date_order"]})
print("POs found for PR00198:", json.dumps(pos_pr00198, indent=2))

for po in pos_pr00198:
    grs = query_odoo("good.received", "search_read", [[["purchase_id", "=", po["id"]]]], {"fields": ["id", "name", "state", "create_date", "write_date", "moves", "purchase"]})
    print(f"\nGRs for PO {po['name']} (ID {po['id']}, State: {po['state']}):", json.dumps(grs, indent=2))
