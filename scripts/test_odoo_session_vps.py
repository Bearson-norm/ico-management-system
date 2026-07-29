import urllib.request
import json

url = "https://foomx.odoo.com/web/dataset/call_kw"
session_id = "a63c41331eacbddc78421b46e350282af18ee085"

payload = {
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "model": "purchase.requisition",
        "method": "search_read",
        "args": [[["user_id", "=", 34]]],
        "kwargs": {"fields": ["id", "name", "origin", "state", "user_id"], "limit": 5}
    },
    "id": 1
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Cookie": f"session_id={session_id}"
    }
)

try:
    with urllib.request.urlopen(req) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        if "error" in res_data:
            print("ODOO ERROR:", res_data["error"])
        else:
            result = res_data.get("result", [])
            print(f"SUCCESS! Found {len(result)} items for user_id 34 (PROD. SPV LIQ):")
            for item in result:
                print(f"  - ID:{item['id']} | Name:{item['name']} | Origin:{item.get('origin')} | State:{item['state']} | User:{item.get('user_id')}")
except Exception as e:
    print("HTTP/Network Error:", e)
