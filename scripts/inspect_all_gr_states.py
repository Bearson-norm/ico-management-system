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
    grs = query_odoo("good.received", "search_read", [[]], {"fields": ["id", "name", "state", "purchase_id", "write_date"], "limit": 20, "order": "id desc"})
    print("Sample 20 good.received records in Odoo:")
    for gr in grs:
        print(f"  - ID:{gr['id']} | Name:{gr['name']} | State:{gr['state']} | PO:{gr.get('purchase_id')} | Date:{gr.get('write_date')}")
except Exception as e:
    print("Error:", e)
