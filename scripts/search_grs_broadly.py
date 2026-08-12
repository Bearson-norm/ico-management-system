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

print("=== Search GRs containing P06430 or P06447 ===")
grs1 = query_odoo("good.received", "search_read", [[
    "|", "|",
    ["name", "ilike", "06430"],
    ["purchase", "ilike", "06430"],
    ["moves", "ilike", "06430"]
]], {"fields": ["id", "name", "state", "purchase", "moves"]})
print("GRs matching 06430:", json.dumps(grs1, indent=2))

print("=== Search GRs containing P04345 or P04346 ===")
grs2 = query_odoo("good.received", "search_read", [[
    "|", "|",
    ["name", "ilike", "04345"],
    ["purchase", "ilike", "04345"],
    ["moves", "ilike", "04345"]
]], {"fields": ["id", "name", "state", "purchase", "moves"]})
print("GRs matching 04345:", json.dumps(grs2, indent=2))

print("=== Search GRs containing PR00948 or PR00198 ===")
grs3 = query_odoo("good.received", "search_read", [[
    "|",
    ["name", "ilike", "00948"],
    ["purchase", "ilike", "00948"]
]], {"fields": ["id", "name", "state", "purchase", "moves"]})
print("GRs matching PR00948:", json.dumps(grs3, indent=2))

grs4 = query_odoo("good.received", "search_read", [[
    "|",
    ["name", "ilike", "00198"],
    ["purchase", "ilike", "00198"]
]], {"fields": ["id", "name", "state", "purchase", "moves"]})
print("GRs matching PR00198:", json.dumps(grs4, indent=2))
