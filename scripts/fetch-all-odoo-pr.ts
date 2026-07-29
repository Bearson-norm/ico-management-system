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
    console.log('Jalankan: npx ts-node --project tsconfig.scripts.json scripts/fetch-all-odoo-pr.ts <YOUR_SESSION_ID>\n');
    process.exit(1);
  }

  console.log('==================================================');
  console.log('UJI BATASAN DATA & PERFORMANCE DARI ODOO');
  console.log('==================================================\n');

  // LANGKAH 1: Hitung total record di Odoo menggunakan 'search_count'
  let totalRequests = 0;
  let totalRequisitions = 0;
  
  try {
    console.log('1. Menghitung total data di model "purchase.request"...');
    totalRequests = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.request',
      'search_count',
      [[]]
    );
    console.log(`   -> Total record "purchase.request" di Odoo: ${totalRequests} records.`);
  } catch (e: any) {
    console.error(`   ❌ Gagal menghitung purchase.request: ${e.message || e}`);
  }

  try {
    console.log('2. Menghitung total data di model "purchase.requisition"...');
    totalRequisitions = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition',
      'search_count',
      [[]]
    );
    console.log(`   -> Total record "purchase.requisition" di Odoo: ${totalRequisitions} records.`);
  } catch (e: any) {
    console.error(`   ❌ Gagal menghitung purchase.requisition: ${e.message || e}`);
  }

  console.log('\n--------------------------------------------------\n');

  // LANGKAH 2: Pengujian Kecepatan & Batasan (Fetch dengan ukuran limit berbeda)
  // Kita coba uji mengambil data "purchase.requisition" dengan batasan limit 100, 1000, 3000, dan 5000 record.
  const limitTests = [100, 1000, 3000, 5000];

  for (const limit of limitTests) {
    console.log(`Menguji mengambil ${limit} data dari "purchase.requisition"...`);
    const startTime = Date.now();

    try {
      const data = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.requisition',
        'search_read',
        [[]],
        {
          fields: ['id', 'name', 'state', 'create_date'],
          limit: limit,
          order: 'create_date desc'
        }
      );
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`   ✅ BERHASIL: Mengambil ${data.length} record dalam ${duration} detik.`);
      
      // Ukuran perkiraan data dalam KB/MB
      const sizeInBytes = Buffer.byteLength(JSON.stringify(data));
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      console.log(`   -> Ukuran payload transfer: ${sizeInKB} KB`);
    } catch (e: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`   ❌ GAGAL setelah ${duration} detik: ${e.message || e}`);
    }
    console.log();
  }

  // LANGKAH 3: Ambil sample data lengkap (seluruh field) dan tulis ke file
  console.log('--------------------------------------------------');
  console.log('3. Mengambil sample data PR lengkap (seluruh field)...');
  
  try {
    // 3.1. Requisition
    console.log('   -> Mengambil 5 sample "purchase.requisition"...');
    const requisitionsSample = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition',
      'search_read',
      [[]],
      {
        limit: 5,
        order: 'create_date desc'
      }
    );
    const requisitionFilePath = path.join(__dirname, 'odoo-requisition-sample.json');
    fs.writeFileSync(requisitionFilePath, JSON.stringify(requisitionsSample, null, 2));
    console.log(`   ✅ BERHASIL: Menyimpan sample ke scripts/odoo-requisition-sample.json`);

    // 3.2. Dapatkan skema field lengkap untuk purchase.request (metadata)
    console.log('   -> Mengambil daftar field lengkap (schema) untuk "purchase.request"...');
    try {
      const requestFields = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.request',
        'fields_get',
        [],
        { attributes: ['string', 'type', 'relation'] }
      );
      const requestFieldsPath = path.join(__dirname, 'odoo-request-fields.json');
      fs.writeFileSync(requestFieldsPath, JSON.stringify(requestFields, null, 2));
      console.log(`   ✅ BERHASIL: Menyimpan skema field ke scripts/odoo-request-fields.json`);
    } catch (fieldsErr: any) {
      console.error(`   ❌ Gagal mengambil skema field purchase.request: ${fieldsErr.message || fieldsErr}`);
    }

    // 3.3. Mengambil 5 sample "purchase.request" dengan fields yang aman
    console.log('   -> Mengambil 5 sample "purchase.request" dengan field aman...');
    try {
      const safeFields = ['id', 'name', 'state', 'create_date', 'description'];
      const requestsSampleSafe = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.request',
        'search_read',
        [[]],
        {
          fields: safeFields,
          limit: 5,
          order: 'create_date desc'
        }
      );
      const requestFilePath = path.join(__dirname, 'odoo-request-sample.json');
      fs.writeFileSync(requestFilePath, JSON.stringify(requestsSampleSafe, null, 2));
      console.log(`   ✅ BERHASIL: Menyimpan sample aman ke scripts/odoo-request-sample.json`);
    } catch (reqErr: any) {
      console.error(`   ❌ Gagal mengambil data sample purchase.request: ${reqErr.message || reqErr}`);
    }

    // 3.4. Simpan seluruh data (semua record) ke file JSON
    console.log('   -> Mendownload dan menyimpan seluruh data PR (semua record)...');
    try {
      // Ambil seluruh data purchase.request (402 record)
      const allRequests = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.request',
        'search_read',
        [[]],
        {
          fields: ['id', 'name', 'state', 'create_date', 'description'],
          limit: 10000,
          order: 'create_date desc'
        }
      );
      const allReqPath = path.join(__dirname, 'odoo-request-all.json');
      fs.writeFileSync(allReqPath, JSON.stringify(allRequests, null, 2));
      console.log(`   ✅ BERHASIL: Menyimpan ${allRequests.length} record ke scripts/odoo-request-all.json`);

      // Ambil seluruh data purchase.requisition (4097 record)
      const allRequisitions = await queryOdoo(
        odooUrl,
        sessionId,
        'purchase.requisition',
        'search_read',
        [[]],
        {
          fields: ['id', 'name', 'state', 'create_date', 'description', 'origin', 'vendor_id', 'type_id', 'ordering_date'],
          limit: 10000,
          order: 'create_date desc'
        }
      );
      const allReqiPath = path.join(__dirname, 'odoo-requisition-all.json');
      fs.writeFileSync(allReqiPath, JSON.stringify(allRequisitions, null, 2));
      console.log(`   ✅ BERHASIL: Menyimpan ${allRequisitions.length} record ke scripts/odoo-requisition-all.json`);
    } catch (dumpErr: any) {
      console.error(`   ❌ Gagal mendownload seluruh data: ${dumpErr.message || dumpErr}`);
    }

  } catch (err: any) {
    console.error(`   ❌ Gagal mengambil sample data: ${err.message || err}`);
  }

  console.log('--------------------------------------------------');
  console.log('KESIMPULAN BATASAN API ODOO:');
  console.log('1. Hubungan timeout server: Default fetch timeout Next.js/Node biasanya 30-60 detik.');
  console.log('2. Ukuran payload: Mengambil ribuan data sekaligus bisa membuat server Odoo overload/timeout.');
  console.log('3. Best practice: Selalu gunakan pagination (offset + limit) atau filter tanggal (create_date) seperti yang digunakan di API Sync Anda.');
  console.log('==================================================');
}

main();
