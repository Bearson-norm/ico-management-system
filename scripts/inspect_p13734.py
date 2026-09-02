import urllib.request, json, time

url = 'https://foomx.odoo.com/web/dataset/call_kw'
session_id = 'a63c41331eacbddc78421b46e350282af18ee085'

def query_odoo(model, method, args, kwargs={}):
    payload = {
        'jsonrpc': '2.0',
        'method': 'call',
        'params': { 'model': model, 'method': method, 'args': args, 'kwargs': kwargs },
        'id': int(time.time() * 1000) % 100000
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json', 'Cookie': f'session_id={session_id}'})
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode('utf-8'))
        return data.get('result', [])

print("Searching PO P13734 in Odoo...")
pos = query_odoo('purchase.order', 'search_read', [[['name', '=', 'P13734']]], {'fields': ['id', 'name', 'origin', 'partner_id', 'date_order', 'state']})
print("PO P13734:", pos)

if pos and pos[0].get('origin'):
    origin = pos[0]['origin']
    print(f"Origin of P13734 is: '{origin}'")
    # If origin is a TE / requisition, search requisition
    te = query_odoo('purchase.requisition', 'search_read', [[['name', '=', origin]]], {'fields': ['id', 'name', 'origin']})
    print("TE record:", te)
