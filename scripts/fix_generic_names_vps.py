import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = '''DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { PrismaClient } = require('./lib/generated/mtc');
const prisma = new PrismaClient();

const GENERIC_NAMES = [
  'EQUIPMENT', 'SPAREPARTS USAGE', 'SUPPLIES', 'FACTORY SUPPLIES', 'Barang GA', 'Produk Tanpa Nama',
  'REPAIR AND MAINTENANCE', 'REPAIR & MAINTENANCE', 'MEDIA PLACEMENT', 'SPONSORSHIP', 'MARKETING SUPPLIES',
  'OVERHEADS', 'OVERHEAD', 'OVERHEAD EXPENSE', 'OVERHEAD EXPENSES', 'UTILITY', 'UTILITIES',
  'DIRECT EXPENSE', 'DIRECT EXPENSES', 'INDIRECT EXPENSE', 'INDIRECT EXPENSES', 'GENERAL EXPENSE', 'GENERAL EXPENSES',
  'CONSUMABLES', 'CONSUMABLE', 'LAB CONSUMABLE', 'LAB CONSUMABLES', 'LABORATORY CONSUMABLE', 'LABORATORY CONSUMABLES',
  'LAB SUPPLIES', 'LABORATORY SUPPLIES', 'SAFETY SUPPLIES', 'SAFETY EQUIPMENT', 'OTHER EXPENSES', 'OTHER EXPENSE',
  'SERVICES', 'SERVICE', 'HARDWARE', 'TOOLS', 'TOOL'
];

function isGeneric(name) {
  if (!name) return true;
  const t = name.trim().toLowerCase();
  if (GENERIC_NAMES.some(g => t === g.toLowerCase())) return true;
  if (/consumable|overhead|utility|supplies|equipment|repair.*maintenance/i.test(t) && !/\\d/.test(t)) return true;
  return false;
}

function cleanHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

async function main() {
  const items = await prisma.procurementTracking.findMany();
  console.log('Total items in MTC:', items.length);
  
  let fixedCount = 0;
  for (const item of items) {
    if (!isGeneric(item.originalName)) continue;
    
    let newName = null;

    // 1. Try from keterangan if available and not HTML
    const cleanedKet = cleanHtml(item.keterangan);
    if (cleanedKet && !isGeneric(cleanedKet) && cleanedKet.length > 2) {
      newName = cleanedKet;
    }

    // 2. Try from odooNotes chatter body: <li><b>Product Name</b>
    if (!newName && item.odooNotes) {
      try {
        const notes = JSON.parse(item.odooNotes);
        for (const n of notes) {
          if (n.body && n.body.includes('<li><b>')) {
            const matches = n.body.match(/<li><b>([^<]+)<\\/b>/g);
            if (matches && matches.length) {
              const names = matches.map(m => m.replace(/<\\/?b>/g, '').replace('<li>', '').trim()).filter(x => !isGeneric(x));
              if (names.length) {
                newName = names[0];
                break;
              }
            }
          }
        }
      } catch (e) {}
    }

    if (newName && newName !== item.originalName) {
      console.log('Fixing item ID ' + item.id + ' (' + item.nomorPr + ' / ' + item.nomorPo + '): ' + item.originalName + ' -> ' + newName);
      await prisma.procurementTracking.update({
        where: { id: item.id },
        data: { originalName: newName }
      });
      fixedCount++;
    }
  }

  console.log('Fixed count:', fixedCount);
}

main().catch(err => console.error(err)).finally(() => prisma.\\$disconnect());
"'''

stdin, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}")
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("STDOUT:", out)
if err: print("STDERR:", err)
ssh.close()
