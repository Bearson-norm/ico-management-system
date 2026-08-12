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

function mapPrState(state) {
  switch(state) {
    case 'draft': return 'DRAFT';
    case 'to_approve': return 'TO_APPROVE';
    case 'approved': return 'APPROVED';
    case 'rejected': return 'CANCELLED';
    case 'done': return 'RECEIVED';
    default: return 'DRAFT';
  }
}

async function main() {
  console.log('Fetching all Purchase Requests created/requested by User ID 34 (puput@foom.id)...');

  const prs = await queryOdoo('purchase.request', 'search_read', [
    ['|', ['create_uid', '=', 34], ['requested_by', '=', 34]]
  ], {
    fields: ['id', 'name', 'date_start', 'state', 'requested_by', 'line_ids']
  });

  console.log(\`Found \${prs.length} PR headers in Odoo for User ID 34.\`);

  const prMap = new Map(prs.map(p => [p.id, p]));
  const allLineIds = prs.flatMap(p => p.line_ids || []);

  console.log(\`Fetching details for \${allLineIds.length} PR line items...\`);

  // Fetch PR lines in batches of 200
  const batchSize = 200;
  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < allLineIds.length; i += batchSize) {
    const chunkIds = allLineIds.slice(i, i + batchSize);
    const lines = await queryOdoo('purchase.request.line', 'search_read', [
      [['id', 'in', chunkIds]]
    ], {
      fields: ['id', 'request_id', 'product_id', 'name', 'product_qty', 'estimated_cost', 'purchase_lines']
    });

    for (const line of lines) {
      const lineName = (line.name || '').trim();
      if (!lineName) continue;

      const prHeader = Array.isArray(line.request_id) ? prMap.get(line.request_id[0]) : null;
      const prNo = prHeader ? prHeader.name : (Array.isArray(line.request_id) ? line.request_id[1] : null);
      const prState = prHeader ? mapPrState(prHeader.state) : 'DRAFT';
      const prDate = prHeader?.date_start ? new Date(prHeader.date_start) : new Date();

      // Check linked PO if purchase_lines exist
      let linkedPoNo = null;
      let linkedPoVendor = null;
      let linkedPoStatus = null;

      if (Array.isArray(line.purchase_lines) && line.purchase_lines.length > 0) {
        try {
          const poLines = await queryOdoo('purchase.order.line', 'search_read', [
            [['id', 'in', line.purchase_lines]]
          ], {
            fields: ['order_id']
          });
          if (poLines && poLines.length > 0) {
            const poId = Array.isArray(poLines[0].order_id) ? poLines[0].order_id[0] : poLines[0].order_id;
            const poHeaders = await queryOdoo('purchase.order', 'search_read', [
              [['id', '=', poId]]
            ], {
              fields: ['name', 'partner_id', 'state']
            });
            if (poHeaders && poHeaders.length > 0) {
              linkedPoNo = poHeaders[0].name;
              linkedPoVendor = Array.isArray(poHeaders[0].partner_id) ? poHeaders[0].partner_id[1] : null;
              linkedPoStatus = poHeaders[0].state === 'done' ? 'DONE' : 'PO';
            }
          }
        } catch (e) {}
      }

      // Check if already exists in DB by nomorPr and originalName
      const existing = await prisma.procurementTracking.findFirst({
        where: {
          nomorPr: prNo,
          originalName: lineName
        }
      });

      if (!existing) {
        const matchedSp = await prisma.sparepart.findFirst({
          where: {
            aktif: true,
            OR: [
              { nama: { equals: lineName, mode: 'insensitive' } },
              { namaAlias: { equals: lineName, mode: 'insensitive' } }
            ]
          }
        });

        await prisma.procurementTracking.create({
          data: {
            originalName: lineName,
            sparepartId: matchedSp ? matchedSp.id : null,
            qty: Math.round(Number(line.product_qty) || 1),
            harga: Number(line.estimated_cost) || 0,
            nomorPr: prNo,
            statusPr: linkedPoStatus === 'DONE' ? 'RECEIVED' : prState,
            nomorPo: linkedPoNo,
            statusPo: linkedPoStatus,
            vendor: linkedPoVendor,
            tanggalList: prDate,
            productCategory: 'Sparepart',
            urgency: 'Normal',
            isStocked: true,
          }
        });
        createdCount++;
      } else {
        await prisma.procurementTracking.update({
          where: { id: existing.id },
          data: {
            statusPr: linkedPoStatus === 'DONE' ? 'RECEIVED' : prState,
            ...(linkedPoNo ? { nomorPo: linkedPoNo } : {}),
            ...(linkedPoStatus ? { statusPo: linkedPoStatus } : {}),
            ...(linkedPoVendor ? { vendor: linkedPoVendor } : {}),
            ...(Number(line.estimated_cost) > 0 ? { harga: Number(line.estimated_cost) } : {}),
          }
        });
        updatedCount++;
      }
    }
  }

  const finalTotal = await prisma.procurementTracking.count();
  console.log(\`User ID 34 Sync Complete! Created: \${createdCount}, Updated: \${updatedCount}. Total items in DB NOW: \${finalTotal}\`);
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=300)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
