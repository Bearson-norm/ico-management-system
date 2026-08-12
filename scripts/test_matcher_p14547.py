import sys, paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

cmd = '''cd /var/www/ico-management-system && DATABASE_URL_MTC="postgresql://admin:Admin123@127.0.0.1:5433/mtc_db" node -e "
const { findBestMatchedLine } = require('./app/api/mtc/odoo/sync/route.ts');
"'''

# Let's test the matcher directly in node
cmd2 = '''cd /var/www/ico-management-system && node -e "
const lines = [
  { name: 'Pasir Silika Pasir Untuk Filter Air Pam / Sumur Kotor 50Kg Per Sak', product_id: [1, 'SUPPLIES FACTORY RELATED'], product_qty: 5, qty_received: 0 },
  { name: 'Resin Cation / Kation PUROLITE Softener untuk Filter Air C100-E (25kg)', product_id: [2, 'SUPPLIES FACTORY RELATED'], product_qty: 10, qty_received: 0 }
];

const item = {
  originalName: 'Carbon Actived Filter Air / Karbon Aktif Procarb Isi 25 Kg',
  qty: 10
};

const MATCH_STOP_WORDS = new Set(['per', 'isi', 'sak', 'untuk', 'kg', 'pcs', 'dan', 'atau', 'dengan', 'filter', 'air', 'gedung', 'sumur', 'kotor', 'pam', 'repeat', 'order', 'kebutuhan']);
const getMatchTokens = (str) => {
  if (!str || typeof str !== 'string') return [];
  return str.toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').split(/\\s+/).filter(w => w.length > 2 && !MATCH_STOP_WORDS.has(w));
};

console.log('Item tokens:', getMatchTokens(item.originalName));
console.log('Line 1 tokens:', getMatchTokens(lines[0].name));
console.log('Line 2 tokens:', getMatchTokens(lines[1].name));
"'''

stdin, stdout, stderr = ssh.exec_command(cmd2)
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
ssh.close()
