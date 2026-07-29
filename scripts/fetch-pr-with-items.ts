import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';
import * as fs from 'fs';
import * as path from 'path';

async function queryOdoo(
  odooUrl: string,
  sessionId: string,
  model: string,
  method: string,
  args: any[],
  kwargs: any = {}
) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model,
      method,
      args,
      kwargs
    },
    id: Math.floor(Math.random() * 10000)
  };

  const res = await fetch(`${odooUrl}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sessionId}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`HTTP Error! Status: ${res.status}`);
  }

  const json: any = await res.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }

  return json.result;
}

async function main() {
  const odooUrl = 'https://foomx.odoo.com';
  
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();
  
  let sessionId = process.argv[2] || process.env.ODOO_SESSION_ID || '';
  
  if (!sessionId) {
    try {
      const gaSettings = await ga.gaSetting.findMany();
      sessionId = gaSettings.find(s => s.key === 'ga_odoo_session_id')?.value || '';
      if (!sessionId) {
        const mtcSettings = await mtc.mtcSetting.findMany();
        sessionId = mtcSettings.find(s => s.key === 'mtc_odoo_session_id')?.value || '';
      }
    } catch (e) {
      // Ignored
    } finally {
      await mtc.$disconnect();
      await ga.$disconnect();
    }
  }

  if (!sessionId) {
    console.error('\n[ERROR] session_id tidak ditemukan!');
    process.exit(1);
  }

  console.log('==================================================');
  console.log('MENGAMBIL DATA PR LENGKAP BESERTA NAMA BARANG');
  console.log('==================================================\n');

  // ==========================================
  // BAGIAN 1: PROSES PURCHASE REQUEST (PR Biasa)
  // ==========================================
  try {
    console.log('1. Mengambil 100 "purchase.request" terbaru...');
    const requests = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.request',
      'search_read',
      [[]],
      {
        fields: ['id', 'name', 'state', 'create_date', 'description'],
        limit: 100,
        order: 'create_date desc'
      }
    );

    if (requests && requests.length > 0) {
      const requestIds = requests.map((r: any) => r.id);
      
      console.log(`   -> Mengambil line items untuk ${requests.length} PR sekaligus...`);
      const lines = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.request.line',
        'search_read',
        [[['request_id', 'in', requestIds]]],
        {
          fields: ['request_id', 'product_id', 'product_qty', 'name'],
          limit: 1000
        }
      );

      console.log('   -> Menggabungkan PR dengan Item Barang...');
      const requestsWithItems = requests.map((req: any) => {
        const prLines = lines.filter((l: any) => l.request_id && l.request_id[0] === req.id);
        return {
          id: req.id,
          nomorPr: req.name,
          status: req.state,
          tanggalDibuat: req.create_date,
          deskripsi: req.description,
          totalItems: prLines.length,
          items: prLines.map((l: any) => ({
            productId: l.product_id ? l.product_id[0] : null,
            namaBarang: l.product_id ? l.product_id[1] : null,
            deskripsiBarang: l.name || null,
            qty: l.product_qty
          }))
        };
      });

      const outputPath = path.join(__dirname, 'odoo-request-with-items.json');
      fs.writeFileSync(outputPath, JSON.stringify(requestsWithItems, null, 2));
      console.log(`   ✅ BERHASIL: Hasil disimpan di scripts/odoo-request-with-items.json`);
    }
  } catch (err: any) {
    console.error(`   ❌ Gagal memproses purchase.request: ${err.message || err}`);
  }

  console.log('\n--------------------------------------------------\n');

  // ==========================================
  // BAGIAN 2: PROSES PURCHASE REQUISITION (Tender)
  // ==========================================
  try {
    console.log('2. Mengambil skema kolom "purchase.requisition.line"...');
    // Kita cari dulu field apa saja yang valid di model ini agar tidak server error
    const reqLineFields = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition.line',
      'fields_get',
      [],
      { attributes: ['string', 'type'] }
    );
    const reqLineFieldsPath = path.join(__dirname, 'odoo-requisition-line-fields.json');
    fs.writeFileSync(reqLineFieldsPath, JSON.stringify(reqLineFields, null, 2));
    
    // Tentukan field mana yang aman di-query (product_id biasanya ada, qty/volume/product_qty harus dicek)
    const validFields = Object.keys(reqLineFields);
    const lineFieldsToQuery = ['requisition_id', 'product_id'];
    if (validFields.includes('product_description_variants')) lineFieldsToQuery.push('product_description_variants');
    if (validFields.includes('name')) lineFieldsToQuery.push('name');
    if (validFields.includes('product_qty')) lineFieldsToQuery.push('product_qty');
    else if (validFields.includes('qty')) lineFieldsToQuery.push('qty');
    if (validFields.includes('price_unit')) lineFieldsToQuery.push('price_unit');

    console.log(`   -> Fields yang digunakan untuk query requisition line: ${JSON.stringify(lineFieldsToQuery)}`);

    console.log('   -> Mengambil 100 "purchase.requisition" terbaru...');
    const requisitions = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition',
      'search_read',
      [[]],
      {
        fields: ['id', 'name', 'state', 'create_date', 'description', 'origin', 'vendor_id'],
        limit: 100,
        order: 'create_date desc'
      }
    );

    if (requisitions && requisitions.length > 0) {
      const requisitionIds = requisitions.map((r: any) => r.id);
      
      console.log(`   -> Mengambil line items untuk ${requisitions.length} PR Tender...`);
      const lines = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.requisition.line',
        'search_read',
        [[['requisition_id', 'in', requisitionIds]]],
        {
          fields: lineFieldsToQuery,
          limit: 1000
        }
      );

      console.log('   -> Menggabungkan PR Tender dengan Item Barang...');
      const requisitionsWithItems = requisitions.map((req: any) => {
        const reqLines = lines.filter((l: any) => l.requisition_id && l.requisition_id[0] === req.id);
        return {
          id: req.id,
          nomorPrTender: req.name,
          prAsal: req.origin,
          status: req.state,
          vendor: req.vendor_id ? req.vendor_id[1] : null,
          tanggalDibuat: req.create_date,
          deskripsi: req.description,
          totalItems: reqLines.length,
          items: reqLines.map((l: any) => ({
            productId: l.product_id ? l.product_id[0] : null,
            namaBarang: l.product_id ? l.product_id[1] : 'N/A',
            deskripsiBarang: l.product_description_variants || l.name || 'N/A',
            qty: l.product_qty || l.qty || 0,
            hargaUnit: l.price_unit || 0
          }))
        };
      });

      const outputPath = path.join(__dirname, 'odoo-requisition-with-items.json');
      fs.writeFileSync(outputPath, JSON.stringify(requisitionsWithItems, null, 2));
      console.log(`   ✅ BERHASIL: Hasil disimpan di scripts/odoo-requisition-with-items.json`);
    }
  } catch (err: any) {
    console.error(`   ❌ Gagal memproses purchase.requisition: ${err.message || err}`);
  }
  
  console.log('\n==================================================');
}

main();
