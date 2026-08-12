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
  console.log('Querying total Purchase Orders in Odoo...');
  const totalPos = await queryOdoo('purchase.order', 'search_count', [
    [['state', 'in', ['purchase', 'done', 'to approve', 'draft']]]
  ]);

  console.log('Total Purchase Orders in Odoo:', totalPos);

  // Fetch latest 50 POs to inspect names & numbers
  const pos = await queryOdoo('purchase.order', 'search_read', [
    [['state', 'in', ['purchase', 'done', 'to approve', 'draft']]]
  ], {
    fields: ['id', 'name', 'date_order', 'state', 'partner_id'],
    limit: 50,
    order: 'id desc'
  });

  console.log('Sample Latest POs from Odoo:');
  pos.slice(0, 10).forEach(p => {
    console.log(\`ID: \${p.id} | PO: \${p.name} | Date: \${p.date_order} | State: \${p.state} | Vendor: \${Array.isArray(p.partner_id) ? p.partner_id[1] : p.partner_id}\`);
  });
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
