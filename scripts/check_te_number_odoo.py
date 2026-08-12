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

print("=== Searching Requisitions matching PR04637 in Odoo ===")
reqs = query_odoo("purchase.requisition", "search_read", [[["origin", "ilike", "04637"]]], {"fields": ["id", "name", "origin", "description", "create_date"]})
print("Requisitions (purchase.requisition):", json.dumps(reqs, indent=2))

if not reqs:
    print("=== Searching Requests (purchase.request) ===")
    reqs2 = query_odoo("purchase.request", "search_read", [[["name", "ilike", "04637"]]], {"fields": ["id", "name", "description"]})
    print("Requests (purchase.request):", json.dumps(reqs2, indent=2))
