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

print("=== 1. Odoo PO P14547 Lines ===")
po_lines = query_odoo("purchase.order.line", "search_read", [[["order_id.name", "=", "P14547"]]], {"fields": ["id", "name", "product_qty", "qty_received", "price_unit", "price_total"]})
print(json.dumps(po_lines, indent=2))

print("\n=== 2. Odoo good.received for P14547 ===")
grs = query_odoo("good.received", "search_read", [[["name", "contains", "P14547"]]], {"fields": ["id", "name", "state", "purchase_id"]})
print(json.dumps(grs, indent=2))

print("\n=== 3. VPS DB Items for PR04637 / P14547 ===")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: { OR: [{ nomorPr: 'PR04637' }, { nomorPo: 'P14547' }] }
  });
  console.log(JSON.stringify(items, null, 2));
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
ssh.close()
