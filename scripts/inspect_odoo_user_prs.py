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
  console.log('Inspecting current Odoo session user (res.users)...');

  // Check user info for current session
  try {
    const userInfo = await queryOdoo('res.users', 'search_read', [
      [['login', '=', 'puput@foom.id']]
    ], {
      fields: ['id', 'name', 'login', 'email']
    });
    console.log('Odoo User Info for puput@foom.id:');
    console.log(JSON.stringify(userInfo, null, 2));

    const userId = userInfo.length > 0 ? userInfo[0].id : null;

    if (userId) {
      // Check PRs created by this user
      try {
        const prs = await queryOdoo('purchase.request', 'search_read', [
          ['|', ['create_uid', '=', userId], ['requested_by', '=', userId]]
        ], {
          fields: ['id', 'name', 'date_start', 'state', 'create_uid', 'requested_by', 'line_ids'],
          limit: 100
        });
        console.log(\`Found \${prs.length} Purchase Requests in Odoo for user ID \${userId}:\`);
        console.log(JSON.stringify(prs.slice(0, 10), null, 2));
      } catch (e) {
        console.log('purchase.request query error:', e.message);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
