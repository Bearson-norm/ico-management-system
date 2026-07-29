import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

// Helper untuk query RPC Odoo menggunakan session_id
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
  const odooUrl = 'https://foomx.odoo.com'; // Odoo instance URL
  
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();
  
  let sessionId = process.argv[2] || process.env.ODOO_SESSION_ID || '';
  
  if (!sessionId) {
    try {
      console.log('Mencari session_id dari database settings...');
      
      const gaSettings = await ga.gaSetting.findMany();
      const gaSession = gaSettings.find(s => s.key === 'ga_odoo_session_id')?.value;
      
      if (gaSession) {
        sessionId = gaSession;
        console.log(`Menemukan session_id dari GA settings: ${sessionId.substring(0, 8)}...`);
      } else {
        const mtcSettings = await mtc.mtcSetting.findMany();
        const mtcSession = mtcSettings.find(s => s.key === 'mtc_odoo_session_id')?.value;
        if (mtcSession) {
          sessionId = mtcSession;
          console.log(`Menemukan session_id dari MTC settings: ${sessionId.substring(0, 8)}...`);
        }
      }
    } catch (e) {
      console.log('Info: Gagal memuat database settings.');
    } finally {
      await mtc.$disconnect();
      await ga.$disconnect();
    }
  }

  if (!sessionId) {
    console.error('\n[ERROR] session_id tidak ditemukan!');
    console.log('\nSilakan jalankan script dengan memberikan session_id sebagai argumen:');
    console.log('npx ts-node --project tsconfig.scripts.json scripts/check-odoo-pr.ts <YOUR_SESSION_ID>\n');
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`Mengambil data PR dari Odoo (${odooUrl})...`);
  console.log(`==================================================\n`);

  // 1. Mencoba mengambil data dari purchase.requisition
  try {
    console.log('--- MENGAMBIL 5 PR TERBARU DARI "purchase.requisition" ---');
    const requisitions = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition',
      'search_read',
      [[]], // Filter kosong untuk mengambil semua
      {
        fields: ['id', 'name', 'state', 'create_date', 'description', 'create_uid'],
        order: 'create_date desc',
        limit: 5
      }
    );

    if (requisitions && requisitions.length > 0) {
      console.log(`Ditemukan ${requisitions.length} PR Requisitions:`);
      for (const req of requisitions) {
        console.log(`\n🔹 ID: ${req.id} | Nomor PR: ${req.name} | Status: ${req.state}`);
        console.log(`   Tanggal Dibuat: ${req.create_date}`);
        console.log(`   Pembuat (UID): ${JSON.stringify(req.create_uid)}`);
        console.log(`   Deskripsi     : ${req.description || 'N/A'}`);
        
        // Ambil baris produk jika ada
        try {
          const lines = await queryOdoo(
            odooUrl,
            sessionId,
            'purchase.requisition.line',
            'search_read',
            [[['requisition_id', '=', req.id]]],
            { fields: ['product_id', 'product_qty', 'price_unit', 'name'], limit: 5 }
          );
          if (lines && lines.length > 0) {
            console.log(`   Line Items (${lines.length} items):`);
            for (const line of lines) {
              const productName = Array.isArray(line.product_id) ? line.product_id[1] : line.name;
              console.log(`     - [Qty: ${line.product_qty}] ${productName} (Harga Satuan: ${line.price_unit})`);
            }
          } else {
            console.log('   Line Items: Kosong atau tidak ditemukan.');
          }
        } catch (lineErr: any) {
          console.log(`   Gagal mengambil line items: ${lineErr.message || lineErr}`);
        }
      }
    } else {
      console.log('Tidak ditemukan data di purchase.requisition.');
    }
  } catch (err: any) {
    console.error('Gagal mengambil data dari purchase.requisition:', err.message || err);
  }

  console.log('\n--------------------------------------------------\n');

  // 2. Mencoba mengambil data dari purchase.request (jika modul ini terpasang)
  try {
    console.log('--- MENGAMBIL 5 PR TERBARU DARI "purchase.request" ---');
    const requests = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.request',
      'search_read',
      [[]], // Filter kosong untuk mengambil semua
      {
        fields: ['id', 'name', 'state', 'create_date', 'description', 'requested_by'],
        order: 'create_date desc',
        limit: 5
      }
    );

    if (requests && requests.length > 0) {
      console.log(`Ditemukan ${requests.length} Purchase Requests:`);
      for (const req of requests) {
        console.log(`\n🔹 ID: ${req.id} | Nomor PR: ${req.name} | Status: ${req.state}`);
        console.log(`   Tanggal Dibuat: ${req.create_date}`);
        console.log(`   Pembuat       : ${JSON.stringify(req.requested_by)}`);
        console.log(`   Deskripsi     : ${req.description || 'N/A'}`);
        
        // Ambil baris produk jika ada
        try {
          const lines = await queryOdoo(
            odooUrl,
            sessionId,
            'purchase.request.line',
            'search_read',
            [[['request_id', '=', req.id]]],
            { fields: ['product_id', 'product_qty', 'name'], limit: 5 }
          );
          if (lines && lines.length > 0) {
            console.log(`   Line Items (${lines.length} items):`);
            for (const line of lines) {
              const productName = Array.isArray(line.product_id) ? line.product_id[1] : line.name;
              console.log(`     - [Qty: ${line.product_qty}] ${productName}`);
            }
          } else {
            console.log('   Line Items: Kosong atau tidak ditemukan.');
          }
        } catch (lineErr: any) {
          console.log(`   Gagal mengambil line items: ${lineErr.message || lineErr}`);
        }
      }
    } else {
      console.log('Tidak ditemukan data di purchase.request.');
    }
  } catch (err: any) {
    console.error('Gagal mengambil data dari purchase.request (Mungkin modul ini tidak di-install di Odoo Anda):', err.message || err);
  }
}

main();
