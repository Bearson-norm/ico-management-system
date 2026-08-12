import urllib.request, json

url = "https://foomx.odoo.com/web/dataset/call_kw"
session_id = "a63c41331eacbddc78421b46e350282af18ee085"

payload = {
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "model": "purchase.requisition",
        "method": "search_read",
        "args": [[["origin", "=", "PR04595"]]],
        "kwargs": {"fields": ["id", "name", "origin", "state", "create_date", "user_id"]}
    },
    "id": 1
}

req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "Cookie": f"session_id={session_id}"})
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
        print("Requisitions for PR04595 in Odoo:", json.dumps(data.get("result", []), indent=2))
except Exception as e:
    print("Error:", e)
