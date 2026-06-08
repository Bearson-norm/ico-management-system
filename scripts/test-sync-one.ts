import { PrismaClient } from '../lib/generated/mtc';

const sessionId = process.argv[2];
const poNoToSync = 'P12989';

if (!sessionId) {
  console.error("Masukkan session_id!");
  process.exit(1);
}

// Map Odoo's state to our local statusPr values
function mapOdooStateToLocal(state: string): string {
  switch (state) {
    case 'draft': return 'RFQ';
    case 'sent': return 'RFQ';
    case 'to approve': return 'TO_APPROVE';
    case 'purchase': return 'PO';
    case 'done': return 'PO';
    case 'cancel': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

async function queryOdoo(model: string, method: string, args: any[], kwargs: any = {}) {
  const response = await fetch("https://foomx.odoo.com/web/dataset/call_kw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `session_id=${sessionId}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs }
    })
  });
  
  const json = await response.json() as any;
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const item = await prisma.procurementTracking.findFirst({
      where: { nomorPo: poNoToSync }
    });

    if (!item) {
      console.log(`PO ${poNoToSync} tidak ditemukan di DB lokal.`);
      return;
    }

    console.log("=== DB Record Sebelum Sync ===");
    console.log(`Nomor PO: ${item.nomorPo}`);
    console.log(`Status PO: ${item.statusPo}`);
    console.log(`Tanggal Terima: ${item.tanggalTerima}`);
    console.log(`Vendor: ${item.vendor}`);

    console.log("\n=== Menghubungi Odoo... ===");
    // 1. Cari PO
    const odooPos = await queryOdoo(
      'purchase.order',
      'search_read',
      [[['name', '=', poNoToSync]]],
      {
        fields: ['id', 'name', 'state', 'partner_id', 'amount_total'],
        limit: 1
      }
    );

    if (!odooPos || odooPos.length === 0) {
      console.log("PO tidak ditemukan di Odoo.");
      return;
    }

    const odooPo = odooPos[0];
    const poId = odooPo.id;
    const vendorName = Array.isArray(odooPo.partner_id) ? odooPo.partner_id[1] : null;
    const odooState = odooPo.state;
    const localStatusPr = mapOdooStateToLocal(odooState);

    console.log(`PO ditemukan di Odoo. ID: ${poId}, State: ${odooState}, Vendor: ${vendorName}`);

    // 2. Cari Good Received
    let odooGrDate: Date | null = null;
    let isGrDone = false;
    let odooGrLink: string | null = null;

    const odooGrs = await queryOdoo(
      'good.received',
      'search_read',
      [[['purchase_id', '=', poId]]],
      {
        fields: ['id', 'state', 'write_date', 'name'],
        limit: 1
      }
    );

    if (odooGrs && odooGrs.length > 0) {
      const odooGr = odooGrs[0];
      odooGrLink = `https://foomx.odoo.com/web#id=${odooGr.id}&model=good.received&view_type=form`;
      console.log(`GR Ditemukan: ${odooGr.name}, State: ${odooGr.state}, Write Date: ${odooGr.write_date}`);
      if (odooGr.state === 'done') {
        isGrDone = true;
        if (odooGr.write_date) {
          odooGrDate = new Date(odooGr.write_date);
        }
      }
    } else {
      console.log("GR tidak ditemukan untuk PO ini.");
    }

    console.log("\n=== Mengupdate Database Lokal... ===");
    const updateData: any = {
      statusPr: localStatusPr,
      vendor: vendorName || item.vendor,
    };

    if (isGrDone) {
      updateData.statusPo = 'DONE';
      if (odooGrDate) updateData.tanggalTerima = odooGrDate;
      if (odooGrLink) updateData.linkGr = odooGrLink;
    }

    const updated = await prisma.procurementTracking.update({
      where: { id: item.id },
      data: updateData
    });

    console.log("=== DB Record Setelah Sync ===");
    console.log(`Nomor PO: ${updated.nomorPo}`);
    console.log(`Status PO: ${updated.statusPo}`);
    console.log(`Tanggal Terima: ${updated.tanggalTerima}`);
    console.log(`Vendor: ${updated.vendor}`);
    console.log(`Link GR: ${updated.linkGr}`);

  } catch (err: any) {
    console.error('Error:', err.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
