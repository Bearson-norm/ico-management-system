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

print("=== Checking PO P14526 in Odoo ===")
pos = query_odoo("purchase.order", "search_read", [[["name", "=", "P14526"]]], {"fields": ["id", "name", "state", "origin"]})
print("PO P14526:", json.dumps(pos, indent=2))

print("\n=== Checking PR04598 in Odoo ===")
prs = query_odoo("purchase.requisition", "search_read", [[["name", "ilike", "04598"]]], {"fields": ["id", "name", "state", "origin"]})
if not prs:
    prs = query_odoo("purchase.request", "search_read", [[["name", "ilike", "04598"]]], {"fields": ["id", "name", "state"]})
print("PR04598:", json.dumps(prs, indent=2))

print("\n=== VPS DB items for PR04598 ===")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: { nomorPr: 'PR04598' }
  });
  items.forEach(i => console.log(JSON.stringify({ id: i.id, pr: i.nomorPr, po: i.nomorPo, name: i.originalName, statusPr: i.statusPr, statusPo: i.statusPo })));
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
ssh.close()
