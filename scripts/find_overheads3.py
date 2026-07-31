import paramiko

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = '''node -e "
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
env.split('\\n').forEach(l => {
  const line = l.trim();
  if (!line || line.startsWith('#')) return;
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.substring(0, idx).trim();
    let v = line.substring(idx + 1).trim();
    if ((v.startsWith(\x27\"\x27) && v.endsWith(\x27\"\x27)) || (v.startsWith(\x27\\\'\x27) && v.endsWith(\x27\\\'\x27))) {
      v = v.substring(1, v.length - 1);
    }
    process.env[k] = v;
  }
});

const { PrismaClient: MtcClient } = require('./lib/generated/mtc');
const { PrismaClient: GaClient } = require('./lib/generated/ga');

async function main() {
  const mtc = new MtcClient();
  const ga = new GaClient();
  
  const mtcItems = await mtc.procurementTracking.findMany({
    where: {
      OR: [
        { originalName: { contains: 'OVERHEAD', mode: 'insensitive' } },
        { nomorPr: { contains: '4198' } },
        { nomorPo: { contains: '13890' } }
      ]
    }
  });
  console.log('=== MTC items count:', mtcItems.length);
  console.log(JSON.stringify(mtcItems, null, 2));

  const gaItems = await ga.gaProcurementTracking.findMany({
    where: {
      OR: [
        { originalName: { contains: 'OVERHEAD', mode: 'insensitive' } },
        { nomorPr: { contains: '4198' } },
        { nomorPo: { contains: '13890' } }
      ]
    }
  });
  console.log('=== GA items count:', gaItems.length);
  console.log(JSON.stringify(gaItems, null, 2));
}

main().catch(err => console.error(err)).finally(() => process.exit(0));
"'''
stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("STDOUT:", out)
if err: print("STDERR:", err)
ssh.close()
