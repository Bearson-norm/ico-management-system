import urllib.request, json

url = "https://foomx.odoo.com/web/dataset/call_kw"
session_id = "a63c41331eacbddc78421b46e350282af18ee085"

payload = {
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "model": "purchase.requisition.line",
        "method": "search_read",
        "args": [[["requisition_id", "=", 4364]]],
        "kwargs": {"fields": ["id", "requisition_id", "product_id", "product_qty", "price_unit", "product_description_variants"]}
    },
    "id": 1
}

req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "Cookie": f"session_id={session_id}"})
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
        print("Lines for TE04546 in Odoo:", json.dumps(data.get("result", []), indent=2))
except Exception as e:
    print("Error:", e)
