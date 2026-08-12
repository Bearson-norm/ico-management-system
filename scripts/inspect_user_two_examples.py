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

print("=== EXAMPLE 1: PR00948 (Nitrogen UPH) ===")
pos_pr00948 = query_odoo("purchase.order", "search_read", [[["origin", "ilike", "00948"]]], {"fields": ["id", "name", "state", "origin", "partner_id"]})
print("POs matching PR00948 in Odoo:", json.dumps(pos_pr00948, indent=2))

for po in pos_pr00948:
    grs = query_odoo("good.received", "search_read", [[["purchase_id", "=", po["id"]]]], {"fields": ["id", "name", "state", "write_date"]})
    print(f"  good.received for {po['name']}: {json.dumps(grs)}")

print("\n=== EXAMPLE 2: PR02337 / P10217 (Oil Filter MCA15008) ===")
pos_pr02337 = query_odoo("purchase.order", "search_read", [[["name", "=", "P10217"]]], {"fields": ["id", "name", "state", "origin", "partner_id"]})
print("POs matching P10217 in Odoo:", json.dumps(pos_pr02337, indent=2))

for po in pos_pr02337:
    grs = query_odoo("good.received", "search_read", [[["purchase_id", "=", po["id"]]]], {"fields": ["id", "name", "state", "write_date"]})
    print(f"  good.received for {po['name']}: {json.dumps(grs)}")

print("\n=== VPS DB status for PR00948 and PR02337 ===")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: { OR: [{ nomorPr: 'PR00948' }, { nomorPr: 'PR02337' }] }
  });
  for (const i of items) {
    console.log(JSON.stringify({ id: i.id, pr: i.nomorPr, po: i.nomorPo, name: i.originalName, statusPr: i.statusPr, statusPo: i.statusPo, tanggalTerima: i.tanggalTerima, linkGr: i.linkGr, linkReferences: i.linkReferences }));
  }
}
main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
ssh.close()
