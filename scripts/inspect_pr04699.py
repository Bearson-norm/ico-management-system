import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    return out, err

node_script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.procurementTracking.findMany({
    where: {
      nomorPr: 'PR04699'
    }
  });
  console.log('All items for PR04699:');
  for (const it of items) {
    console.log(`ID: ${it.id} | Name: ${it.originalName} | PO: ${it.nomorPo} | StatusPR: ${it.statusPr} | StatusPO: ${it.statusPo} | Qty: ${it.qty} | Vendor: ${it.vendor} | LinkGR: ${it.linkGr}`);
  }
}

main().finally(() => prisma.$disconnect());
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/check_pr.js', 'w') as f:
    f.write(node_script)
sftp.close()

out, err = run_cmd('node /tmp/check_pr.js')
print("Node Result:")
print(out)
if err:
    print("ERR:", err)

ssh.close()
