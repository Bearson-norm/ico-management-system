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

const NON_MTC_KEYWORDS = [
  'lollipop', 'lolipop', 'neon box', 'vapestore', 'vape store', 'wus vape', 'montir vape',
  'media placement', 'sponsorship', 'marketing supplies', 'promo', 'billboard', 'booth',
  'event', 'influencer', 'endorse', 'branding', 'flyer', 'brosur', 'banner', 'aroma', 'flavor', 'pg', 'vg'
];

function isNonMtc(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return NON_MTC_KEYWORDS.some(k => lower.includes(k));
}

function mapState(state) {
  switch(state) {
    case 'draft': return { pr: 'DRAFT', po: 'DRAFT' };
    case 'sent': return { pr: 'DRAFT', po: 'RFQ' };
    case 'to approve': return { pr: 'TO_APPROVE', po: 'TO_APPROVE' };
    case 'purchase': return { pr: 'APPROVED', po: 'PO' };
    case 'done': return { pr: 'RECEIVED', po: 'DONE' };
    case 'cancel': return { pr: 'CANCELLED', po: 'CANCELLED' };
    default: return { pr: 'DRAFT', po: 'DRAFT' };
  }
}

async function main() {
  console.log('Starting full Odoo PO import for MTC Maintenance & Spareparts...');

  // Query PO lines from Odoo with MTC keywords or categories
  const keywords = ['sparepart', 'maintenance', 'mesin', 'bearing', 'belt', 'tis', 'baut', 'mur', 'silicone', 'lubricant', 'kabel', 'filter', 'fitting', 'pneumatic', 'seal', 'sensor', 'inverter', 'motor', 'valve', 'pump', 'pompa', 'pipa', 'lampu', 'steker', 'mcb', 'trafo', 'chain', 'sprocket', 'gear', 'pulley', 'fan', 'blower', 'heater', 'thermostat', 'relay', 'contactor', 'breaker', 'fuse', 'coupler', 'cylinder', 'fitting', 'hose', 'selang', 'nozzle', 'blade', 'pisau', 'cutter', 'cleaner', 'grease', 'oli', 'oil', 'tool', 'kunci', 'tang', 'obeng', 'bor', 'las', 'grinda', 'amplas', 'lakban', 'tape', 'majun', 'sarung tangan', 'kacamata safety', 'helm', 'sepatu safety', 'akrilik', 'acrylic', 'polycarbonate', 'plat', 'besi', 'stainles', 'stainless', 'alumunium', 'aluminium', 'siku', 'hollow', 'pipa', 'as', 'shaft'];

  const domain = ['|', '|', '|', '|', '|', '|', '|', '|', '|', '|',
    ['name', 'ilike', 'sparepart'],
    ['name', 'ilike', 'maintenance'],
    ['name', 'ilike', 'mesin'],
    ['name', 'ilike', 'bearing'],
    ['name', 'ilike', 'belt'],
    ['name', 'ilike', 'tis'],
    ['name', 'ilike', 'baut'],
    ['name', 'ilike', 'mur'],
    ['name', 'ilike', 'selang'],
    ['name', 'ilike', 'kabel'],
    ['name', 'ilike', 'valve']
  ];

  const lines = await queryOdoo('purchase.order.line', 'search_read', [domain], {
    fields: ['id', 'order_id', 'name', 'product_id', 'product_qty', 'price_unit', 'price_subtotal', 'date_planned'],
    limit: 1000,
    order: 'id desc'
  });

  console.log(\`Retrieved \${lines.length} candidate MTC PO lines from Odoo.\`);

  // Extract unique PO IDs
  const orderIds = Array.from(new Set(lines.map(l => Array.isArray(l.order_id) ? l.order_id[0] : l.order_id))).filter(Boolean);
  
  // Fetch PO headers
  const orders = await queryOdoo('purchase.order', 'search_read', [
    [['id', 'in', orderIds]]
  ], {
    fields: ['id', 'name', 'date_order', 'state', 'partner_id']
  });

  const orderMap = new Map(orders.map(o => [o.id, o]));

  let createdCount = 0;
  let updatedCount = 0;

  for (const line of lines) {
    const itemOriginalName = (line.name || '').trim();
    if (!itemOriginalName || isNonMtc(itemOriginalName)) continue;

    const poId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
    const poHeader = orderMap.get(poId);
    if (!poHeader) continue;

    const poNumber = poHeader.name || null;

    // Extract PR number from line description if present (e.g. "PR04699" or "PR04111")
    const prMatch = itemOriginalName.match(/\b(PR\d{5}|TE\d{5})\b/i) || (poHeader.name || '').match(/\b(PR\d{5}|TE\d{5})\b/i);
    const prNumber = prMatch ? prMatch[1].toUpperCase() : null;

    const vendorName = Array.isArray(poHeader.partner_id) ? poHeader.partner_id[1] : null;
    const st = mapState(poHeader.state);

    const existing = await prisma.procurementTracking.findFirst({
      where: {
        nomorPo: poNumber,
        originalName: itemOriginalName
      }
    });

    if (!existing) {
      // Find matching sparepart
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
          nomorPr: prNumber,
          nomorPo: poNumber,
          statusPr: st.pr,
          statusPo: st.po,
          vendor: vendorName,
          tanggalList: poHeader.date_order ? new Date(poHeader.date_order) : new Date(),
          tanggalTerima: line.date_planned ? new Date(line.date_planned) : (poHeader.date_order ? new Date(poHeader.date_order) : new Date()),
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
          statusPr: st.pr,
          statusPo: st.po,
          vendor: vendorName || existing.vendor,
          harga: Number(line.price_unit) || existing.harga,
        }
      });
      updatedCount++;
    }
  }

  const finalTotal = await prisma.procurementTracking.count();
  console.log(\`Full Odoo Import finished! Created: \${createdCount}, Updated: \${updatedCount}. Total procurement records in DB NOW: \${finalTotal}\`);
}

main().finally(() => prisma.\$disconnect());
"
"""

_, stdout, stderr = ssh.exec_command(f"cd /var/www/ico-management-system && {cmd}", timeout=300)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
