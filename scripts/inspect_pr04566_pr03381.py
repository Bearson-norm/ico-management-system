import sys, urllib.request, json
import paramiko

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
print("1. CHECKING PR04566 IN ODOO")
print("==========================================")
pos_pr04566 = query_odoo("purchase.order", "search_read", [[
    "|", "|",
    ["origin", "ilike", "04566"],
    ["partner_ref", "ilike", "04566"],
    ["origin", "ilike", "04479"]
]], {"fields": ["id", "name", "state", "origin", "partner_ref", "partner_id", "date_order"]})
print("POs matching PR04566:", json.dumps(pos_pr04566, indent=2))

for po in pos_pr04566:
    lines = query_odoo("purchase.order.line", "search_read", [[["order_id", "=", po["id"]]]], {"fields": ["id", "name", "product_qty", "qty_received", "price_unit"]})
    print(f"  Lines for {po['name']}:", json.dumps(lines, indent=2))

reqs_pr04566 = query_odoo("purchase.requisition", "search_read", [[["name", "ilike", "04479"]]], {"fields": ["id", "name", "origin", "state"]})
print("Requisitions for TE04479:", json.dumps(reqs_pr04566, indent=2))

print("\n==========================================")
print("2. CHECKING PR03381 IN ODOO")
print("==========================================")
pos_pr03381 = query_odoo("purchase.order", "search_read", [[
    "|",
    ["origin", "ilike", "03381"],
    ["partner_ref", "ilike", "03381"]
]], {"fields": ["id", "name", "state", "origin", "partner_ref", "partner_id", "date_order"]})
print("POs matching PR03381:", json.dumps(pos_pr03381, indent=2))

for po in pos_pr03381:
    lines = query_odoo("purchase.order.line", "search_read", [[["order_id", "=", po["id"]]]], {"fields": ["id", "name", "product_qty", "qty_received", "price_unit"]})
    print(f"  Lines for {po['name']}:", json.dumps(lines, indent=2))

reqs_pr03381 = query_odoo("purchase.requisition", "search_read", [[["origin", "ilike", "03381"]]], {"fields": ["id", "name", "origin", "state"]})
if not reqs_pr03381:
    reqs_pr03381 = query_odoo("purchase.request", "search_read", [[["name", "ilike", "03381"]]], {"fields": ["id", "name", "state"]})
print("PR/TE info for PR03381:", json.dumps(reqs_pr03381, indent=2))

print("\n==========================================")
print("3. VPS DB RECORDS FOR PR04566 AND PR03381")
print("==========================================")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: { OR: [{ nomorPr: 'PR04566' }, { nomorPr: 'PR03381' }] }
  });
  items.forEach(i => console.log(JSON.stringify({ id: i.id, pr: i.nomorPr, po: i.nomorPo, te: i.nomorTe, name: i.originalName, statusPr: i.statusPr, statusPo: i.statusPo, date: i.tanggalList })));
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
ssh.close()
