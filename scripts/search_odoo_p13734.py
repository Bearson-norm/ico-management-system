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
  try {
    console.log('Searching purchase.order in Odoo for P13734 or 13734...');
    const pos = await queryOdoo('purchase.order', 'search_read', [
      [['name', 'ilike', '13734']]
    ], {
      fields: ['id', 'name', 'date_order', 'state', 'partner_id', 'order_line', 'amount_total'],
      limit: 10
    });
    console.log('Odoo PO Search Result:');
    console.log(JSON.stringify(pos, null, 2));

    // Also search purchase.request if model exists
    try {
      const prs = await queryOdoo('purchase.request', 'search_read', [
        [['name', 'ilike', '13734']]
      ], {
        fields: ['id', 'name', 'date_start', 'state'],
        limit: 10
      });
      console.log('Odoo PR Search Result:');
      console.log(JSON.stringify(prs, null, 2));
    } catch(e) {
      console.log('purchase.request model query failed:', e.message);
    }
  } catch (err) {
    console.error('Odoo Query Error:', err.message);
  }
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
