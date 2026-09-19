import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.encode('ascii', errors='backslashreplace').decode('ascii'))
    if err:
        print("ERR:", err.encode('ascii', errors='backslashreplace').decode('ascii'))
    return out

test_node = """
const fs = require('fs');
const { encode } = require('next-auth/jwt');
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();

// Parse .env
const envText = fs.readFileSync('.env', 'utf-8');
let secret = '';
let nextAuthUrl = '';
for (const line of envText.split('\\n')) {
  const m1 = line.match(/^NEXTAUTH_SECRET=(.*)$/);
  if (m1) secret = m1[1].trim().replace(/^["']|["']$/g, '');
  const m2 = line.match(/^NEXTAUTH_URL=(.*)$/);
  if (m2) nextAuthUrl = m2[1].trim().replace(/^["']|["']$/g, '');
}

async function testAuth() {
  const user = await prisma.user.findFirst({ where: { role: 'editor', aktif: true } });
  console.log('User found:', user ? user.username : 'none');
  console.log('Secret found:', secret ? 'YES' : 'NO');
  console.log('NEXTAUTH_URL:', nextAuthUrl);
  const isSecure = nextAuthUrl.startsWith('https://');
  const cookieName = (isSecure ? '__Secure-' : '') + 'next-auth.session-token.mtc';
  console.log('Cookie name:', cookieName);

  const token = {
    id: String(user.id),
    name: user.namaLengkap,
    email: user.username,
    role: 'editor',
    tenant: 'mtc',
  };
  const sessionToken = await encode({ token, secret });

  // Test calling GET /api/mtc/procurement
  const res = await fetch('http://127.0.0.1:1325/api/mtc/procurement?limit=1', {
    headers: {
      'Cookie': `${cookieName}=${sessionToken}; next-auth.session-token.mtc=${sessionToken}`
    }
  });
  console.log('API Status:', res.status);
  const json = await res.json();
  console.log('API Response success:', json.success);
}
testAuth().catch(console.error).finally(() => prisma.$disconnect());
"""

sftp = ssh.open_sftp()
with sftp.file('/var/www/ico-management-system/scratch_auth_test.js', 'w') as f:
    f.write(test_node)
sftp.close()

run_cmd("cd /var/www/ico-management-system && node scratch_auth_test.js")
run_cmd("rm -f /var/www/ico-management-system/scratch_auth_test.js")

ssh.close()
