import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

cmd = """node -e "
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function queryOdoo(model, method, args, kwargs = {}) {
  const mtcSettings = await prisma.mtcSetting.findMany();
  const sessionId = mtcSettings.find(s => s.key === 'mtc_odoo_session_id')?.value || '';
  
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
    id: Math.floor(Math.random() * 10000)
  };

  const res = await fetch('https://foomx.odoo.com/web/dataset/call_kw', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': \`session_id=\${sessionId}\`
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function main() {
  const lines = await queryOdoo('purchase.order.line', 'search_read', [
    [['order_id', '=', 13920]]
  ], {
    fields: ['id', 'name', 'product_id', 'product_qty', 'price_unit', 'price_subtotal', 'date_planned']
  });

  console.log('PO P13734 Lines from Odoo:');
  console.log(JSON.stringify(lines, null, 2));
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
