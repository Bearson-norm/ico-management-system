/**
 * Script Uji Coba Pencarian Good Received (GR) di Odoo (Debug Mode)
 * 
 * Cara Menjalankan:
 * node scripts/test-odoo-gr.js <SESSION_ID_KAMU> <NOMOR_PO_ATAU_GR>
 */

const sessionId = process.argv[2];
const poOrGrNumber = process.argv[3];

if (!sessionId) {
  console.error("\x1b[31mError: Silakan masukkan session_id dari cookie Odoo Anda!\x1b[0m");
  console.log("\nCara menjalankan script:");
  console.log("  node scripts/test-odoo-gr.js \x1b[36m<SESSION_ID_ANDA> [NOMOR_PO_ATAU_GR]\x1b[0m\n");
  process.exit(1);
}

// Helper untuk melakukan query ke Odoo
async function queryOdoo(model, method, args, kwargs = {}) {
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
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  
  return json.result;
}

async function run() {
  console.log("\x1b[33m[1/3] Menghubungkan ke Odoo dan mengambil struktur tabel Good Received...\x1b[0m");
  
  try {
    // 1. Dapatkan daftar field asli dari model good.received agar tidak salah nama field
    console.log("🔍 Meminta deskripsi field dari model 'good.received'...");
    const fieldsInfo = await queryOdoo("good.received", "fields_get", [], {
      attributes: ["string", "type"]
    });

    console.log("\x1b[32m✓ Berhasil mengambil info model!\x1b[0m");
    console.log("\nDaftar field yang tersedia di model 'good.received':");
    console.log("------------------------------------------------------------------");
    
    // Cari field yang bertipe relasi ke purchase.order atau yang berlabel "Purchase"
    let possiblePurchaseFields = [];
    Object.keys(fieldsInfo).forEach(fieldName => {
      const field = fieldsInfo[fieldName];
      console.log(` - \x1b[36m${fieldName}\x1b[0m: ${field.string} (${field.type})`);
      if (field.string?.toLowerCase()?.includes("purchase") || fieldName.toLowerCase().includes("purchase")) {
        possiblePurchaseFields.push(fieldName);
      }
    });
    console.log("------------------------------------------------------------------");
    console.log("Field terkait 'Purchase' yang dicurigai:", possiblePurchaseFields);
    console.log("==================================================================\n");

    // 2. Coba cari data menggunakan salah satu record saja (tanpa filter domain) untuk melihat sampel data
    console.log("\x1b[33m[2/3] Mengambil 1 record contoh dari Good Received...\x1b[0m");
    const sampleRecords = await queryOdoo("good.received", "search_read", [[]], {
      limit: 1
    });

    if (sampleRecords && sampleRecords.length > 0) {
      const sample = sampleRecords[0];
      console.log("\x1b[32m✓ Contoh Record Teratas:\x1b[0m");
      console.log(JSON.stringify(sample, null, 2));
    } else {
      console.log("❌ Tidak ada record Good Received sama sekali di Odoo.");
    }

    // 3. Jika user memasukkan nomor PO, coba lakukan pencarian cerdas dengan field relasi yang tepat
    if (poOrGrNumber && sampleRecords && sampleRecords.length > 0) {
      const searchVal = poOrGrNumber.trim();
      console.log(`\n\x1b[33m[3/3] Mencari dokumen Good Received untuk "${searchVal}"...\x1b[0m`);
      
      // Pilih field pencarian relasi PO. Biasanya 'purchase_id', 'purchase_order', atau 'purchase'
      // Dari output fieldsInfo nanti kita akan tau nama aslinya.
      // Untuk script ini, kita coba cari berdasarkan 'name' atau field-field terkait purchase yang bertipe many2one/char.
      let domain = [];
      
      // Coba tebak field PO. Jika 'purchase_id' ada di fieldsInfo, pakai itu.
      const targetField = fieldsInfo.purchase_id ? 'purchase_id' : (fieldsInfo.purchase ? 'purchase' : null);
      
      if (targetField) {
        // Many2one field di Odoo dicocokkan dengan '=' untuk ID, atau 'ilike' jika Odoo mengizinkan coersing (biasanya name_search)
        // Kita coba cari name matching
        domain = [
          '|',
          ['name', 'ilike', searchVal],
          [targetField, 'ilike', searchVal]
        ];
      } else {
        domain = [['name', 'ilike', searchVal]];
      }

      console.log(`Menggunakan domain pencarian: ${JSON.stringify(domain)}`);
      
      try {
        const results = await queryOdoo("good.received", "search_read", [domain], { limit: 5 });
        console.log(`\x1b[32m✓ Ditemukan ${results.length} record:\x1b[0m`);
        console.log(JSON.stringify(results, null, 2));
      } catch (searchErr) {
        console.error("❌ Gagal mencari dengan domain tersebut:", searchErr.message);
        console.log("Mencoba mencari semua record (limit 10) lalu memfilter secara lokal di Node.js...");
        
        const allRecords = await queryOdoo("good.received", "search_read", [[]], { limit: 100 });
        const filtered = allRecords.filter(r => {
          const nameStr = String(r.name || r.display_name || '').toLowerCase();
          const purchaseVal = r.purchase_id ? String(Array.isArray(r.purchase_id) ? r.purchase_id[1] : r.purchase_id).toLowerCase() : '';
          const purchaseVal2 = r.purchase ? String(Array.isArray(r.purchase) ? r.purchase[1] : r.purchase).toLowerCase() : '';
          
          return nameStr.includes(searchVal.toLowerCase()) || 
                 purchaseVal.includes(searchVal.toLowerCase()) ||
                 purchaseVal2.includes(searchVal.toLowerCase());
        });
        
        console.log(`\x1b[32m✓ Hasil filter lokal (Ditemukan ${filtered.length} record):\x1b[0m`);
        console.log(JSON.stringify(filtered.slice(0, 5), null, 2));
      }
    }

  } catch (error) {
    console.error("\n\x1b[31m❌ Terjadi kesalahan:\x1b[0m");
    console.error(error.message || error);
  }
}

run();
