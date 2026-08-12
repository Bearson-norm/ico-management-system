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
  // Fetch PO P13734 header
  const poHeaders = await queryOdoo('purchase.order', 'search_read', [
    [['name', '=', 'P13734']]
  ], {
    fields: ['id', 'name', 'date_order', 'state', 'partner_id', 'order_line']
  });

  if (!poHeaders || poHeaders.length === 0) {
    console.log('PO P13734 not found in Odoo');
    return;
  }

  const po = poHeaders[0];
  const vendorName = Array.isArray(po.partner_id) ? po.partner_id[1] : null;

  // Fetch lines
  const lines = await queryOdoo('purchase.order.line', 'search_read', [
    [['order_id', '=', po.id]]
  ], {
    fields: ['id', 'name', 'product_id', 'product_qty', 'price_unit', 'price_subtotal', 'date_planned']
  });

  console.log(\`Found \${lines.length} lines for PO P13734 in Odoo. Inserting into DB...\`);

  let countCreated = 0;
  for (const line of lines) {
    const rawProdName = Array.isArray(line.product_id) ? line.product_id[1] : '';
    const itemOriginalName = line.name || rawProdName || 'Produk Tanpa Nama';

    // Check if record already exists
    const existing = await prisma.procurementTracking.findFirst({
      where: {
        nomorPo: 'P13734',
        originalName: itemOriginalName
      }
    });

    if (!existing) {
      // Find sparepart match if any
      const cleanProd = itemOriginalName.toLowerCase().trim();
      const matchedSp = await prisma.sparepart.findFirst({
        where: {
          aktif: true,
          OR: [
            { nama: { equals: itemOriginalName, mode: 'insensitive' } },
            { namaAlias: { equals: itemOriginalName, mode: 'insensitive' } }
          ]
        }
      });

      await prisma.procurementTracking.create({
        data: {
          originalName: itemOriginalName,
          sparepartId: matchedSp ? matchedSp.id : null,
          qty: Math.round(Number(line.product_qty) || 1),
          harga: Number(line.price_unit) || 0,
          nomorPo: 'P13734',
          statusPo: 'DONE',
          statusPr: 'RECEIVED',
          vendor: vendorName,
          tanggalList: po.date_order ? new Date(po.date_order) : new Date(),
          tanggalTerima: line.date_planned ? new Date(line.date_planned) : new Date(po.date_order),
          productCategory: 'Sparepart',
          urgency: 'Normal',
          isStocked: true,
        }
      });
      countCreated++;
    }
  }

  console.log(\`Successfully imported \${countCreated} items for PO P13734 into procurement_tracking table!\`);
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=120)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
