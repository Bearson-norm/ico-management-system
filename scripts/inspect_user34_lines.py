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
  console.log('Fetching all PRs for User ID 34 (puput@foom.id)...');

  const prs = await queryOdoo('purchase.request', 'search_read', [
    ['|', ['create_uid', '=', 34], ['requested_by', '=', 34]]
  ], {
    fields: ['id', 'name', 'date_start', 'state', 'requested_by', 'line_ids']
  });

  console.log('Total Purchase Requests for User ID 34:', prs.length);

  const allLineIds = prs.flatMap(p => p.line_ids || []);
  console.log('Total PR line items for User ID 34:', allLineIds.length);

  if (allLineIds.length > 0) {
    const lines = await queryOdoo('purchase.request.line', 'search_read', [
      [['id', 'in', allLineIds.slice(0, 15)]]
    ], {
      fields: ['id', 'request_id', 'product_id', 'name', 'product_qty', 'estimated_cost', 'purchase_lines']
    });

    console.log('Sample PR Line Items for User ID 34:', JSON.stringify(lines, null, 2));
  }
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
